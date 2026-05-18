import React, { useState, useEffect } from 'react';
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, RefreshCw, BookOpen, Target, SkipForward, History, ChevronDown, ChevronUp, Download, RotateCw } from 'lucide-react';
import { Card } from '../components/Card';
import { fetchExamSubjects, generateExamQuiz, TestSeriesQuestion } from '../services/testSeriesService';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { AdManager } from '../services/admob';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface TestSeriesViewProps {
    userId: string;
    navigateTo: (view: string) => void;
    themeColor: string;
}

export interface TestHistoryEntry {
    id: string;
    timestamp: number;
    exam: string;
    stream: string;
    subject: string;
    score: number;
    totalQuestions: number;
    timeTaken: number;
    quizData: TestSeriesQuestion[];
    answers: { qIndex: number; selected: string; correct: string }[];
}

export const TestSeriesView: React.FC<TestSeriesViewProps> = ({ userId, navigateTo, themeColor }) => {
    // Setup State
    const [exam, setExam] = useState('');
    const [stream, setStream] = useState('');
    const [subjects, setSubjects] = useState<string[]>([]);
    const [selectedSubject, setSelectedSubject] = useState('');
    const [difficulty, setDifficulty] = useState('Medium');
    const [numQuestions, setNumQuestions] = useState(10);
    const [specificTopics, setSpecificTopics] = useState('');
    
    // Status State
    const [isFetchingSubjects, setIsFetchingSubjects] = useState(false);
    const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Quiz State
    const [quizData, setQuizData] = useState<TestSeriesQuestion[] | null>(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<{ qIndex: number; selected: string; correct: string }[]>([]);
    const [timeTaken, setTimeTaken] = useState(0);
    const [timerRunning, setTimerRunning] = useState(false);

    // History State
    const [history, setHistory] = useState<TestHistoryEntry[]>([]);
    const [viewMode, setViewMode] = useState<'setup' | 'active' | 'result' | 'history_list' | 'history_detail'>('setup');
    const [selectedHistory, setSelectedHistory] = useState<TestHistoryEntry | null>(null);
    const [recentExams, setRecentExams] = useState<{exam: string; stream: string}[]>([]);
    const [expandedHistoryGroups, setExpandedHistoryGroups] = useState<Set<string>>(new Set());

    const [exportingItemId, setExportingItemId] = useState<string | null>(null);
    const pdfExportRef = React.useRef<HTMLDivElement>(null);

    const handleDownloadPdf = async (item: TestHistoryEntry) => {
        setExportingItemId(item.id);
        
        try {
            // Provide a tiny delay to allow React to render the hidden container
            await new Promise(res => setTimeout(res, 200));
            
            if (!pdfExportRef.current) return;
            const element = pdfExportRef.current;
            const canvas = await html2canvas(element, { 
                scale: 2, 
                useCORS: true, 
                logging: false,
                backgroundColor: '#ffffff' 
            });
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = 210;
            const pdfHeight = 297;
            const margin = 10;
            const footerHeight = 15;
            const usableWidth = pdfWidth - margin * 2;
            const usableHeight = pdfHeight - margin - footerHeight - 5; // 5mm extra gap
            
            // Calculate HTML chunk height based on usable aspect ratio
            const htmlWidth = canvas.width;
            const htmlChunkHeight = Math.floor(htmlWidth * (usableHeight / usableWidth));
            
            let currentY = 0;
            let pageNum = 1;
            
            // Load logo
            const logoImg = new Image();
            logoImg.src = '/brand/engram_logo/engram_logo_128.png';
            await new Promise(res => {
                logoImg.onload = res;
                logoImg.onerror = res;
            });

            while (currentY < canvas.height) {
                if (pageNum > 1) {
                    pdf.addPage();
                }
                
                // Create a temporary canvas for the slice
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = htmlWidth;
                const remainingHeight = canvas.height - currentY;
                const sliceHeight = Math.min(htmlChunkHeight, remainingHeight);
                sliceCanvas.height = sliceHeight;
                
                const ctx = sliceCanvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
                    ctx.drawImage(
                        canvas,
                        0, currentY, htmlWidth, sliceHeight,
                        0, 0, htmlWidth, sliceHeight
                    );
                }
                
                const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.95);
                const printHeight = usableHeight * (sliceHeight / htmlChunkHeight);
                
                pdf.addImage(sliceDataUrl, 'JPEG', margin, margin, usableWidth, printHeight);
                
                // Add Footer
                pdf.setDrawColor(230, 230, 230);
                pdf.line(margin, pdfHeight - footerHeight, pdfWidth - margin, pdfHeight - footerHeight);
                
                let logoOffset = 0;
                if (logoImg.width > 0) {
                    pdf.addImage(logoImg, 'PNG', margin, pdfHeight - footerHeight + 4, 6, 6);
                    logoOffset = 8;
                }
                
                pdf.setFontSize(9);
                pdf.setTextColor(120, 120, 120);
                const footerText = "Engram: A self-help AI company that organizes your workflow.";
                pdf.text(footerText, margin + logoOffset, pdfHeight - footerHeight + 8.5);
                
                // Add hyperlink covering logo and text
                const textWidthLink = (pdf.getStringUnitWidth(footerText) * 9) / pdf.internal.scaleFactor;
                pdf.link(margin, pdfHeight - footerHeight + 2, logoOffset + textWidthLink, 12, { url: 'https://engram-space.vercel.app/' });
                
                const pageText = `Page ${pageNum}`;
                const textWidth = pdf.getStringUnitWidth(pageText) * 9 / pdf.internal.scaleFactor;
                pdf.text(pageText, pdfWidth - margin - textWidth, pdfHeight - footerHeight + 8.5);
                
                currentY += htmlChunkHeight;
                pageNum++;
            }
            
            pdf.save(`TestHistory_${item.exam.replace(/[^a-z0-9]/gi, '_')}_${item.subject.replace(/[^a-z0-9]/gi, '_')}.pdf`);
        } catch (e) {
            console.error("PDF generation failed:", e);
        } finally {
            setExportingItemId(null);
        }
    };

    // Load History
    const loadHistory = () => {
        const saved = localStorage.getItem(`engram_test_series_history_${userId}`);
        if (saved) {
            try { setHistory(JSON.parse(saved)); } catch (e) { console.warn("Failed to parse test series history", e); }
        }
        
        let recents: {exam: string; stream: string}[] = [];
        const savedRecents = localStorage.getItem(`engram_recent_exams_${userId}`);
        if (savedRecents) {
            try { recents = JSON.parse(savedRecents); } catch { /* ignore */ }
        }
        
        const savedSubjects = localStorage.getItem(`engram_exam_subjects_${userId}`);
        if (savedSubjects) {
            try {
                const subjectsObj = JSON.parse(savedSubjects);
                Object.keys(subjectsObj).forEach(key => {
                    const [ex, st] = key.split('_');
                    if (ex && st && !recents.find(r => r.exam.toLowerCase() === ex && r.stream.toLowerCase() === st)) {
                        recents.push({ exam: ex.toUpperCase(), stream: st.charAt(0).toUpperCase() + st.slice(1) });
                    }
                });
            } catch { /* ignore */ }
        }
        setRecentExams(recents);
    };

    useEffect(() => {
        loadHistory();
        window.addEventListener('engram-data-changed', loadHistory);
        return () => window.removeEventListener('engram-data-changed', loadHistory);
    }, [userId]);

    // Timer
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null;
        if (timerRunning) {
            interval = setInterval(() => {
                setTimeTaken(t => t + 1);
            }, 1000);
        }
        return () => { if(interval) clearInterval(interval); };
    }, [timerRunning]);

    useEffect(() => {
        if (!exam.trim() || !stream.trim()) return;
        const key = `engram_exam_subjects_${userId}`;
        const savedStr = localStorage.getItem(key);
        if (savedStr) {
            try {
                const saved = JSON.parse(savedStr);
                const examStreamKey = `${exam.trim().toLowerCase()}_${stream.trim().toLowerCase()}`;
                if (saved[examStreamKey] && saved[examStreamKey].length > 0) {
                    // Only auto-update if we don't already have them populated, to avoid jarring resets
                    setSubjects(saved[examStreamKey]);
                    if (!selectedSubject || (!saved[examStreamKey].includes(selectedSubject) && selectedSubject !== "All Subjects")) {
                        setSelectedSubject("All Subjects");
                    }
                }
            } catch { /* ignore */ }
        }
    }, [exam, stream, userId]);

    const handleFetchSubjects = async () => {
        if (!exam.trim() || !stream.trim()) {
            setError("Please enter both Exam and Stream.");
            return;
        }
        setIsFetchingSubjects(true);
        setError(null);
        try {
            const fetchedSubjects = await fetchExamSubjects(exam, stream);
            setSubjects(fetchedSubjects);
            if (fetchedSubjects.length > 0) {
                setSelectedSubject("All Subjects");
                
                // Save to localStorage
                const key = `engram_exam_subjects_${userId}`;
                const savedStr = localStorage.getItem(key);
                const saved = savedStr ? JSON.parse(savedStr) : {};
                const examStreamKey = `${exam.trim().toLowerCase()}_${stream.trim().toLowerCase()}`;
                saved[examStreamKey] = fetchedSubjects;
                localStorage.setItem(key, JSON.stringify(saved));

                // Save to recent exams
                setRecentExams(prev => {
                    const newEntry = { exam: exam.trim(), stream: stream.trim() };
                    const filtered = prev.filter(p => p.exam.toLowerCase() !== newEntry.exam.toLowerCase() || p.stream.toLowerCase() !== newEntry.stream.toLowerCase());
                    const updated = [newEntry, ...filtered].slice(0, 10);
                    localStorage.setItem(`engram_recent_exams_${userId}`, JSON.stringify(updated));
                    return updated;
                });
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to fetch subjects.");
        } finally {
            setIsFetchingSubjects(false);
        }
    };

    const handleGenerateQuiz = async () => {
        if (!exam.trim() || !stream.trim() || !selectedSubject) {
            setError("Please fill all fields.");
            return;
        }
        setIsGeneratingQuiz(true);
        setError(null);
        try {
            // Show rewarded ad here before quiz generation
            await AdManager.showRewardVideo();

            // Retrieve past questions context to avoid repetition
            const pastQuestions = JSON.parse(localStorage.getItem(`engram_test_series_past_questions_${userId}`) || '[]');
            
            const questions = await generateExamQuiz(exam, stream, selectedSubject, difficulty, numQuestions, pastQuestions, specificTopics);
            
            if (questions.length === 0) throw new Error("No questions generated.");
            
            // Save new questions to context
            const newPastQuestions = [...pastQuestions, ...questions.map(q => q.question)].slice(-100); // Keep last 100
            localStorage.setItem(`engram_test_series_past_questions_${userId}`, JSON.stringify(newPastQuestions));
            window.dispatchEvent(new CustomEvent('engram-data-changed'));

            setQuizData(questions);
            setCurrentQuestionIndex(0);
            setAnswers([]);
            setTimeTaken(0);
            setTimerRunning(true);
            setViewMode('active');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to generate quiz.");
        } finally {
            setIsGeneratingQuiz(false);
        }
    };

    const finishQuiz = (finalAnswers: typeof answers) => {
        setTimerRunning(false);
        setViewMode('result');
        
        const score = finalAnswers.filter(a => a.selected === a.correct).length;
        const newEntry: TestHistoryEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            exam,
            stream,
            subject: selectedSubject,
            score,
            totalQuestions: quizData!.length,
            timeTaken,
            quizData: quizData!,
            answers: finalAnswers
        };
        
        const updated = [newEntry, ...history];
        setHistory(updated);
        localStorage.setItem(`engram_test_series_history_${userId}`, JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('engram-data-changed'));
    };

    const handleAnswer = (option: string) => {
        if (!quizData) return;
        const currentQ = quizData[currentQuestionIndex];
        
        const newAnswers = [...answers, {
            qIndex: currentQuestionIndex,
            selected: option,
            correct: currentQ.correctAnswer
        }];
        setAnswers(newAnswers);

        if (currentQuestionIndex < quizData.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            finishQuiz(newAnswers);
        }
    };

    const handleSkip = () => {
        if (!quizData) return;
        const currentQ = quizData[currentQuestionIndex];
        
        const newAnswers = [...answers, {
            qIndex: currentQuestionIndex,
            selected: "SKIPPED",
            correct: currentQ.correctAnswer
        }];
        setAnswers(newAnswers);

        if (currentQuestionIndex < quizData.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            finishQuiz(newAnswers);
        }
    };

    const resetSetup = () => {
        setQuizData(null);
        setAnswers([]);
        setTimeTaken(0);
        setViewMode('setup');
    };

    const renderMathHtml = (text: string | undefined | null) => {
        if (!text || typeof text !== 'string') return "";
        const blockMathRegex = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g;
        const inlineMathRegex = /\$([\s\S]*?)\$|\\\(([\s\S]*?)\\\)/g;
        let processedText = text;

        const blockMatches: string[] = [];
        processedText = processedText.replace(blockMathRegex, (match, p1, p2) => {
            const formula = p1 || p2;
            try {
                const html = katex.renderToString(formula, { displayMode: true, throwOnError: false });
                blockMatches.push(html);
                return `__BLOCK_MATH_${blockMatches.length - 1}__`;
            } catch { return match; }
        });

        processedText = processedText.replace(inlineMathRegex, (match, p1, p2) => {
            const formula = p1 || p2;
            try {
                const html = katex.renderToString(formula, { displayMode: false, throwOnError: false });
                return html;
            } catch { return match; }
        });

        processedText = processedText.replace(/\n/g, '<br/>');

        blockMatches.forEach((html, index) => {
            processedText = processedText.replace(`__BLOCK_MATH_${index}__`, `<div class="my-4 overflow-x-auto overflow-y-auto touch-pan-x touch-pan-y">${html}</div>`);
        });

        return DOMPurify.sanitize(processedText);
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // --- RENDERERS ---

    if (viewMode === 'result' || viewMode === 'history_detail') {
        const displayData = viewMode === 'history_detail' && selectedHistory ? selectedHistory.quizData : quizData;
        const displayAnswers = viewMode === 'history_detail' && selectedHistory ? selectedHistory.answers : answers;
        const displayTime = viewMode === 'history_detail' && selectedHistory ? selectedHistory.timeTaken : timeTaken;
        const displayScore = viewMode === 'history_detail' && selectedHistory ? selectedHistory.score : displayAnswers.filter(a => a.selected === a.correct).length;
        
        if (!displayData) return null;

        return (
            <div className={`flex flex-col h-full bg-gray-50 dark:bg-gray-900 p-4 overflow-y-auto`} style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
                <div className="flex items-center space-x-3 mb-6">
                    <button onClick={() => viewMode === 'history_detail' ? setViewMode('history_list') : resetSetup()} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800 transition`}>
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>
                        {viewMode === 'history_detail' ? 'Test Review' : 'Test Results'}
                    </h2>
                </div>

                <Card className="p-6 text-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Score</h3>
                    <div className={`text-5xl font-extrabold text-${themeColor}-600 mb-4`}>
                        {displayScore} <span className="text-2xl text-gray-400">/ {displayData.length}</span>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Time Taken: {formatTime(displayTime)}</p>
                </Card>

                <div className="space-y-4">
                    <h3 className="font-bold text-gray-800 dark:text-white text-lg">Detailed Review</h3>
                    {displayData.map((q, i) => {
                        const ans = displayAnswers.find(a => a.qIndex === i);
                        const isCorrect = ans?.selected === q.correctAnswer;
                        const isSkipped = ans?.selected === "SKIPPED";
                        
                        return (
                            <Card key={i} className={`p-4 border-l-4 ${isCorrect ? 'border-green-500' : isSkipped ? 'border-gray-400' : 'border-red-500'}`}>
                                <div className="flex items-start justify-between mb-2">
                                    <h4 className="font-bold text-gray-800 dark:text-white flex-1" dangerouslySetInnerHTML={{ __html: renderMathHtml(`${i + 1}. ${q.question}`) }} />
                                    {isCorrect ? <CheckCircle className="text-green-500 shrink-0 ml-2" size={20} /> : isSkipped ? <SkipForward className="text-gray-400 shrink-0 ml-2" size={20} /> : <XCircle className="text-red-500 shrink-0 ml-2" size={20} />}
                                </div>
                                <div className="space-y-2 mt-4 text-sm">
                                    <div className="flex items-start">
                                        <span className="font-semibold text-gray-500 w-20 shrink-0">Your Answer:</span>
                                        <span className={`${isCorrect ? 'text-green-600 dark:text-green-400 font-medium' : isSkipped ? 'text-gray-500' : 'text-red-600 dark:text-red-400 line-through'}`} dangerouslySetInnerHTML={{ __html: renderMathHtml(ans?.selected || "Not answered") }} />
                                    </div>
                                    {!isCorrect && (
                                        <div className="flex items-start">
                                            <span className="font-semibold text-gray-500 w-20 shrink-0">Correct:</span>
                                            <span className="text-green-600 dark:text-green-400 font-medium" dangerouslySetInnerHTML={{ __html: renderMathHtml(q.correctAnswer) }} />
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-700 dark:text-gray-300">
                                    <strong className="block mb-2 text-gray-900 dark:text-white">Explanation:</strong>
                                    
                                    {q.explanation && (
                                        q.explanation.toLowerCase().includes('wait,') || 
                                        q.explanation.toLowerCase().includes('correcting') || 
                                        q.explanation.toLowerCase().includes('my mistake') || 
                                        q.explanation.toLowerCase().includes('sorry')
                                    ) && (
                                        <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium border border-red-200 dark:border-red-800/50">
                                            <span className="font-bold block mb-1">⚠️ Analysis Warning</span>
                                            The AI seems to have doubted or self-corrected its original answer below. The "correct" option highlighted above might be factually incorrect. Sorry for doubting!
                                        </div>
                                    )}

                                    <span dangerouslySetInnerHTML={{ __html: renderMathHtml(q.explanation) }} />
                                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                                        <a 
                                            href={`https://www.google.com/search?q=${encodeURIComponent(q.question)}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className={`inline-flex items-center text-xs font-bold text-${themeColor}-600 dark:text-${themeColor}-400 hover:text-${themeColor}-700 dark:hover:text-${themeColor}-300 transition`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            Double Check on Google
                                        </a>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
                
                {viewMode === 'result' && (
                    <button onClick={resetSetup} className={`mt-6 w-full py-4 bg-${themeColor}-600 text-white rounded-2xl font-bold shadow-lg hover:bg-${themeColor}-700 transition`}>
                        Take Another Test
                    </button>
                )}
            </div>
        );
    }

    if (viewMode === 'history_list') {
        const groupedHistory = history.reduce((acc, item) => {
            const ex = (item.exam || '').trim();
            const su = (item.subject || '').trim();
            // Case and space insensitive key
            const key = `${ex.toLowerCase()} - ${su.toLowerCase()}`;
            if (!acc[key]) {
                acc[key] = {
                    display: `${ex} - ${su}`, // Keep first encountered display casing
                    items: []
                };
            }
            acc[key].items.push(item);
            return acc;
        }, {} as Record<string, { display: string; items: TestHistoryEntry[] }>);

        const toggleGroup = (key: string) => {
            setExpandedHistoryGroups(prev => {
                const newSet = new Set(prev);
                if (newSet.has(key)) newSet.delete(key);
                else newSet.add(key);
                return newSet;
            });
        };

        return (
            <div className={`flex flex-col h-full bg-gray-50 dark:bg-gray-900 p-4 overflow-y-auto`} style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
                <div className="flex items-center space-x-3 mb-6">
                    <button onClick={() => setViewMode('setup')} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800 transition`}>
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>Test History</h2>
                </div>
                
                {history.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">No test history found.</div>
                ) : (
                    <div className="space-y-4">
                        {Object.entries(groupedHistory).map(([key, groupData]) => {
                            const { display, items } = groupData;
                            const isExpanded = expandedHistoryGroups.has(key);
                            const bestScore = Math.max(...items.map(i => Math.round((i.score / i.totalQuestions) * 100)));
                            
                            return (
                                <Card key={key} className="overflow-hidden">
                                    <div 
                                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
                                        onClick={() => toggleGroup(key)}
                                    >
                                        <div>
                                            <h3 className="font-bold text-gray-800 dark:text-white">{display}</h3>
                                            <p className="text-xs text-gray-500">{items.length} attempt{items.length !== 1 ? 's' : ''} • Best: {bestScore}%</p>
                                        </div>
                                        <div className="flex items-center">
                                            {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                                        </div>
                                    </div>
                                    
                                    {isExpanded && (
                                        <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                                            {items.map(item => (
                                                <div 
                                                    key={item.id} 
                                                    className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/80 transition cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); setSelectedHistory(item); setViewMode('history_detail'); }}
                                                >
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                            {new Date(item.timestamp).toLocaleString()}
                                                        </div>
                                                        <div className="flex items-center text-xs text-gray-500 mt-1">
                                                            <Clock size={12} className="mr-1" /> {formatTime(item.timeTaken)}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center space-x-3">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDownloadPdf(item); }}
                                                            disabled={exportingItemId === item.id}
                                                            className={`flex items-center justify-center p-2 rounded-lg ${exportingItemId === item.id ? 'bg-gray-200 dark:bg-gray-700 opacity-50' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'} text-gray-700 dark:text-gray-300 transition shrink-0`}
                                                            title="Download Test PDF"
                                                        >
                                                            {exportingItemId === item.id ? <RotateCw size={16} className="animate-spin" /> : <Download size={16} />}
                                                        </button>
                                                        <div className={`text-sm font-bold text-${themeColor}-600 bg-${themeColor}-50 dark:bg-${themeColor}-900/20 px-3 py-1 rounded-full`}>
                                                            {item.score}/{item.totalQuestions}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                )}
                
                {/* Hidden Export Container */}
                {exportingItemId && (
                <div className="absolute -left-[9999px] top-0 pointer-events-none">
                    <div ref={pdfExportRef} className="w-[800px] bg-white p-8 font-sans text-black" style={{ minHeight: '1000px' }}>
                        {(() => {
                            const exportItem = history.find(h => h.id === exportingItemId);
                            if (!exportItem) return null;
                            return (
                                <>
                                    <h1 className="text-3xl font-bold mb-2 text-gray-900 border-b-2 border-gray-200 pb-4">Test Review: {exportItem.exam} - {exportItem.subject}</h1>
                                    <div className="flex justify-between mb-8 text-gray-600 font-bold">
                                        <span>Score: {exportItem.score} / {exportItem.totalQuestions}</span>
                                        <span>Time Taken: {formatTime(exportItem.timeTaken)}</span>
                                        <span>Date: {new Date(exportItem.timestamp).toLocaleString()}</span>
                                    </div>
                                    
                                    <div className="space-y-6">
                                        {exportItem.quizData.map((q, i) => {
                                            const ans = exportItem.answers.find(a => a.qIndex === i);
                                            const isCorrect = ans?.selected === q.correctAnswer;
                                            const isSkipped = ans?.selected === "SKIPPED";
                                            return (
                                                <div key={i} className={`p-6 rounded-xl border ${isCorrect ? 'border-green-300 bg-green-50' : isSkipped ? 'border-gray-300 bg-gray-50' : 'border-red-300 bg-red-50'}`}>
                                                    <h3 className="font-bold text-gray-900 text-lg mb-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMathHtml(`${i + 1}. ${q.question}`) }} />
                                                    
                                                    <div className="space-y-3 mb-4">
                                                        {q.options.map((opt, idx) => {
                                                            const isThisSelected = opt === ans?.selected;
                                                            const isThisCorrect = opt === q.correctAnswer;
                                                            
                                                            let optClass = "p-3 rounded-lg border border-gray-200 bg-white text-gray-800";
                                                            if (isThisSelected && isThisCorrect) optClass = "p-3 rounded-lg border border-green-500 bg-green-100 text-green-900 font-bold";
                                                            else if (isThisSelected && !isThisCorrect) optClass = "p-3 rounded-lg border border-red-500 bg-red-100 text-red-900 font-bold";
                                                            else if (isThisCorrect) optClass = "p-3 rounded-lg border border-green-500 bg-green-50 text-green-800 font-bold";
                                                            
                                                            return (
                                                                <div key={idx} className={optClass} dangerouslySetInnerHTML={{ __html: renderMathHtml(opt) }} />
                                                            );
                                                        })}
                                                    </div>
                                                    
                                                    <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
                                                        <strong className="block mb-2 text-gray-800">Explanation:</strong>
                                                        <div className="text-gray-700" dangerouslySetInnerHTML={{ __html: renderMathHtml(q.explanation) }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
                )}
            </div>
        );
    }

    if (viewMode === 'active' && quizData) {
        const currentQ = quizData[currentQuestionIndex];
        return (
            <div className={`flex flex-col h-full bg-gray-50 dark:bg-gray-900 p-4 overflow-y-auto`} style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center space-x-2">
                        <span className={`px-3 py-1 bg-${themeColor}-100 dark:bg-${themeColor}-900/30 text-${themeColor}-700 dark:text-${themeColor}-300 rounded-full text-xs font-bold`}>
                            Q {currentQuestionIndex + 1} / {quizData.length}
                        </span>
                    </div>
                    <div className="flex items-center text-gray-500 dark:text-gray-400 font-mono font-bold">
                        <Clock size={16} className="mr-1" /> {formatTime(timeTaken)}
                    </div>
                </div>

                <Card className="p-6 mb-6">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMathHtml(currentQ.question) }} />
                    <div className="space-y-3">
                        {currentQ.options.map((opt, idx) => (
                            <button
                                key={`q-${currentQuestionIndex}-opt-${idx}`}
                                onClick={() => handleAnswer(opt)}
                                className={`w-full text-left p-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 hover:border-${themeColor}-300 dark:hover:border-${themeColor}-600 hover:bg-${themeColor}-50 dark:hover:bg-${themeColor}-900/20 transition group active:scale-95`}
                            >
                                <span className="text-gray-700 dark:text-gray-200 font-medium" dangerouslySetInnerHTML={{ __html: renderMathHtml(opt) }} />
                            </button>
                        ))}
                    </div>
                </Card>

                <div className="mt-auto flex justify-center">
                    <button onClick={handleSkip} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl transition flex items-center">
                        Skip Question <SkipForward size={18} className="ml-2" />
                    </button>
                </div>
            </div>
        );
    }

    // Setup View
    return (
        <div className={`flex flex-col h-full bg-gray-50 dark:bg-gray-900 p-4 overflow-y-auto`} style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-3">
                    <button onClick={() => navigateTo('settings')} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800 transition`}>
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>Test Series</h2>
                </div>
                <button onClick={() => setViewMode('history_list')} className={`p-2 bg-${themeColor}-100 dark:bg-${themeColor}-900/30 text-${themeColor}-600 dark:text-${themeColor}-400 rounded-xl font-bold text-sm flex items-center hover:bg-${themeColor}-200 dark:hover:bg-${themeColor}-900/50 transition`}>
                    <History size={18} className="mr-2" /> History
                </button>
            </div>

            <Card className="p-6 space-y-6">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                        <Target className={`text-${themeColor}-500 mr-2`} size={24} />
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white">Exam Configuration</h3>
                    </div>
                    {recentExams.length > 0 && (
                        <div className="relative">
                            <select
                                className={`appearance-none bg-${themeColor}-50 dark:bg-${themeColor}-900/20 border border-${themeColor}-100 dark:border-${themeColor}-800 text-${themeColor}-700 dark:text-${themeColor}-300 py-1.5 pl-3 pr-8 rounded-lg text-xs font-bold outline-none cursor-pointer max-w-[150px] sm:max-w-[180px] truncate`}
                                onChange={(e) => {
                                    if (!e.target.value) return;
                                    const selected = JSON.parse(e.target.value);
                                    setExam(selected.exam);
                                    setStream(selected.stream);
                                }}
                                value=""
                            >
                                <option value="">Recent Searches</option>
                                {recentExams.map((re, idx) => (
                                    <option key={idx} value={JSON.stringify(re)}>
                                        {re.exam} - {re.stream}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                                </svg>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Exam Name</label>
                        <input 
                            type="text" 
                            value={exam}
                            onChange={(e) => setExam(e.target.value)}
                            placeholder="e.g., GATE, RRB JE, SSC JE"
                            className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Stream / Branch</label>
                        <input 
                            type="text" 
                            value={stream}
                            onChange={(e) => setStream(e.target.value)}
                            placeholder="e.g., Electrical, Mechanical, CS"
                            className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                        />
                    </div>
                    
                    <button 
                        onClick={handleFetchSubjects}
                        disabled={isFetchingSubjects || !exam || !stream}
                        className={`w-full py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50 flex items-center justify-center`}
                    >
                        {isFetchingSubjects ? <RefreshCw size={18} className="animate-spin mr-2" /> : <BookOpen size={18} className="mr-2" />}
                        {isFetchingSubjects ? 'Fetching Subjects...' : 'Fetch Subjects'}
                    </button>
                </div>

                {subjects.length > 0 && (
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4 animate-in fade-in">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Select Subject</label>
                            <select 
                                value={selectedSubject}
                                onChange={(e) => setSelectedSubject(e.target.value)}
                                className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white appearance-none"
                            >
                                <option value="All Subjects">-- All Subjects --</option>
                                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Specific Topics (Optional)</label>
                            <input 
                                type="text" 
                                value={specificTopics}
                                onChange={(e) => setSpecificTopics(e.target.value)}
                                placeholder="e.g., MPT theorem, Thevenin's theorem"
                                className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Difficulty</label>
                                <select 
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value)}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white appearance-none"
                                >
                                    <option value="Easy">Easy</option>
                                    <option value="Medium">Medium</option>
                                    <option value="Hard">Hard</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Questions</label>
                                <select 
                                    value={numQuestions}
                                    onChange={(e) => setNumQuestions(Number(e.target.value))}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white appearance-none"
                                >
                                    <option value={5}>5 Questions</option>
                                    <option value={10}>10 Questions</option>
                                    <option value={15}>15 Questions</option>
                                    <option value={20}>20 Questions</option>
                                    <option value={30}>30 Questions</option>
                                </select>
                            </div>
                        </div>

                        {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

                        <button 
                            onClick={handleGenerateQuiz}
                            disabled={isGeneratingQuiz}
                            className={`w-full py-4 bg-${themeColor}-600 text-white rounded-2xl font-bold shadow-lg hover:bg-${themeColor}-700 transition disabled:opacity-50 flex items-center justify-center mt-4`}
                        >
                            {isGeneratingQuiz ? <RefreshCw size={20} className="animate-spin mr-2" /> : <Play size={20} className="mr-2 fill-current" />}
                            {isGeneratingQuiz ? 'Generating Test...' : 'Start Test'}
                        </button>
                    </div>
                )}
            </Card>
        </div>
    );
};
