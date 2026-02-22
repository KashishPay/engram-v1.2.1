
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpenText, Upload, RotateCw, XCircle, Eye, Zap, History, MessageCircle, FileText, Clock, File, Image as ImageIcon, Edit2, Check, Sparkles, BrainCircuit, CheckCircle, Layers, AlertTriangle, Camera } from 'lucide-react';
import { Card } from '../components/Card';
import { PomodoroTimer } from '../components/PomodoroTimer';
import { NotesRenderer, InteractiveNoteEditor } from '../components/NotesRenderer';
import { SourceViewerModal } from '../components/Modals';
import { Topic, FocusSession } from '../types';
import { saveImageToIDB, getTopicBodyFromIDB, saveTopicBodyToIDB } from '../services/storage';
import { useProcessing } from '../context/ProcessingContext';
import { AnalyticsService } from '../services/analytics';
import { logTopicSession, getLocalISODate } from '../utils/sessionLog';
import { ErrorCard } from '../components/ErrorCard';

interface TopicDetailViewProps {
    topic: Topic | null;
    userId: string;
    navigateTo: (view: string, data?: any) => void;
    onUpdateTopic: (topic: Topic) => void;
    themeColor: string;
    defaultLanguage?: 'English' | 'Hinglish';
}

export const TopicDetailView: React.FC<TopicDetailViewProps> = React.memo(({ topic, userId, navigateTo, onUpdateTopic, themeColor }) => {
    const { jobs, startProcessing, clearJob } = useProcessing();
    
    if (!topic) {
        return (
            <ErrorCard 
                error={new Error("Topic details missing. Please navigate from the Subjects list.")} 
                resetErrorBoundary={() => navigateTo('subjects')}
            />
        );
    }
    
    const [notes, setNotes] = useState<string>('');
    const [isLoadingBody, setIsLoadingBody] = useState(true);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [isEditing, setIsEditing] = useState(false);
    
    // Title Editing State
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(topic.topicName);

    // Render Error & Source View State
    const [renderError, setRenderError] = useState(false);
    const [showSourceModal, setShowSourceModal] = useState(false);

    // File Input Refs for robust mobile handling
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null); // New Camera Ref

    // Sync title draft if topic updates externally
    useEffect(() => {
        setTitleDraft(topic.topicName);
    }, [topic.topicName]);

    // Check if there is an active job for this topic
    const currentJob = jobs[topic.id];
    
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
        
        if (isEditing) return;

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
    }, [topic.id, userId, currentJob?.status === 'success']); 

    // Update metadata on job success
    useEffect(() => {
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
    }, [currentJob?.status, topic.id, clearJob]);

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
        if (isLoadingBody) return;
        const timer = setTimeout(() => {
            if (notesRef.current !== (topic.shortNotes || "") && notes !== topic.shortNotes) {
                handleSave(notes);
            }
        }, 1500); 
        return () => clearTimeout(timer);
    }, [notes, isLoadingBody]); 

    const handleTimeLogged = (minutes: number) => {
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
        AnalyticsService.trackEvent(userId, 'view_original_source', { topicId: topic.id });
        setShowSourceModal(true);
    };

    const lastRepetition = topic?.repetitions?.[topic.repetitions.length - 1];
    const isReadyForReview = lastRepetition ? new Date(lastRepetition.nextReviewDate) <= new Date() : true;
    const repetitionCount = topic?.repetitions?.length || 0;
    const isQuizUnlocked = notes.length > 0;
    const pomodoroTime = topic.pomodoroTimeMinutes || 0;
    const hasOriginals = (topic.sourcePageCount || 0) > 0;

    return (
        <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900 overflow-y-auto no-scrollbar">
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
                    <button
                        onClick={() => navigateTo('subjects')}
                        className={`flex-none flex items-center text-xs font-bold px-3 py-2 bg-${themeColor}-100 dark:bg-${themeColor}-900 text-${themeColor}-700 dark:text-${themeColor}-300 rounded-full hover:bg-${themeColor}-200 dark:hover:bg-${themeColor}-800 transition`}
                    >
                        <BookOpenText size={14} className="mr-1" /> All Subjects
                    </button>
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
                        <div className="space-y-2 mb-4">
                            <p className="text-gray-900 dark:text-gray-200 text-sm"><strong className="font-semibold text-gray-700 dark:text-gray-400">Total Study Time:</strong> {Math.floor(pomodoroTime / 60)}h {Math.round(pomodoroTime % 60)}m</p>
                            <p className="text-gray-900 dark:text-gray-200 text-sm"><strong className="font-semibold text-gray-700 dark:text-gray-400">Completed Reps:</strong> {repetitionCount}</p>
                            {lastRepetition && (
                                 <p className="text-gray-900 dark:text-gray-200 text-sm"><strong className="font-semibold text-gray-700 dark:text-gray-400">Next Review:</strong> <span className={`font-bold ${isReadyForReview ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{new Date(lastRepetition.nextReviewDate).toLocaleDateString()}</span></p>
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
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 rounded-t-3xl sticky top-0 z-10">
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
                            onClick={() => setIsEditing(!isEditing)}
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
                            onClick={() => setIsEditing(true)}
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
        </div>
    );
});
