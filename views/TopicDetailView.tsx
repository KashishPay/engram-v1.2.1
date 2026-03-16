
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpenText, Upload, RotateCw, XCircle, Zap, MessageCircle, FileText, Edit2, Check, Sparkles, BrainCircuit, CheckCircle, Layers, AlertTriangle, Camera } from 'lucide-react';
import { Card } from '../components/Card';
import { PomodoroTimer } from '../components/PomodoroTimer';
import { NotesRenderer, InteractiveNoteEditor } from '../components/NotesRenderer';
import { SourceViewerModal } from '../components/Modals';
import { Topic, FocusSession, Repetition } from '../types';
import { getTopicBodyFromIDB, saveTopicBodyToIDB } from '../services/storage';
import { useProcessing } from '../context/ProcessingContext';
import { AnalyticsService } from '../services/analytics';
import { logTopicSession, getLocalISODate } from '../utils/sessionLog';
import { ErrorCard } from '../components/ErrorCard';

interface TopicDetailViewProps {
    topic: Topic | null;
    userId: string;
    navigateTo: (view: string, data?: unknown) => void;
    onUpdateTopic: (topic: Topic) => void;
    onDeleteTopic?: (topicId: string) => void;
    themeColor: string;
    defaultLanguage?: 'English' | 'Hinglish';
}

export const TopicDetailView: React.FC<TopicDetailViewProps> = React.memo(({ topic, userId, navigateTo, onUpdateTopic, onDeleteTopic, themeColor }) => {
    const { jobs, startProcessing, clearJob } = useProcessing();
    
    const [notes, setNotes] = useState<string>('');
    const [isLoadingBody, setIsLoadingBody] = useState(true);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [isEditing, setIsEditing] = useState(false);
    
    // Title Editing State
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(topic?.topicName || '');

    // Render Error & Source View State
    const [renderError, setRenderError] = useState(false);
    const [showSourceModal, setShowSourceModal] = useState(false);

    // File Input Refs for robust mobile handling
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null); // New Camera Ref

    // Sync title draft if topic updates externally
    useEffect(() => {
        if (topic) setTitleDraft(topic.topicName);
    }, [topic?.topicName]);

    // Check if there is an active job for this topic
    const currentJob = topic ? jobs[topic.id] : undefined;
    
    // Ref to track latest content for flush on unmount
    const notesRef = useRef(notes);
    const isMounted = useRef(true);

    useEffect(() => {
        notesRef.current = notes;
    }, [notes]);

    // Async Load Body Content (Namespaced by userId)
    useEffect(() => {
        isMounted.current = true;
        let isCurrent = true;
        
        if (isEditing || !topic) return;

        const isJobActive = currentJob && (currentJob.status === 'processing' || currentJob.status === 'uploading');
        if (isJobActive) return;

        setIsLoadingBody(true);

        const loadContent = async () => {
            if (topic.shortNotes && topic.shortNotes.length > 0 && !currentJob) {
                if (isCurrent) {
                    setNotes(topic.shortNotes);
                    setIsLoadingBody(false);
                }
                return;
            }

            try {
                const body = await getTopicBodyFromIDB(userId, topic.id);
                if (isCurrent) {
                    setNotes(body || "");
                    setIsLoadingBody(false);
                }
            } catch (e) {
                console.warn("Failed to load topic body", e);
                if (isCurrent) setIsLoadingBody(false);
            }
        };

        loadContent();

        return () => { isCurrent = false; isMounted.current = false; };
    }, [topic?.id, userId, currentJob?.status === 'success']); 

    // Update metadata on job success
    useEffect(() => {
        if (!topic) return;
        if (currentJob?.status === 'success') {
            const timer = setTimeout(() => {
                clearJob(topic.id);
            }, 3000); 
            
            const newTotal = currentJob.stats?.totalImages ?? currentJob.stats?.pages;
            
            if (newTotal !== undefined && topic.sourcePageCount !== newTotal) {
                onUpdateTopic({ ...topic, sourcePageCount: newTotal });
            }

            return () => clearTimeout(timer);
        }
    }, [currentJob?.status, topic?.id, clearJob]);

    const handleSave = useCallback(async (currentNotes: string) => {
        if (!topic) return false;
        setSaveStatus('saving');
        try {
            await saveTopicBodyToIDB(userId, topic.id, currentNotes);
            
            const updatedTopic = { 
                ...topic, 
                shortNotes: currentNotes, 
            };
            onUpdateTopic(updatedTopic);
            
            if (isMounted.current) setTimeout(() => setSaveStatus('saved'), 800);
            return true;
        } catch (e) {
            console.error("Error updating notes:", e);
            if (isMounted.current) {
                setSaveStatus('unsaved');
            }
            return false;
        }
    }, [topic, onUpdateTopic, userId]);

    // Debounced Save
    useEffect(() => {
        if (isLoadingBody || !topic) return;
        const timer = setTimeout(() => {
            if (notesRef.current !== (topic.shortNotes || "") && notes !== topic.shortNotes) {
                handleSave(notes);
            }
        }, 1500); 
        return () => clearTimeout(timer);
    }, [notes, isLoadingBody, topic]); 

    const handleTimeLogged = (minutes: number) => {
        if (!topic) return;
        const currentTotal = topic.pomodoroTimeMinutes || 0;
        const newTime = currentTotal + minutes;
        
        // FIX: Use local ISO date instead of UTC to ensure calendar alignment
        const today = getLocalISODate();
        
        const newSession: FocusSession = { date: today, minutes: minutes };
        const updatedTopic: Topic = {
            ...topic,
            pomodoroTimeMinutes: newTime,
            focusLogs: [...(topic.focusLogs || []), newSession]
        };
        
        AnalyticsService.trackSession(userId, topic.id, topic.subjectId, today, minutes);
        onUpdateTopic(updatedTopic);
        logTopicSession(minutes, topic.topicName, topic.subject);
    };

    const handleTitleSave = () => {
        if (!topic) return;
        if (titleDraft.trim() && titleDraft !== topic.topicName) {
            onUpdateTopic({ ...topic, topicName: titleDraft.trim() });
        }
        setIsEditingTitle(false);
    };

    const handleTriggerUpload = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    const handleTriggerCamera = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        cameraInputRef.current?.click();
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!topic) return;
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        try {
            await startProcessing(userId, topic.id, files);
        } catch (err) {
            console.error("[VSHORT] processing trigger failed", err);
            alert("Failed to start processing. Please try again.");
        } finally {
            if (event.target) event.target.value = '';
        }
    };

    const handleNotesChange = (newVal: string) => {
        setNotes(newVal);
        setSaveStatus('unsaved');
    };

    const handleViewOriginal = () => {
        if (!topic) return;
        AnalyticsService.trackEvent(userId, 'view_original_source', { topicId: topic.id });
        setShowSourceModal(true);
    };

    const lastRepetition = topic?.repetitions?.[(topic?.repetitions?.length || 1) - 1];
    const isReadyForReview = lastRepetition ? new Date(lastRepetition.nextReviewDate) <= new Date() : true;
    const repetitionCount = topic?.repetitions?.length || 0;
    const isQuizUnlocked = notes.length > 0;
    const pomodoroTime = topic?.pomodoroTimeMinutes || 0;
    const hasOriginals = (topic?.sourcePageCount || 0) > 0;

    // Smart Top Bar Logic
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showTopBar, setShowTopBar] = useState(true);
    const lastScrollY = useRef(0);
    const scrollRestorationRef = useRef<number | null>(null);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const container = scrollContainerRef.current;
            if (!container) return;
            
            const currentScrollY = container.scrollTop;
            const diff = currentScrollY - lastScrollY.current;
            
            // Logic:
            // 1. Always show if near top
            // 2. Hide if scrolling down (> 10px delta)
            // 3. Show if scrolling up (< -10px delta)
            if (currentScrollY < 60) {
                setShowTopBar(true);
            } else if (diff > 10) {
                setShowTopBar(false);
            } else if (diff < -10) {
                setShowTopBar(true);
            }
            
            lastScrollY.current = currentScrollY;
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    // Preserve scroll position when toggling edit mode
    const handleToggleEdit = () => {
        if (scrollContainerRef.current) {
            scrollRestorationRef.current = scrollContainerRef.current.scrollTop;
        }
        setIsEditing(!isEditing);
    };

    // Restore scroll position after edit mode toggle
    React.useLayoutEffect(() => {
        if (scrollRestorationRef.current !== null && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollRestorationRef.current;
            // We don't clear it immediately to ensure it sticks during potential re-renders, 
            // but for this simple toggle, it's fine.
            scrollRestorationRef.current = null;
        }
    }, [isEditing]);

    const handleReviewPastQuiz = useCallback((rep: Repetition, repNumber: number) => {
        if (!rep.quizAttempt || !rep.quizAttempt.questions || !topic) return;
        navigateTo('quizReview', {
            topic,
            quizAttempt: rep.quizAttempt,
            repetitionNumber: repNumber
        });
    }, [navigateTo, topic]);

    const handleDeleteTopic = useCallback(() => {
        if (!topic || !onDeleteTopic) return;
        if (window.confirm("Are you sure you want to delete this topic? This action cannot be undone.")) {
            onDeleteTopic(topic.id);
            navigateTo('subjects');
        }
    }, [topic, onDeleteTopic, navigateTo]);

    if (!topic) {
        return (
            <ErrorCard 
                error={new Error("Topic details missing. Please navigate from the Subjects list.")} 
                resetErrorBoundary={() => navigateTo('subjects')}
            />
        );
    }

    return (
        <div ref={scrollContainerRef} className="flex flex-col h-full bg-gray-100 dark:bg-gray-900 overflow-y-auto no-scrollbar relative scroll-smooth">
            {showSourceModal && (
                <SourceViewerModal 
                    topicId={topic.id} 
                    topicName={topic.topicName}
                    subjectName={topic.subject}
                    pageCount={topic.sourcePageCount || 0} 
                    onClose={() => setShowSourceModal(false)} 
                />
            )}

            {/* Padded Top Section */}
            <div className="px-4 pt-4 space-y-6 pb-6">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-4">
                        {isEditingTitle ? (
                            <div className="flex items-center bg-white dark:bg-gray-800 p-1 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm max-w-full">
                                <input 
                                    value={titleDraft}
                                    onChange={(e) => setTitleDraft(e.target.value)}
                                    onBlur={handleTitleSave}
                                    onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                                    autoFocus
                                    className={`text-xl font-bold text-${themeColor}-900 dark:text-${themeColor}-100 bg-transparent outline-none w-full px-2 py-1`}
                                />
                                <button onMouseDown={handleTitleSave} className="p-2 bg-green-100 text-green-600 rounded-xl hover:bg-green-200 shrink-0"><Check size={18} /></button>
                            </div>
                        ) : (
                            <div 
                                className={`group inline-flex items-center cursor-pointer px-4 py-2.5 rounded-2xl bg-${themeColor}-100 dark:bg-${themeColor}-900/40 text-${themeColor}-900 dark:text-${themeColor}-100 hover:bg-${themeColor}-200 dark:hover:bg-${themeColor}-800 transition-colors max-w-full`}
                                onClick={() => setIsEditingTitle(true)}
                                title="Click to rename"
                            >
                                <h2 className="text-xl font-bold truncate">
                                    {topic.topicName}
                                </h2>
                                <Edit2 size={16} className="ml-2 opacity-40 group-hover:opacity-100 transition-opacity shrink-0 text-current" />
                            </div>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block mt-2 ml-1">{topic.subject}</span>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                        <button
                            onClick={() => navigateTo('subjects')}
                            className={`flex-none flex items-center text-xs font-bold px-3 py-2 bg-${themeColor}-100 dark:bg-${themeColor}-900 text-${themeColor}-700 dark:text-${themeColor}-300 rounded-full hover:bg-${themeColor}-200 dark:hover:bg-${themeColor}-800 transition`}
                        >
                            <BookOpenText size={14} className="mr-1" /> All Subjects
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <PomodoroTimer 
                        topicId={topic.id}
                        topicName={topic.topicName}
                        onTimeLogged={handleTimeLogged} 
                        themeColor={themeColor} 
                    />
                    <Card className="flex flex-col relative overflow-hidden">
                        <h3 className={`text-lg font-semibold mb-3 text-${themeColor}-700 dark:text-${themeColor}-300`}>Topic Stats</h3>
                        <div className="space-y-2 mb-2">
                            <p className="text-gray-900 dark:text-gray-200 text-sm"><strong className="font-semibold text-gray-700 dark:text-gray-400">Total Study Time:</strong> {Math.floor(pomodoroTime / 60)}h {Math.round(pomodoroTime % 60)}m</p>
                            <p className="text-gray-900 dark:text-gray-200 text-sm"><strong className="font-semibold text-gray-700 dark:text-gray-400">Completed Reps:</strong> {repetitionCount}</p>
                            {lastRepetition && (
                                 <p className="text-gray-900 dark:text-gray-200 text-sm"><strong className="font-semibold text-gray-700 dark:text-gray-400">Next Review:</strong> <span className={`font-bold ${isReadyForReview ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{new Date(lastRepetition.nextReviewDate).toLocaleDateString()}</span></p>
                            )}
                        </div>

                        {/* Spaced Repetition Stepper */}
                        <div className="mt-2 mb-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Spaced Repetition Journey</span>
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{repetitionCount}/5</span>
                            </div>
                            <div className="flex justify-between items-center relative px-2">
                                {/* Connecting Line */}
                                <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-1 bg-gray-200 dark:bg-gray-700 rounded-full z-0"></div>
                                
                                {/* Nodes */}
                                {Array.from({ length: 5 }).map((_, i) => {
                                    const rep = topic.repetitions?.[i];
                                    const isCompleted = !!rep;
                                    const isNext = i === repetitionCount;
                                    
                                    let nodeColor = "bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600";
                                    let icon = null;
                                    
                                    let percentageScore = 0;
                                    
                                    if (isCompleted) {
                                        // If score is > 10, it's definitely a percentage. 
                                        // If totalQuestions is present and score <= totalQuestions, it's a raw score.
                                        // If totalQuestions is missing, and score is <= 100, we might assume it's a percentage if it was saved that way, but usually raw score is saved.
                                        // Let's use a robust check: if score > (rep.totalQuestions || 10), it's a percentage.
                                        // Wait, if score is 90 and totalQuestions is 10, score > 10 is true -> 90%.
                                        // If score is 9 and totalQuestions is 10, score > 10 is false -> (9/10)*100 = 90%.
                                        // If score is 100 and totalQuestions is 100, score > 100 is false -> (100/100)*100 = 100%.
                                        // If score is 80 and totalQuestions is 100, score > 100 is false -> (80/100)*100 = 80%.
                                        // The issue is if score is stored as a percentage (e.g., 90) but totalQuestions is 100. Then 90 > 100 is false -> (90/100)*100 = 90%. This works!
                                        // What if score is stored as percentage (e.g. 90) and totalQuestions is missing (defaults to 10)? 90 > 10 is true -> 90. This works!
                                        // What if score is raw (e.g. 9) and totalQuestions is missing (defaults to 10)? 9 > 10 is false -> (9/10)*100 = 90%. This works!
                                        // Wait, what if score is 10 and totalQuestions is 10? 10 > 10 is false -> (10/10)*100 = 100%. This works!
                                        // What if score is 100 (percentage) and totalQuestions is 10? 100 > 10 is true -> 100. This works!
                                        // Are there cases where score is stored as percentage (e.g. 80) and totalQuestions is 10? 80 > 10 is true -> 80. Works.
                                        // The only issue is if score is raw (e.g. 80) and totalQuestions is 100. 80 > 100 is false -> (80/100)*100 = 80%. Works.
                                        // But wait, what if the score was saved as a percentage (e.g. 80) and totalQuestions is 100? 80 > 100 is false -> (80/100)*100 = 80%. Works.
                                        // What if score was saved as a percentage (e.g. 80) and totalQuestions is 0? 80 > 0 is true -> 80. Works.
                                        // Let's just use the existing logic, but make sure it's consistent.
                                        const totalQs = rep.totalQuestions || 10;
                                        // If the score is greater than the total questions, it must be a percentage.
                                        // Also, if the score is exactly 100, it's likely a percentage (unless totalQs is 100, in which case 100/100*100 = 100 anyway).
                                        // If score is <= totalQs, it's a raw score, so calculate percentage.
                                        // Wait, what if score is 90, and totalQs is 100?
                                        // If it's a raw score: 90/100 * 100 = 90%.
                                        // If it's a percentage: 90.
                                        // Both give 90.
                                        // What if score is 9, and totalQs is 10?
                                        // Raw score: 9/10 * 100 = 90%.
                                        // Percentage: 9. (This would be wrong, but score is usually saved as raw score now).
                                        // Earlier versions might have saved percentage. If they saved percentage, and totalQs was 10, then score (e.g. 90) > 10, so it uses 90.
                                        percentageScore = rep.score > totalQs ? rep.score : (rep.score / totalQs) * 100;
                                        
                                        // Let's add a safety check: if percentageScore > 100, cap it at 100.
                                        if (percentageScore > 100) percentageScore = 100;
                                        if (percentageScore >= 80) {
                                            nodeColor = "bg-green-500 border-green-600 text-white cursor-pointer hover:scale-110 shadow-sm";
                                            icon = <Check size={12} strokeWidth={3} />;
                                        } else if (percentageScore >= 50) {
                                            nodeColor = "bg-yellow-500 border-yellow-600 text-white cursor-pointer hover:scale-110 shadow-sm";
                                            icon = <Check size={12} strokeWidth={3} />;
                                        } else {
                                            nodeColor = "bg-red-500 border-red-600 text-white cursor-pointer hover:scale-110 shadow-sm";
                                            icon = <XCircle size={12} strokeWidth={3} />;
                                        }
                                    } else if (isNext) {
                                        nodeColor = `bg-white dark:bg-gray-800 border-2 border-${themeColor}-500 shadow-[0_0_8px_rgba(0,0,0,0.1)]`;
                                        if (isReadyForReview) {
                                            nodeColor += " animate-pulse";
                                        }
                                    }

                                    return (
                                        <div 
                                            key={i} 
                                            className={`relative z-10 w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-200 ${nodeColor}`}
                                            onClick={() => isCompleted ? handleReviewPastQuiz(rep, i + 1) : undefined}
                                            title={isCompleted ? `Review Repetition ${i + 1} (Score: ${Math.round(percentageScore)}%)` : isNext ? "Next Review" : "Upcoming"}
                                        >
                                            {icon}
                                        </div>
                                    );
                                })}
                            </div>
                            {repetitionCount > 0 && (
                                <p className="text-[10px] text-center text-gray-400 dark:text-gray-500 mt-3">
                                    Click on a completed node to review your quiz attempt.
                                </p>
                            )}
                        </div>

                        <div className="flex space-x-2 mt-auto">
                            <button
                                onClick={() => navigateTo('quiz', { topic })} 
                                disabled={!isQuizUnlocked || saveStatus === 'saving' || !isReadyForReview || isLoadingBody || !!currentJob}
                                className={`flex-1 py-2.5 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-lg font-bold shadow-sm text-xs flex items-center justify-center hover:opacity-90 transition disabled:opacity-50`}
                            >
                                <Zap size={14} className="mr-1.5" /> 
                                {isReadyForReview ? "Pop Quiz" : "Not Due"}
                            </button>
                            <button
                                onClick={() => navigateTo('chat', { topic })}
                                disabled={!isQuizUnlocked || saveStatus === 'saving' || isLoadingBody || !!currentJob}
                                className={`flex-1 py-2.5 bg-white dark:bg-gray-800 text-${themeColor}-600 dark:text-${themeColor}-400 border border-${themeColor}-100 dark:border-${themeColor}-800 rounded-lg font-bold shadow-sm text-xs flex items-center justify-center hover:bg-${themeColor}-50 transition disabled:opacity-50`}
                            >
                                <MessageCircle size={14} className="mr-1.5" />
                                Chat
                            </button>
                        </div>
                    </Card>
                </div>

                <div className="min-h-[100px] transition-all">
                    {currentJob && (currentJob.status === 'processing' || currentJob.status === 'uploading' || currentJob.status === 'success' || currentJob.status === 'error') ? (
                        <div className={`p-8 rounded-2xl flex flex-col items-center justify-center text-center animate-in fade-in ${currentJob.status === 'error' ? 'bg-red-50 border-red-200' : `bg-${themeColor}-50 dark:bg-gray-800 border-${themeColor}-200`} border`}>
                            {currentJob.status === 'success' ? (
                                <CheckCircle size={40} className="text-green-500 mb-4 animate-bounce" />
                            ) : currentJob.status === 'error' ? (
                                <XCircle size={40} className="text-red-500 mb-4" />
                            ) : (
                                <RotateCw size={40} className={`animate-spin text-${themeColor}-500 mb-4`} />
                            )}
                            
                            <h3 className={`text-xl font-bold ${currentJob.status === 'error' ? 'text-red-700' : `text-${themeColor}-800 dark:text-white`}`}>
                                {currentJob.message || 'Processing Notes...'}
                            </h3>
                            
                            {currentJob.status === 'error' && (
                                <button 
                                    onClick={() => clearJob(topic.id)}
                                    className="mt-4 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-full text-sm font-bold shadow-sm hover:bg-red-50 transition"
                                >
                                    Dismiss
                                </button>
                            )}
                            
                            {currentJob.status === 'processing' && (
                                <div className="w-full max-w-xs mt-4 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className={`bg-${themeColor}-500 h-full transition-all duration-300`} 
                                        style={{ width: `${(currentJob.progress.current / currentJob.progress.total) * 100}%` }} 
                                    />
                                </div>
                            )}

                            {currentJob.stats && (
                                <>
                                    <div className="flex items-center gap-3 mt-3 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700/50 px-3 py-1.5 rounded-full border border-gray-100 dark:border-gray-600">
                                        <span>{currentJob.stats.pages} Pages detected</span>
                                        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                                        <span>{currentJob.stats.size}</span>
                                    </div>
                                    {(currentJob.status === 'processing' || currentJob.status === 'uploading') && (
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 italic animate-pulse">
                                            Estimated time: ~{Math.max(5, currentJob.stats.pages * 5)}s
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Standard File Picker */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,application/pdf"
                                multiple
                                onChange={handleFileUpload}
                                className="hidden"
                                aria-hidden="true"
                            />
                            
                            {/* Camera-Specific Input (Direct Capture) */}
                            <input
                                ref={cameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleFileUpload}
                                className="hidden"
                                aria-hidden="true"
                            />

                            <div className="relative group overflow-hidden rounded-2xl bg-slate-900 text-white shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]">
                                <div className="p-6 relative z-10 flex flex-row items-center justify-between">
                                    <div className="flex-1 pr-4">
                                        <div className="flex items-center space-x-2 mb-1.5">
                                            <Sparkles size={18} className="text-yellow-400" />
                                            <h3 className="text-lg font-bold">Add Notes</h3>
                                        </div>
                                        <p className="text-sm text-gray-300 font-medium opacity-90">
                                            Scan pages or upload PDF.
                                        </p>
                                    </div>
                                    
                                    <div className="flex items-center space-x-3">
                                        {/* Camera Button */}
                                        <button 
                                            onClick={handleTriggerCamera}
                                            className="w-12 h-12 bg-blue-500/20 hover:bg-blue-500/40 backdrop-blur-md rounded-full flex items-center justify-center text-blue-300 border border-blue-500/30 transition-colors"
                                            title="Scan with Camera"
                                        >
                                            <Camera size={22} />
                                        </button>
                                        
                                        {/* Upload Button */}
                                        <button 
                                            onClick={handleTriggerUpload}
                                            className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 transition-colors"
                                            title="Upload File"
                                        >
                                            <Upload size={22} />
                                        </button>
                                    </div>
                                </div>
                                <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>
                                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Notebook Section - Full Width, Edge to Edge */}
            <div className="flex-1 flex flex-col mt-4 bg-white dark:bg-gray-800 rounded-t-3xl shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.08)] border-t border-gray-100 dark:border-gray-700 min-h-[500px]">
                <div 
                    className={`px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 rounded-t-3xl sticky z-10 transition-[top] duration-300 ease-in-out`}
                    style={{ top: showTopBar ? '0' : '-80px' }}
                >
                    <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg bg-${themeColor}-50 dark:bg-${themeColor}-900/30 text-${themeColor}-600 dark:text-${themeColor}-400`}>
                            <FileText size={18} />
                        </div>
                        <div>
                            <span className="text-sm font-bold text-gray-800 dark:text-gray-100 block leading-tight">Smart Notebook</span>
                            {saveStatus === 'saving' && <span className="text-[10px] text-gray-400 font-medium animate-pulse">Saving changes...</span>}
                            {saveStatus === 'saved' && <span className="text-[10px] text-green-500 font-medium">Synced & Saved</span>}
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        {(hasOriginals || renderError) && (
                            <button
                                onClick={handleViewOriginal}
                                className={`px-3 py-1.5 rounded-lg transition text-xs font-bold flex items-center border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 hover:bg-blue-100 ${renderError ? 'animate-pulse' : ''}`}
                            >
                                <Layers size={14} className="mr-1.5"/>
                                {renderError ? 'View Original' : `View Original (${topic.sourcePageCount || 1})`}
                            </button>
                        )}
                        <button 
                            onClick={handleToggleEdit}
                            className={`px-3 py-1.5 rounded-lg transition text-xs font-bold flex items-center border ${isEditing ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800' : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-100'}`}
                        >
                            {isEditing ? <Check size={14} className="mr-1.5"/> : <Edit2 size={14} className="mr-1.5"/>}
                            {isEditing ? 'Done' : 'Edit'}
                        </button>
                    </div>
                </div>

                <div className="flex-1 relative bg-white dark:bg-gray-900">
                    {isLoadingBody ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-20">
                            <RotateCw size={32} className={`animate-spin text-${themeColor}-500`} />
                        </div>
                    ) : isEditing ? (
                        <div className="p-4 bg-white dark:bg-gray-900 min-h-[500px]">
                            <InteractiveNoteEditor 
                                content={notes} 
                                onChange={handleNotesChange}
                            />
                        </div>
                    ) : notes.length > 0 ? (
                        <div 
                            className="p-4 md:p-8 cursor-text min-h-full w-full break-words overflow-x-hidden touch-pan-y"
                            onClick={handleToggleEdit}
                        >
                            <NotesRenderer 
                                content={notes} 
                                onRenderError={() => setRenderError(true)}
                            />
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-gray-300 dark:text-gray-600 p-4 text-center">
                            <BrainCircuit size={48} className="mb-4 opacity-50"/>
                            <p className="text-sm font-medium">Your knowledge base is empty</p>
                            <p className="text-xs mt-1 opacity-70">Scan a document or tap edit to start typing</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Floating Action Bar (FAB) */}
            <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end space-y-3 pointer-events-none">
                {/* Save Status Indicator */}
                {saveStatus !== 'saved' && (
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 flex items-center animate-in fade-in slide-in-from-bottom-2 pointer-events-auto">
                        {saveStatus === 'saving' ? (
                            <>
                                <RotateCw size={12} className="animate-spin text-blue-500 mr-2" />
                                <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">Saving...</span>
                            </>
                        ) : (
                            <>
                                <AlertTriangle size={12} className="text-amber-500 mr-2" />
                                <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">Unsaved</span>
                            </>
                        )}
                    </div>
                )}

                {/* Main FAB Pill */}
                <div className="flex items-center bg-white dark:bg-gray-800 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-gray-700 p-1.5 pointer-events-auto">
                    {(hasOriginals || renderError) && !isEditing && (
                        <button
                            onClick={handleViewOriginal}
                            className={`p-3 rounded-full transition text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 mr-1 ${renderError ? 'animate-pulse' : ''}`}
                            title="View Original"
                        >
                            <Layers size={20} />
                        </button>
                    )}
                    <button 
                        onClick={handleToggleEdit}
                        className={`flex items-center px-6 py-3 rounded-full transition font-bold text-sm shadow-sm ${
                            isEditing 
                                ? 'bg-green-500 text-white hover:bg-green-600' 
                                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        {isEditing ? (
                            <>
                                <Check size={18} className="mr-2" />
                                <span>Done</span>
                            </>
                        ) : (
                            <>
                                <Edit2 size={18} className="mr-2" />
                                <span>Edit</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
});
