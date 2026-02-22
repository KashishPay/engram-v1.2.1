
import React, { useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Trophy, Share2 } from 'lucide-react';
import { Card } from '../components/Card';
import { Topic, QuizQuestion } from '../types';
import { SPACING_INTERVALS } from '../constants';
import katex from 'katex';
import DOMPurify from 'dompurify';

interface QuizReviewProps {
    topic: Topic;
    quizData: QuizQuestion[];
    answers: { qIndex: number; selected: string; correct: string }[];
    timeTaken: number;
    navigateTo: (view: string, data?: any, options?: { replace?: boolean }) => void;
    repetitionNumber: number;
    themeColor: string;
}

export const QuizReview: React.FC<QuizReviewProps> = ({ topic, quizData, answers, timeTaken, navigateTo, repetitionNumber, themeColor }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // DEBUG: Verify props on mount
    useEffect(() => {
        if (topic) {
            console.debug(`[REVIEW] View mounted. Topic: ${topic.topicName}, Repetition: ${repetitionNumber} (1-based)`);
        }
    }, [topic?.id, repetitionNumber]);

    // Back Button Interceptor: Force user to go to 'topicDetail' instead of 'quiz' if they hit back
    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            // If the user hits back, intercept and replace to a safe route
            // Prevents re-submitting the quiz or entering an invalid state
            console.debug("[REVIEW] popstate intercepted, redirecting to detail");
            // Stop propagation if possible (though native browser back often fires regardless)
            // We push the safe route to ensure we land there.
            navigateTo('topicDetail', topic, { replace: true });
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [navigateTo, topic]);

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

        // Basic Markdown Support
        processedText = processedText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
            .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-700 px-1 rounded font-mono text-xs text-red-500 dark:text-red-400">$1</code>'); // Inline Code

        blockMatches.forEach((html, index) => {
            processedText = processedText.replace(`__BLOCK_MATH_${index}__`, html);
        });

        return DOMPurify.sanitize(processedText);
    };

    if (!quizData || !answers || !topic) {
        return (
            <Card className="text-center py-10 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200">
                <h3 className="text-xl font-bold mb-2">Error Loading Review</h3>
                <p>Could not load quiz results data. Please go back to the topic and try again.</p>
                <button
                    onClick={() => navigateTo('subjects')}
                    className={`mt-4 px-4 py-2 bg-${themeColor}-500 text-white rounded-full hover:bg-${themeColor}-600 font-medium flex items-center mx-auto transition-colors`}
                >
                    <ArrowLeft size={18} className="mr-2" /> Back to Subjects
                </button>
            </Card>
        );
    }
    
    const score = answers.filter(a => a.selected === a.correct).length;
    const isSuccessful = (score / 10) * 100 >= 60;
    
    // Calculate next review date based on current repetition index
    // Note: repetitionNumber is 1-based index of the ATTEMPT just finished.
    // The next interval uses this index.
    const intervalDays = SPACING_INTERVALS[repetitionNumber] || 30;
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);

    useEffect(() => {
        if (isSuccessful && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Set canvas size to window for full screen confetti
            const setCanvasSize = () => {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = window.innerWidth * dpr;
                canvas.height = window.innerHeight * dpr;
                ctx.scale(dpr, dpr);
                canvas.style.width = `${window.innerWidth}px`;
                canvas.style.height = `${window.innerHeight}px`;
            };

            setCanvasSize();
            window.addEventListener('resize', setCanvasSize);

            const particles: any[] = [];
            const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            
            // Create particles
            for (let i = 0; i < 150; i++) {
                particles.push({
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2, // Start from center of screen
                    vx: (Math.random() - 0.5) * 12,
                    vy: (Math.random() - 0.5) * 12 - 4, // Slight upward bias
                    size: Math.random() * 6 + 2,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    life: 1,
                    decay: 0.005 + Math.random() * 0.015,
                    rotation: Math.random() * 360,
                    rotationSpeed: (Math.random() - 0.5) * 10
                });
            }

            let animationId: number;
            let frame = 0;
            const MAX_FRAMES = 300; // ~5 seconds @ 60fps

            // PERFORMANCE OPTIMIZATION: Stop on Interaction
            const stopAnimation = () => {
                if (animationId) cancelAnimationFrame(animationId);
                if (canvas) canvas.style.opacity = '0';
                // Remove listeners immediately
                window.removeEventListener('scroll', stopAnimation);
                window.removeEventListener('pointerdown', stopAnimation);
            };

            const animate = () => {
                // Auto-stop after ~5 seconds to free GPU
                if (frame > MAX_FRAMES) {
                    stopAnimation();
                    return;
                }
                
                frame++;
                if (!ctx) return;
                ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
                
                let activeParticles = 0;

                particles.forEach(p => {
                    if (p.life > 0) {
                        activeParticles++;
                        p.x += p.vx;
                        p.y += p.vy;
                        p.vy += 0.2; // Gravity
                        p.vx *= 0.95; // Drag
                        p.vy *= 0.95;
                        p.life -= p.decay;
                        p.rotation += p.rotationSpeed;

                        ctx.save();
                        ctx.translate(p.x, p.y);
                        ctx.rotate((p.rotation * Math.PI) / 180);
                        ctx.fillStyle = p.color;
                        ctx.globalAlpha = Math.max(p.life, 0);
                        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                        ctx.restore();
                    }
                });

                if (activeParticles > 0) {
                    animationId = requestAnimationFrame(animate);
                }
            };

            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (!prefersReducedMotion) {
                animate();
                // Listen for scroll/tap to stop early
                window.addEventListener('scroll', stopAnimation, { passive: true, once: true });
                window.addEventListener('pointerdown', stopAnimation, { passive: true, once: true });
            }

            return () => {
                cancelAnimationFrame(animationId);
                window.removeEventListener('resize', setCanvasSize);
                window.removeEventListener('scroll', stopAnimation);
                window.removeEventListener('pointerdown', stopAnimation);
            };
        }
    }, [isSuccessful]);

    const handleShare = async () => {
        const text: string = `I just scored ${score}/10 on ${topic.topicName} in Engram! 🚀 Can you beat my score? https://engram-space.vercel.app`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Engram Result',
                    text: text,
                });
            } catch (err: any) {
                console.log('Share canceled');
            }
        } else {
            navigator.clipboard.writeText(text);
            alert("Result copied to clipboard!");
        }
    };

    return (
        <>
            <style>{`
                @media (prefers-reduced-motion: reduce) {
                    .quiz-transition { transition: none !important; animation: none !important; }
                }
            `}</style>

            {isSuccessful && (
                <canvas 
                    ref={canvasRef} 
                    className="fixed inset-0 pointer-events-none z-50 quiz-transition transition-opacity duration-500"
                />
            )}
            
            <Card className="p-6 relative bg-white dark:bg-gray-800">
                <div className="relative z-20">
                    <h2 className={`text-3xl font-bold mb-4 text-${themeColor}-800 dark:text-${themeColor}-200 text-center`}>Quiz Results</h2>
                    
                    <div 
                        className={`p-4 rounded-xl text-center mb-6 relative overflow-hidden border transition-colors duration-200
                            ${isSuccessful 
                                ? 'bg-green-50 text-green-900 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800' 
                                : 'bg-yellow-50 text-yellow-900 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800'
                            }`}
                    >
                        {isSuccessful && <div className="absolute top-0 right-0 p-4 opacity-10 dark:opacity-20 transform rotate-12"><Trophy size={64} /></div>}
                        <p className="text-xl font-bold">Score: <span className="text-4xl">{score} / 10</span></p>
                        <p className="mt-1 opacity-90 text-sm">Time: {timeTaken} seconds | Repetition: {repetitionNumber}</p>
                        <p className="text-sm mt-2 font-medium opacity-90">Next Review: {nextReviewDate.toLocaleDateString()}</p>
                        {isSuccessful && <p className="text-xs font-bold uppercase tracking-widest mt-2 text-green-700 dark:text-green-400 animate-pulse quiz-transition">Quiz Passed!</p>}
                    </div>

                    <div className="space-y-6">
                        {quizData.map((q, index) => {
                            const answer = answers.find(a => a.qIndex === index);
                            const isCorrect = answer && answer.selected === answer.correct;
                            const resultIcon = isCorrect ? <CheckCircle size={18} className="text-green-600 dark:text-green-400" /> : <XCircle size={18} className="text-red-600 dark:text-red-400" />;

                            return (
                                <Card 
                                    key={index} 
                                    className={`p-5 border-l-4 shadow-sm quiz-transition border transition-colors
                                        ${isCorrect 
                                            ? 'border-l-green-500 bg-green-50/50 dark:bg-green-900/10 border-y-green-100 border-r-green-100 dark:border-y-green-900/30 dark:border-r-green-900/30' 
                                            : 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10 border-y-red-100 border-r-red-100 dark:border-y-red-900/30 dark:border-r-red-900/30'
                                        }`}
                                    style={{ contentVisibility: 'auto' }}
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <h4 className="text-base md:text-lg font-bold flex items-center text-gray-800 dark:text-gray-100">
                                            Q{index + 1}: <span className="ml-2">{resultIcon}</span>
                                        </h4>
                                        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${isCorrect ? 'text-green-700 bg-green-100 dark:bg-green-900/50 dark:text-green-300' : 'text-red-700 bg-red-100 dark:bg-red-900/50 dark:text-red-300'}`}>
                                            {isCorrect ? 'Correct' : 'Incorrect'}
                                        </span>
                                    </div>

                                    <div 
                                        className="mb-4 text-sm md:text-base font-medium text-gray-800 dark:text-gray-200 leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: renderMathHtml(q.question) }}
                                    />

                                    <div className="space-y-2 text-sm">
                                        {Object.entries(q.options).map(([letter, text]) => {
                                            const isSelected = answer && answer.selected === letter;
                                            const isCorrectAnswer = q.correct_answer_letter === letter;
                                            
                                            let containerClass = "p-2 rounded-lg border flex items-start transition-colors duration-200 ";
                                            
                                            if (isCorrectAnswer) {
                                                containerClass += "bg-green-200/50 border-green-300 text-green-900 dark:bg-green-900/40 dark:border-green-700 dark:text-green-100 font-semibold";
                                            } else if (isSelected) {
                                                containerClass += "bg-red-200/50 border-red-300 text-red-900 dark:bg-red-900/40 dark:border-red-700 dark:text-red-100 font-semibold";
                                            } else {
                                                containerClass += "bg-white border-gray-100 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 opacity-80";
                                            }

                                            return (
                                                <div key={letter} className={containerClass}>
                                                    <span className="w-5 font-bold mr-2 shrink-0">{letter}.</span>
                                                    <div className="flex-1 overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderMathHtml(text as string) }} />
                                                    {isCorrectAnswer && <CheckCircle size={14} className="ml-2 text-green-600 dark:text-green-400 shrink-0 mt-0.5"/>}
                                                    {isSelected && !isCorrectAnswer && <XCircle size={14} className="ml-2 text-red-600 dark:text-red-400 shrink-0 mt-0.5"/>}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700/60">
                                        <p className={`text-xs font-bold text-${themeColor}-700 dark:text-${themeColor}-300 uppercase tracking-wide mb-1`}>Explanation:</p>
                                        <div 
                                            className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: renderMathHtml(q.explanation) }}
                                        />
                                    </div>
                                </Card>
                            );
                        })}
                    </div>

                    <div className="mt-8 flex justify-center space-x-3 pb-safe">
                        <button
                            onClick={() => navigateTo('topicDetail', topic)}
                            className="px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center transition-colors shadow-sm"
                        >
                            <ArrowLeft size={18} className="mr-2" /> Back
                        </button>
                        {isSuccessful && (
                            <button 
                                onClick={handleShare} 
                                className={`px-5 py-2.5 bg-${themeColor}-600 text-white rounded-xl font-bold hover:bg-${themeColor}-700 flex items-center shadow-lg transform transition active:scale-95`}
                            >
                                <Share2 size={18} className="mr-2" /> Share Result
                            </button>
                        )}
                        <button
                            onClick={() => navigateTo('home')}
                            className={`px-5 py-2.5 bg-${themeColor}-500 text-white rounded-xl font-bold hover:bg-${themeColor}-600 flex items-center transition-colors shadow-sm`}
                        >
                            Go Home
                        </button>
                    </div>
                </div>
            </Card>
        </>
    );
};
