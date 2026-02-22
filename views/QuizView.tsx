
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Timer, RotateCw, ArrowLeft, XCircle, ChevronLeft, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card } from '../components/Card';
import { Topic, QuizQuestion, Repetition } from '../types';
import { callGeminiApiWithRetry } from '../services/gemini';
import { QUIZ_SYSTEM_INSTRUCTION, FALLBACK_QUIZ_INSTRUCTION, QUIZ_SCHEMA, SPACING_INTERVALS } from '../constants';
import { ensureTopicContent } from '../services/storage';
import { ErrorCard } from '../components/ErrorCard';
import katex from 'katex';
import DOMPurify from 'dompurify';

interface QuizViewProps {
    topic: Topic | null;
    userId: string;
    navigateTo: (view: string, data?: any, options?: { replace?: boolean }) => void;
    onUpdateTopic: (topic: Topic) => void;
    themeColor: string;
}

type QuizStatus = 'idle' | 'loading' | 'ready' | 'error';

export const QuizView: React.FC<QuizViewProps> = ({ topic, userId, navigateTo, onUpdateTopic, themeColor }) => {
    // State Machine
    const [status, setStatus] = useState<QuizStatus>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    
    // Quiz Data
    const [quizData, setQuizData] = useState<QuizQuestion[] | null>(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<{ qIndex: number; selected: string; correct: string }[]>([]);
    const [timeTaken, setTimeTaken] = useState(0);
    const [timerRunning, setTimerRunning] = useState(false);
    const [isFallback, setIsFallback] = useState(false);
    const [isModelFallback, setIsModelFallback] = useState(false);
    
    // Lifecycle Guards
    const isMounted = useRef(true);
    const abortControllerRef = useRef<AbortController | null>(null);
    const generationAttemptedRef = useRef(false);
    const isSubmitting = useRef(false);

    // Session Persistence Key
    const sessionKey = topic ? `engram_quiz_progress_${topic.id}` : null;

    // --- Cleanup on Unmount ---
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            // Cancel any pending generation
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // --- Restoration & Initial Trigger ---
    useEffect(() => {
        if (!topic) return;

        // 1. Try to restore session
        if (sessionKey && status === 'idle' && !generationAttemptedRef.current) {
            try {
                const saved = sessionStorage.getItem(sessionKey);
                if (saved) {
                    const { index, savedAnswers, time, questions } = JSON.parse(saved);
                    if (questions && questions.length === 10) {
                        console.debug("[POPQUIZ] Restored session from storage");
                        setQuizData(questions);
                        setCurrentQuestionIndex(index);
                        setAnswers(savedAnswers);
                        setTimeTaken(time);
                        setStatus('ready');
                        generationAttemptedRef.current = true;
                        if (index < 10) setTimerRunning(true);
                        return;
                    }
                }
            } catch (e: any) {
                console.warn("Failed to load quiz session", e);
            }
        }

        // 2. If no session, trigger generation
        if (status === 'idle' && !generationAttemptedRef.current) {
            generateQuiz();
        }
    }, [topic, sessionKey]);

    // --- Persist State on Change ---
    useEffect(() => {
        if (sessionKey && status === 'ready' && quizData) {
            const state = {
                index: currentQuestionIndex,
                savedAnswers: answers,
                time: timeTaken,
                questions: quizData
            };
            sessionStorage.setItem(sessionKey, JSON.stringify(state));
        }
    }, [currentQuestionIndex, answers, timeTaken, quizData, sessionKey, status]);

    // --- Timer Logic ---
    useEffect(() => {
        let interval: any = null;
        if (timerRunning) {
            interval = setInterval(() => {
                setTimeTaken(t => t + 1);
            }, 1000);
        }
        return () => { if(interval) clearInterval(interval); };
    }, [timerRunning]);

    const renderMathHtml = (text: string) => {
        if (!text) return "";
        const blockMathRegex = /\$\$(.*?)\$\$/g;
        const inlineMathRegex = /\$(.*?)\$/g;
        let processedText = text;

        const blockMatches: string[] = [];
        processedText = processedText.replace(blockMathRegex, (match, formula) => {
            try {
                const html = katex.renderToString(formula, { displayMode: true, throwOnError: false });
                blockMatches.push(html);
                return `__BLOCK_MATH_${blockMatches.length - 1}__`;
            } catch (e: any) { return match; }
        });

        processedText = processedText.replace(inlineMathRegex, (match, formula) => {
            try {
                const html = katex.renderToString(formula, { displayMode: false, throwOnError: false });
                return html;
            } catch (e: any) { return match; }
        });

        blockMatches.forEach((html, index) => {
            processedText = processedText.replace(`__BLOCK_MATH_${index}__`, html);
        });

        return DOMPurify.sanitize(processedText);
    };

    // --- Core Generation Logic ---
    const generateQuiz = useCallback(async (forceRetry = false) => {
        if (!topic) {
            setErrorMessage("Topic not found.");
            setStatus('error');
            return;
        }

        if (!forceRetry && generationAttemptedRef.current) return;
        
        generationAttemptedRef.current = true;
        
        // Setup AbortController for Timeout
        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        // Reset State
        setStatus('loading');
        setErrorMessage(null);
        setQuizData(null);
        setAnswers([]);
        setTimeTaken(0);
        setTimerRunning(false);
        setIsModelFallback(false);

        console.debug("[POPQUIZ] start", { topicId: topic.id, userId });

        // 30 Second Timeout Race
        const timeoutId = setTimeout(() => {
            if (isMounted.current && status === 'loading') {
                console.warn("[POPQUIZ] Timeout triggered - aborting request");
                controller.abort();
                if (isMounted.current) {
                    setErrorMessage("The AI agent timed out. Please check your connection and try again.");
                    setStatus('error');
                }
            }
        }, 30000);

        try {
            // 1. Hydrate Content
            let fullTopic = topic;
            try {
                fullTopic = await ensureTopicContent(userId, topic);
            } catch (e: any) {
                console.warn("Failed to hydrate topic content", e);
            }

            // 2. Build Context (Difficulty, Mistakes)
            const notesAreSufficient = fullTopic.shortNotes && fullTopic.shortNotes.length >= 50;
            const repetitionLevel = fullTopic.repetitions?.length || 0;

            let difficultyContext = "Difficulty: Standard. Focus on factual recall.";
            if (repetitionLevel === 1 || repetitionLevel === 2) {
                difficultyContext = "Difficulty: Intermediate. Require application of concepts.";
            } else if (repetitionLevel > 2) {
                difficultyContext = "Difficulty: Advanced. Require critical thinking and synthesis.";
            }

            // Mistake Analysis
            const allMistakes = fullTopic.repetitions?.flatMap(r => 
                r.quizAttempt.questions.filter(q => {
                    const selected = q.userSelected;
                    const correct = q.correctAnswer || q.correct_answer_letter;
                    return selected && correct && selected !== correct && selected !== 'N/A';
                }).map(q => q.questionText || q.question)
            ) || [];
            
            const recentMistakes = [...new Set(allMistakes)].slice(-10);
            let mistakeContext = "";
            if (recentMistakes.length > 0) {
                mistakeContext = `\n\n--- WEAKNESSES ---\nPrioritize concepts from these previously missed questions (create NEW variations):\n- ${recentMistakes.join('\n- ')}`;
            }

            let prompt;
            if (notesAreSufficient) {
                setIsFallback(false);
                prompt = `Generate a 10-question multiple-choice quiz for '${fullTopic.topicName}' (${fullTopic.subject}).
                ${difficultyContext}
                ${mistakeContext}
                --- NOTES ---
                ${fullTopic.shortNotes}`;
            } else {
                setIsFallback(true);
                prompt = `Topic: ${fullTopic.topicName}. Subject: ${fullTopic.subject}. ${FALLBACK_QUIZ_INSTRUCTION(fullTopic.subject)}
                ${difficultyContext}
                ${mistakeContext}`;
            }

            // 3. Resolve Model from Prefs
            let model = 'gemini-2.5-flash'; // Safe Default
            let persona = "";
            try {
                const prefs = JSON.parse(localStorage.getItem('engram_ai_preferences') || '{}');
                const quizPrefs = prefs.quiz || {};
                if (quizPrefs.model) {
                    if (quizPrefs.model === 'flash') model = 'gemini-2.5-flash';
                    else if (quizPrefs.model === 'pro') model = 'gemini-2.5-pro';
                    else model = quizPrefs.model; // Explicit string
                }
                if (quizPrefs.persona) persona = quizPrefs.persona;
            } catch (e: any) {}

            console.debug("[POPQUIZ] request sent", { model });

            // 4. Call API with fallback retry logic
            const makeCall = async (modelToUse: string) => {
                const systemInstr = persona ? `${QUIZ_SYSTEM_INSTRUCTION}\n\nAdditional Style Instructions: ${persona}` : QUIZ_SYSTEM_INSTRUCTION;
                return await callGeminiApiWithRetry(
                    prompt, 
                    systemInstr, 
                    QUIZ_SCHEMA,
                    null, 
                    null, 
                    3, 
                    modelToUse,
                    'quiz'
                );
            };

            let data;
            try {
                data = await Promise.race([
                    makeCall(model),
                    new Promise((_, reject) => {
                        controller.signal.addEventListener('abort', () => reject(new Error("Aborted")));
                    })
                ]);
            } catch (firstError: any) {
                // FALLBACK LOGIC: If Pro/Preview fails, retry with Flash
                const isProOrPreview = model.includes('pro') || model.includes('preview');
                const isRecoverable = firstError.status === 404 || firstError.status === 400 || firstError.status === 429 || firstError.status === 503 || firstError.message?.includes('preview');
                
                if (isProOrPreview && isRecoverable && !controller.signal.aborted) {
                    console.debug("[QUIZ] Fallback to Flash");
                    setIsModelFallback(true);
                    data = await makeCall('gemini-2.5-flash');
                } else {
                    throw firstError;
                }
            }

            clearTimeout(timeoutId);

            if (!isMounted.current) return;

            if (data?.pop_quiz?.length === 10) {
                // SANITIZATION STEP START
                const cleanedQuiz = data.pop_quiz.map((q: any) => ({
                    ...q,
                    explanation: q.explanation
                        .replace(/(Let me re-read|Do not include|Note:|Step 1:|Thinking:).*/gi, '') // aggressive start-of-line garbage removal
                        .replace(/JSON string/gi, '')
                        .trim()
                }));
                // SANITIZATION STEP END

                console.debug("[POPQUIZ] success", { questionCount: cleanedQuiz.length });
                setQuizData(cleanedQuiz);
                setStatus('ready');
                setTimerRunning(true);
            } else {
                throw new Error("Invalid quiz format: Did not receive 10 questions.");
            }

        } catch (e: any) {
            clearTimeout(timeoutId);
            if (!isMounted.current) return;

            console.error("[POPQUIZ] error", { message: e.message, stack: e.stack });
            
            // Determine user-friendly error message
            let msg: string = "An unknown error occurred.";
            if (e.message === "Aborted") msg = "Generation timed out. Please try again.";
            else if (e.message?.includes("quota") || e.name === 'UsageLimitError') msg = (e.message as string) || "AI quota reached. Please check Settings.";
            else if (e.message) msg = String(e.message);

            setErrorMessage(msg);
            setStatus('error');
        }
    }, [topic, userId]);

    // --- Submission Logic ---
    const submitRepetition = async (score: number, finalTimeTaken: number, fullQuizData: QuizQuestion[], userAnswers: any[]) => {
        if (!topic || isSubmitting.current) return;
        isSubmitting.current = true;

        try {
            const lastRepetitionIndex = topic.repetitions?.length || 0;
            const intervalDays = SPACING_INTERVALS[lastRepetitionIndex] || 30;
            const nextReviewDate = new Date();
            nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);

            const quizAttemptData = {
                timeTakenSeconds: finalTimeTaken,
                score: score,
                isFallbackQuiz: isFallback,
                questions: fullQuizData.map((q, index) => ({
                    question: q.question,
                    correct_answer_letter: q.correct_answer_letter,
                    questionText: q.question,
                    options: q.options,
                    correctAnswer: q.correct_answer_letter,
                    explanation: q.explanation,
                    userSelected: userAnswers.find(a => a.qIndex === index)?.selected || 'N/A'
                }))
            };

            const repetitionData: Repetition = {
                dateCompleted: new Date().toISOString().split('T')[0],
                nextReviewDate: nextReviewDate.toISOString().split('T')[0],
                quizCompleted: true,
                score: score,
                totalQuestions: 10,
                quizAttempt: quizAttemptData
            };

            const updatedTopic = {
                ...topic,
                repetitions: [...(topic.repetitions || []), repetitionData]
            };

            onUpdateTopic(updatedTopic);

            console.debug("[POPQUIZ] complete -> replacing view with results");

            if (sessionKey) sessionStorage.removeItem(sessionKey);

            // Use replacement to prevent Back button from re-entering quiz
            navigateTo('quizReview', {
                topic: updatedTopic,
                quizAttempt: quizAttemptData,
                repetitionNumber: lastRepetitionIndex + 1
            }, { replace: true });

        } catch (e: any) {
            console.error("Error submitting repetition:", e);
            setErrorMessage("Error saving results. Check console.");
            setStatus('error');
            isSubmitting.current = false;
        }
    };

    // --- Interactions ---
    const handleAnswer = (selectedLetter: string) => {
        if (!quizData) return;
        
        if (answers.some(a => a.qIndex === currentQuestionIndex)) return;

        const newAnswers = [...answers, {
            qIndex: currentQuestionIndex,
            selected: selectedLetter,
            correct: quizData[currentQuestionIndex].correct_answer_letter,
        }];
        setAnswers(newAnswers);
        
        if (currentQuestionIndex < quizData.length - 1) {
            setTimeout(() => {
                if(isMounted.current) setCurrentQuestionIndex(prev => prev + 1);
            }, 200);
        } else {
            setTimerRunning(false);
            const finalScore = newAnswers.filter(a => a.selected === a.correct).length;
            submitRepetition(finalScore, timeTaken, quizData, newAnswers);
        }
    };

    const handlePrevious = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
            setAnswers(prev => prev.filter(a => a.qIndex !== currentQuestionIndex - 1));
        }
    };

    const handleCancel = () => {
        if (isSubmitting.current) return;
        if (abortControllerRef.current) abortControllerRef.current.abort();
        navigateTo('topicDetail', topic);
    };

    // --- Render: Loading State ---
    if (status === 'loading' || status === 'idle') return (
        <Card className={`text-center py-20 bg-${themeColor}-50 dark:bg-${themeColor}-900/20`}>
            <RotateCw size={32} className={`animate-spin text-${themeColor}-600 dark:text-${themeColor}-400 mx-auto`} />
            <p className={`mt-4 text-xl font-bold text-${themeColor}-700 dark:text-${themeColor}-300`}>
                AI Agent is Generating Your Pop Quiz...
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                (Analyzing notes and past mistakes...)
            </p>
            <p className="mt-4 text-xs text-red-500 font-medium">
                Takes up to 30 seconds.
            </p>
            <button 
                onClick={() => handleCancel()}
                className="mt-8 px-6 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-gray-500 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
                Cancel
            </button>
        </Card>
    );

    // --- Render: Error State ---
    if (status === 'error') {
        // Friendly error card with illustration: standardized error UX
        return (
            <ErrorCard 
                error={new Error(errorMessage || 'Quiz generation failed.')}
                resetErrorBoundary={() => navigateTo('topicDetail', topic)}
            />
        );
    }

    // --- Render: Ready State ---
    if (!quizData) return null; // Should not happen in 'ready' status
    const currentQ = quizData[currentQuestionIndex];

    return (
        <Card className="bg-white dark:bg-gray-800 p-4 md:p-6 flex flex-col flex-1 w-full min-h-0 shadow-sm overflow-hidden">
            <div className="shrink-0 mb-4 pb-2 border-b dark:border-gray-700">
                <div className="flex justify-between items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className={`text-lg md:text-xl font-bold text-${themeColor}-700 dark:text-${themeColor}-300 truncate`}>Pop Quiz: {topic?.topicName}</h3>
                        {isModelFallback && (
                            <span className="text-[10px] text-orange-500 font-medium flex items-center truncate">
                                <AlertTriangle size={10} className="mr-1 shrink-0"/> Preview limits reached; switched to Flash.
                            </span>
                        )}
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                        <div className={`text-sm md:text-base font-mono font-bold text-${themeColor}-500 dark:text-${themeColor}-400 flex items-center bg-${themeColor}-50 dark:bg-${themeColor}-900/30 px-2 py-1 rounded`}>
                            <Timer size={14} className="mr-1" />
                            {timeTaken}s
                        </div>
                        <div className="text-xs md:text-sm font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            {currentQuestionIndex + 1}<span className="opacity-50">/10</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar min-h-0 relative">
                {isFallback && <p className="mb-4 p-3 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 text-xs md:text-sm font-semibold rounded-lg border border-yellow-100 dark:border-yellow-800">⚠️ Notes were too brief. This is a general knowledge quiz.</p>}
                <div 
                    className="text-base md:text-lg font-semibold mb-6 text-gray-800 dark:text-gray-100 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMathHtml(currentQ.question) }}
                />
                <div className="space-y-3 pb-2">
                    {Object.entries(currentQ.options).map(([letter, text]) => (
                        <button 
                            key={`${currentQuestionIndex}-${letter}`} 
                            onClick={() => handleAnswer(letter)} 
                            className={`w-full text-left p-3 md:p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-${themeColor}-50 dark:hover:bg-${themeColor}-900/30 transition duration-150 flex items-start space-x-3 shadow-sm active:scale-[0.98] group`}
                        >
                            <div className={`flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-${themeColor}-600 dark:text-${themeColor}-400 font-bold flex items-center justify-center text-sm group-hover:bg-white dark:group-hover:bg-gray-600 transition-colors`}>{letter}</div>
                            <span 
                                className="text-gray-700 dark:text-gray-200 flex-1 font-medium text-sm md:text-base pt-0.5"
                                dangerouslySetInnerHTML={{ __html: renderMathHtml(text as string) }}
                            />
                        </button>
                    ))}
                </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 shrink-0 flex gap-3 bg-white dark:bg-gray-800 z-10">
                <button onClick={() => handleCancel()} className="flex-1 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition flex items-center justify-center text-sm active:scale-95"><XCircle size={18} className="mr-2" /> Cancel</button>
                <button onClick={handlePrevious} disabled={currentQuestionIndex === 0} className={`flex-1 py-3 rounded-xl font-bold transition flex items-center justify-center text-sm active:scale-95 ${currentQuestionIndex === 0 ? 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}><ChevronLeft size={18} className="mr-2" /> Previous</button>
            </div>
        </Card>
    );
};
