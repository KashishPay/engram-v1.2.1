
import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Headphones, Play, Pause, Rewind, FastForward, X, Minimize2, Loader, Mic2, ChevronDown, FileText, Download, FolderOpen, Bookmark, Trash2, RefreshCw, Plus, Minus } from 'lucide-react';
import { Card } from '../components/Card';
import { Topic } from '../types';
import { getAudioFromIDB, deleteAudioFromIDB, getAllAudioKeys } from '../services/storage';
import { PodcastState, PodcastControls } from '../hooks/usePodcast';
import { goBackOrFallback } from '../utils/navigation';
import { ensureAudioContext } from '../utils/audioCue';
import { getErrorImage, getFallbackImage } from '../utils/errorImages';
import katex from 'katex';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { AdManager } from '../services/admob';

export const PodcastSettingsView: React.FC<{ 
    config: { language: 'English' | 'Hinglish' }; 
    onUpdate: (config: { language: 'English' | 'Hinglish' }) => void;
    navigateTo: (view: string) => void;
    goBack?: () => void;
    themeColor: string;
    studyLog: Topic[];
    onPlayTopic: (topic: Topic) => void;
    onUpdateTopic?: (topic: Topic) => void;
}> = ({ config, onUpdate, navigateTo, themeColor, studyLog, onPlayTopic, onUpdateTopic }) => {
    
    const difficultTopics = useMemo(() => studyLog.filter(t => t.isMarkedDifficult), [studyLog]);

    const handleRemoveFromDifficult = (e: React.MouseEvent, topic: Topic) => {
        e.stopPropagation();
        if (onUpdateTopic) {
            onUpdateTopic({ ...topic, isMarkedDifficult: false });
        }
    };

    return (
        <div className="px-0 py-4 space-y-6">
            <div className="flex items-center space-x-2 mb-4">
                <button onClick={() => goBackOrFallback('#/settings')} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800`}>
                    <ArrowLeft size={24} />
                </button>
                <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>Podcast Settings</h2>
            </div>

            <div className="space-y-4">
                <Card className="p-4">
                    <h3 className="font-semibold text-gray-800 dark:text-white mb-3">Language Preference</h3>
                    <div className="flex space-x-2">
                        {['English', 'Hinglish'].map((lang) => (
                            <button
                                key={lang}
                                onClick={() => onUpdate({ ...config, language: lang as 'English' | 'Hinglish' })}
                                className={`flex-1 py-3 rounded-xl font-bold transition border-2 ${
                                    config.language === lang 
                                        ? `border-${themeColor}-500 bg-${themeColor}-50 text-${themeColor}-700 dark:bg-${themeColor}-900/30 dark:text-${themeColor}-300` 
                                        : 'border-transparent bg-gray-100 dark:bg-gray-800 text-gray-500'
                                }`}
                            >
                                {lang}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Hinglish mixes Hindi and English for a more natural, conversational tone suitable for Indian students.
                    </p>
                </Card>

                <button 
                    onClick={() => navigateTo('podcast')}
                    className={`w-full py-3.5 bg-${themeColor}-100 dark:bg-${themeColor}-900/30 text-${themeColor}-700 dark:text-${themeColor}-300 rounded-2xl font-bold flex items-center justify-center hover:bg-${themeColor}-200 dark:hover:bg-${themeColor}-800 transition`}
                >
                    <Headphones size={20} className="mr-2" />
                    Open Audio Player
                </button>

                {/* Difficult Topics Folder */}
                <div className="mt-6 pt-2">
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className={`font-bold text-gray-800 dark:text-white flex items-center`}>
                            <FolderOpen size={20} className={`mr-2 text-${themeColor}-600`} />
                            Difficult Topics
                        </h3>
                        <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">{difficultTopics.length} saved</span>
                    </div>
                    
                    {difficultTopics.length === 0 ? (
                        <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
                            <Bookmark size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-400">Mark topics as "Difficult" in the player to see them here.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {difficultTopics.map(topic => (
                                <div 
                                    key={topic.id} 
                                    onClick={() => onPlayTopic(topic)}
                                    className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-center shadow-sm cursor-pointer hover:shadow-md transition active:scale-[0.99]"
                                >
                                    <div className="flex items-center space-x-3 overflow-hidden">
                                        <div className={`w-10 h-10 rounded-full bg-${themeColor}-50 dark:bg-${themeColor}-900/20 text-${themeColor}-600 dark:text-${themeColor}-400 flex items-center justify-center shrink-0`}>
                                            <Play size={16} fill="currentColor" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-gray-800 dark:text-white text-sm truncate">{topic.topicName}</p>
                                            <p className="text-xs text-gray-500 truncate">{topic.subject}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => handleRemoveFromDifficult(e, topic)}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition"
                                        title="Remove from difficult"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const PodcastMiniPlayer: React.FC<{
    state: PodcastState;
    controls: PodcastControls;
    navigateTo: (view: string) => void;
    themeColor: string;
}> = ({ state, controls, navigateTo, themeColor }) => {
    if (!state.currentTopic) return null;

    const progress = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

    return (
        <div 
            className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom)+12px)] left-4 right-4 bg-white/90 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-2 z-50 flex items-center justify-between cursor-pointer transform transition-all duration-300 hover:scale-[1.02] pointer-events-auto"
            onClick={() => navigateTo('podcast')}
        >
            {/* Progress Bar Background */}
            <div className="absolute bottom-0 left-2 right-2 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden pointer-events-none">
                 <div 
                    className={`h-full bg-${themeColor}-500 transition-all duration-300`} 
                    style={{ width: `${progress}%` }}
                 />
            </div>

            <div className="flex items-center space-x-3 overflow-hidden flex-1 pl-1 pb-2 pt-1 pointer-events-none">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-${themeColor}-400 to-${themeColor}-600 flex items-center justify-center text-white shadow-sm shrink-0`}>
                    {state.loading ? <Loader size={16} className="animate-spin"/> : <Headphones size={18} />}
                </div>
                <div className="min-w-0">
                    <p className="font-bold text-gray-800 dark:text-white text-sm truncate pr-2">
                        {state.loading ? state.status : state.currentTopic.topicName}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        Deep Dive • Kittu & Kashish
                    </p>
                </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0 pb-1 pr-1 pointer-events-auto">
                <button 
                    onClick={(e) => { e.stopPropagation(); controls.skip(-10); }}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                    <Rewind size={18} />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); controls.togglePlay(); }}
                    className={`w-10 h-10 rounded-full bg-${themeColor}-600 text-white flex items-center justify-center shadow-md hover:scale-105 transition`}
                >
                    {state.isPlaying ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor" className="ml-1"/>}
                </button>
                <button
                     onClick={(e) => { e.stopPropagation(); controls.reset(); }}
                     className="p-2 text-gray-400 hover:text-red-500"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
};

const PodcastStatusOverlay: React.FC<{
    state: PodcastState;
    controls: PodcastControls;
    themeColor: string;
    onMinimize: () => void;
}> = ({ state, controls, themeColor, onMinimize }) => {
    // Force re-render to update the calculated timer
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!state.loading) return;
        const timer = setInterval(() => {
            setTick(prev => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [state.loading]);

    // Calculate time left based on stable generationStartTime
    const totalDuration = state.estimatedDuration || 180;
    const startTime = state.generationStartTime || Date.now();
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const timeLeft = Math.max(0, totalDuration - elapsedSeconds);

    const isError = !!state.error;

    // Friendly error image selector
    const errorSeed = String(state.error || 'podcast');
    const errorImgSrc = getErrorImage(errorSeed);
    const errorFallback = getFallbackImage();

    return (
        <div className={`absolute inset-0 z-[60] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300 pointer-events-auto ${isError ? 'bg-red-50/95 dark:bg-red-900/90' : 'bg-white/95 dark:bg-gray-900/95'} backdrop-blur-md`}>
            {/* Top Bar with Minimize */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center pointer-events-none z-[60]">
                <button 
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onMinimize();
                    }}
                    className="p-3 bg-gray-100/50 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 transition backdrop-blur-sm pointer-events-auto cursor-pointer shadow-sm relative z-[60]"
                    aria-label="Minimize podcast"
                >
                    <ChevronDown size={24} />
                </button>
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400 opacity-80">{isError ? 'Error' : 'Generating Podcast'}</span>
                <div className="w-10"></div> 
            </div>

            {isError ? (
                // ERROR STATE: Friendly UX with image
                <div className="flex flex-col items-center">
                    <img 
                        src={errorImgSrc} 
                        alt="Error illustration" 
                        onError={(e)=>{e.currentTarget.src=errorFallback;}} 
                        className="mx-auto w-32 h-32 object-contain mb-4 drop-shadow-sm" 
                    />
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Generation Failed</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 max-w-xs leading-relaxed mb-8">
                        {state.error || "Unable to generate podcast. Please check your API key and connection."}
                    </p>
                    <div className="flex space-x-3">
                        <button 
                            onClick={(e) => { e.stopPropagation(); controls.reset(); }}
                            className="px-6 py-3 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm hover:bg-gray-300 dark:hover:bg-gray-700 transition"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); if(state.currentTopic) controls.playTopic(state.currentTopic); }}
                            className={`px-6 py-3 bg-${themeColor}-600 text-white rounded-xl font-bold text-sm hover:bg-${themeColor}-700 transition shadow-lg flex items-center`}
                        >
                            <RefreshCw size={16} className="mr-2" /> Retry
                        </button>
                    </div>
                </div>
            ) : (
                // LOADING STATE
                <div className="flex flex-col items-center w-full">
                    <div className={`relative w-24 h-24 mb-6 mt-8`}>
                        <div className={`absolute inset-0 border-4 border-${themeColor}-200 rounded-full`}></div>
                        <div className={`absolute inset-0 border-4 border-${themeColor}-500 rounded-full border-t-transparent animate-spin`}></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Mic2 size={32} className={`text-${themeColor}-600`} />
                        </div>
                    </div>
                    
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white animate-pulse">{state.status}</h3>
                    <p className="text-sm text-gray-500 mt-2 mb-4">Kittu and Kashish are reviewing your notes...</p>

                    {timeLeft > 0 ? (
                        <div className="mb-8 flex flex-col items-center">
                            <p className={`text-2xl font-bold text-${themeColor}-600 font-mono tabular-nums`}>
                                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                            </p>
                            <p className="text-xs text-gray-400">Estimated wait time</p>
                        </div>
                    ) : (
                        <p className="text-xs text-amber-500 font-bold mb-8 animate-bounce">Almost ready...</p>
                    )}
                    
                    <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); controls.reset(); }}
                        className="px-6 py-2 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full font-bold text-sm hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-300 transition shadow-sm border border-gray-300 dark:border-gray-700 pointer-events-auto relative z-[60]"
                    >
                        Stop Generation
                    </button>
                </div>
            )}
        </div>
    );
};

interface PodcastFullViewProps {
    studyLog: Topic[];
    onUpdateTopic: (topic: Topic) => void;
    themeColor: string;
    onMinimize: () => void;
    state: PodcastState;
    controls: PodcastControls;
    defaultLanguage?: string;
}

export const PodcastFullView: React.FC<PodcastFullViewProps> = ({ 
    studyLog, onUpdateTopic, themeColor, onMinimize, state, controls, defaultLanguage
}) => {
    // UI Local State
    const [showScript, setShowScript] = useState(false);
    
    // Library UI State
    const [libraryTab, setLibraryTab] = useState<'topics' | 'subjects' | 'downloads'>('topics');
    const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
    
    // Track local availability for subjects to show offline status without checking DB every render
    const [availableSubjects, setAvailableSubjects] = useState<Set<string>>(new Set());

    // Resolve the LIVE topic from studyLog using ID to ensure we see updates (like isMarkedDifficult)
    const activeTopicId = state.currentTopic?.id;
    const liveTopic = useMemo(() => {
        if (!activeTopicId) return null;
        if (activeTopicId.startsWith('subject-recap')) return state.currentTopic; 
        return studyLog.find(t => t.id === activeTopicId) || state.currentTopic;
    }, [studyLog, activeTopicId, state.currentTopic]);

    // Use this for rendering metadata
    const displayTopic = liveTopic || state.currentTopic;

    // CONDITION FIX: If loading OR audioSrc OR ERROR, show player/status UI.
    const showPlayerUI = !!state.currentTopic;

    // Keep screen awake while playing
    useEffect(() => {
        const handleWakeLockError = (err: unknown) => {
            if (err instanceof Error && err.message?.includes('disallowed by permissions policy')) {
                console.warn('WakeLock not allowed in this environment (likely an iframe).');
            } else {
                console.error('WakeLock error:', err);
            }
        };

        if (state.isPlaying) {
            KeepAwake.keepAwake().catch(handleWakeLockError);
        } else {
            KeepAwake.allowSleep().catch(handleWakeLockError);
        }

        return () => {
            KeepAwake.allowSleep().catch(handleWakeLockError);
        };
    }, [state.isPlaying]);

    // Manage podcast banner ad visibility
    useEffect(() => {
        if (showPlayerUI && !showScript) {
            AdManager.showPodcastBanner();
        } else {
            AdManager.hideBanner();
        }

        return () => {
            AdManager.hideBanner();
        };
    }, [showPlayerUI, showScript]);

    // --- INTEGRITY CHECK ---
    // Scan IDB when library opens to ensure audio flags match reality
    useEffect(() => {
        let isMounted = true;
        const checkIntegrity = async () => {
            try {
                const keys = await getAllAudioKeys();
                const keySet = new Set(keys);
                
                // Identify discrepancies
                for (const topic of studyLog) {
                    if (!isMounted) return;
                    const hasFile = keySet.has(topic.id);
                    const flag = !!topic.hasSavedAudio;
                    
                    if (hasFile && !flag) {
                        console.debug("[PodcastView] Auto-repairing audio flag for:", topic.topicName);
                        onUpdateTopic({ ...topic, hasSavedAudio: true });
                    }
                }
            } catch (e) {
                console.warn("[PodcastView] Integrity check skipped", e);
            }
        };
        
        checkIntegrity();
        return () => { isMounted = false; };
    }, []); // Run once on mount (when overlay opens)

    // Aggregate subjects
    const subjectsMap = useMemo(() => {
        return studyLog.reduce((acc, topic) => {
            if (!topic.shortNotes || topic.shortNotes.length < 20) return acc;
            if (!acc[topic.subjectId]) {
                acc[topic.subjectId] = {
                    name: topic.subject,
                    id: topic.subjectId,
                    count: 0,
                    notes: [] as string[],
                    latestCreatedAt: topic.createdAt
                };
            }
            acc[topic.subjectId].count++;
            acc[topic.subjectId].notes.push(`--- TOPIC: ${topic.topicName} ---\n${topic.shortNotes}`);
            
            if (new Date(topic.createdAt) > new Date(acc[topic.subjectId].latestCreatedAt)) {
                acc[topic.subjectId].latestCreatedAt = topic.createdAt;
            }
            
            return acc;
        }, {} as Record<string, {name: string, id: string, count: number, notes: string[], latestCreatedAt: string}>);
    }, [studyLog]);

    const availableSubjectNames = useMemo(() => {
        const subjects = new Set<string>();
        studyLog.forEach(t => { if ((t.shortNotes || '').length > 50) subjects.add(t.subject); });
        return Array.from(subjects).sort();
    }, [studyLog]);

    useEffect(() => {
        const checkSubjects = async () => {
            const available = new Set<string>();
            for (const subId of Object.keys(subjectsMap)) {
                try {
                    const audio = await getAudioFromIDB(`subject-recap-${subId}`);
                    if (audio) available.add(subId);
                } catch {
                    // Ignore
                }
            }
            setAvailableSubjects(available);
        };
        checkSubjects();
    }, [subjectsMap, state.downloadingIds]);

    const filteredTopics = useMemo(() => {
        return studyLog
            .filter(t => {
                const hasNotes = (t.shortNotes || '').length > 50;
                const matchesSubject = selectedSubjectFilter === 'all' || t.subject === selectedSubjectFilter;
                return hasNotes && matchesSubject;
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [studyLog, selectedSubjectFilter]);

    const downloadedItems = useMemo(() => {
        const topics = studyLog
            .filter(t => t.hasSavedAudio)
            .map(t => ({ ...t, sortDate: t.createdAt }));

        const subjects = Object.values(subjectsMap)
            .filter(s => availableSubjects.has(s.id))
            .map(s => ({
                id: `subject-recap-${s.id}`,
                topicName: `${s.name} (Full Recap)`,
                subject: s.name,
                isSubject: true,
                subjectId: s.id,
                shortNotes: s.notes.join('\n\n'),
                sortDate: s.latestCreatedAt
            }));

        return [...topics, ...subjects].sort((a, b) => 
            new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
        );
    }, [studyLog, subjectsMap, availableSubjects]);

    const handlePlaySubject = (subjectId: string) => {
        ensureAudioContext(); // Prime context on user gesture
        const subjectData = subjectsMap[subjectId];
        if (!subjectData) return;
        const mockSubjectTopic: Topic = {
            id: `subject-recap-${subjectId}`,
            subjectId: subjectId,
            subject: subjectData.name,
            topicName: `${subjectData.name} (Full Recap)`,
            shortNotes: subjectData.notes.join('\n\n'),
            pomodoroTimeMinutes: 0,
            repetitions: [],
            createdAt: new Date().toISOString()
        };
        controls.playTopic(mockSubjectTopic);
    };

    const handleDownload = async (topic: Topic, isSubjectRecap = false, e: React.MouseEvent) => {
        e.stopPropagation();
        if (state.downloadingIds.includes(topic.id)) return;

        const context = isSubjectRecap 
            ? topic.shortNotes 
            : `Topic: ${topic.topicName}\n${topic.shortNotes}`;
        
        await controls.downloadTopic(topic, context, 0, defaultLanguage || 'English', (audioData, script) => {
            if (!isSubjectRecap && onUpdateTopic) {
                onUpdateTopic({
                    ...topic,
                    podcastScript: script,
                    hasSavedAudio: true
                });
            }
        });
    };

    const handleDelete = async (topic: Topic, e: React.MouseEvent) => {
        e.stopPropagation();
        console.debug("[AudioLib] Delete requested", { id: topic.id });
        try {
            await deleteAudioFromIDB(topic.id);
            if (onUpdateTopic) {
                onUpdateTopic({
                    ...topic,
                    hasSavedAudio: false,
                    podcastAudio: undefined // Clear legacy field if present
                });
            }
            console.debug("[AudioLib] Delete complete, state cleared", { id: topic.id });
        } catch (error) {
            console.error("Failed to delete audio", error);
        }
    };

    const handleDeleteSubject = async (subjectId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        console.debug("[AudioLib] Delete requested (subject)", { id: subjectId });
        try {
            await deleteAudioFromIDB(`subject-recap-${subjectId}`);
            setAvailableSubjects(prev => {
                const next = new Set(prev);
                next.delete(subjectId);
                return next;
            });
            console.debug("[AudioLib] Delete complete (subject)", { id: subjectId });
        } catch (error) {
            console.error("Failed to delete subject audio", error);
        }
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };

    const handleRevisit = () => {
        if (!displayTopic) return;
        const topic = displayTopic;
        
        if (topic.id.startsWith('subject-recap')) {
             alert("Subject recaps are generated on the fly and cannot be saved to Difficult Topics.");
             return;
        }

        const isMarked = !!topic.isMarkedDifficult;
        const newStatus = !isMarked;

        const updatedRepetitions = [...(topic.repetitions || [])];
        if (newStatus && updatedRepetitions.length > 0) {
             const today = new Date().toISOString().split('T')[0];
             const lastRep = updatedRepetitions[updatedRepetitions.length - 1];
             updatedRepetitions[updatedRepetitions.length - 1] = {
                ...lastRep,
                nextReviewDate: today
            };
        }

        const updatedTopic = { 
            ...topic, 
            repetitions: updatedRepetitions,
            isMarkedDifficult: newStatus
        };
        onUpdateTopic(updatedTopic);
    };

    const renderTranscript = (text: string) => {
        if (!text) return null;
        // Support $$, \[ \] for block math and $, \( \) for inline math
        const blockMathRegex = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g;
        const inlineMathRegex = /\$([\s\S]*?)\$|\\\(([\s\S]*?)\\\)/g;

        return text.split('\n').map((line, i) => {
            if (!line.trim()) return <br key={i} />;
            let processedLine = line;
            const blockMatches: string[] = [];
            
            // 1. Process Block Math
            processedLine = processedLine.replace(blockMathRegex, (match, p1, p2) => {
                const formula = p1 || p2;
                try {
                    const html = katex.renderToString(formula, { displayMode: true, throwOnError: false });
                    blockMatches.push(html);
                    return `__BLOCK_MATH_${blockMatches.length - 1}__`;
                } catch {
                    return match;
                }
            });

            // 2. Process Inline Math
            processedLine = processedLine.replace(inlineMathRegex, (match, p1, p2) => {
                const formula = p1 || p2;
                try {
                    const html = katex.renderToString(formula, { displayMode: false, throwOnError: false });
                    return html;
                } catch {
                    return match;
                }
            });

            // 3. Restore Block Math
            blockMatches.forEach((html, index) => {
                processedLine = processedLine.replace(`__BLOCK_MATH_${index}__`, html);
            });

            // 4. Bold markdown
            processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

            // 5. Bold speaker names (if not already bolded by markdown)
            processedLine = processedLine.replace(/^([A-Za-z0-9\s]+):/g, '<strong class="text-gray-900 dark:text-white">$1:</strong>');
            
            return <p key={i} className="mb-2" dangerouslySetInnerHTML={{ __html: processedLine }}></p>;
        });
    };

    return (
        <div className="flex flex-col grow -mx-4 -mt-4 w-[calc(100%+2rem)] h-[calc(100%+2rem)] bg-[#FDF6E3] dark:bg-gray-900 text-gray-800 dark:text-gray-100 relative z-0">
            
            {showPlayerUI ? (
                 <div className="flex flex-col h-full relative px-6 py-4 overflow-y-auto no-scrollbar">
                     {/* Player Header */}
                    <div className="flex justify-between items-center mb-6 shrink-0 relative z-[60]">
                        <button 
                            type="button"
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                onMinimize(); 
                            }}
                            className="p-2 bg-white/50 dark:bg-gray-800/50 rounded-full text-gray-600 dark:text-gray-300 pointer-events-auto cursor-pointer shadow-sm relative z-[60]"
                        >
                            <ChevronDown size={24} />
                        </button>
                        <span className="text-sm font-bold tracking-widest uppercase text-gray-500 dark:text-gray-400">Now Playing</span>
                        <div className="w-10"></div> 
                    </div>

                    {/* Album Art Area - Dynamic Theme Gradient */}
                    <div className={`w-full aspect-square rounded-[32px] bg-gradient-to-br from-${themeColor}-200 to-${themeColor}-400 dark:from-${themeColor}-900 dark:to-${themeColor}-800 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] mb-8 flex flex-col items-center justify-center overflow-hidden relative shrink-0 transition-all duration-300`}>
                         {showScript ? (
                             <div className="w-full h-full bg-white dark:bg-gray-800 p-6 overflow-y-auto text-sm leading-relaxed text-gray-700 dark:text-gray-300 rounded-[32px] shadow-inner">
                                <h3 className="font-bold mb-3 text-gray-900 dark:text-white sticky top-0 bg-white dark:bg-gray-800 py-1">Transcript</h3>
                                {state.generatedScript ? (
                                    <div className="text-xs space-y-2">
                                        {renderTranscript(state.generatedScript)}
                                    </div>
                                ) : (
                                    <p className="italic text-gray-400">Notes available in raw format only.</p>
                                )}
                             </div>
                         ) : (
                             <div className="flex flex-col items-center justify-center w-full h-full relative">
                                 {/* Background elements */}
                                 <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/noise.png')]"></div>
                                 <div className="absolute bottom-4 left-0 right-0 text-center text-white/80 text-[10px] font-bold uppercase tracking-widest">
                                     Engram AI Podcast
                                 </div>
                             </div>
                         )}
                    </div>

                    {/* Track Info */}
                    <div className="flex justify-between items-start mb-8 shrink-0">
                        <div className="flex-1 pr-4">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight mb-1 line-clamp-2">{displayTopic?.topicName || state.status}</h2>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Deep Dive • Kittu & Kashish</p>
                        </div>
                        <button 
                            onClick={() => setShowScript(!showScript)}
                            className={`p-3 rounded-full shadow-sm transition ${showScript ? `bg-${themeColor}-100 text-${themeColor}-600` : 'bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                            title="View Transcript"
                        >
                            <FileText size={20} />
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-6 shrink-0 group">
                        <input 
                           type="range" 
                           min="0" 
                           max={state.duration || 100} 
                           value={state.currentTime} 
                           onChange={(e) => controls.seek(parseFloat(e.target.value))}
                           className={`w-full h-1.5 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-${themeColor}-600`}
                        />
                        <div className="flex justify-between text-xs font-bold text-gray-400 mt-2 font-mono group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
                            <span>{formatTime(state.currentTime)}</span>
                            <span>{formatTime(state.duration)}</span>
                        </div>
                    </div>

                    {/* Main Controls */}
                    <div className="flex flex-col items-center mb-10 shrink-0 space-y-6">
                        <div className="flex items-center justify-between w-full px-2">
                            <button onClick={() => controls.skip(-10)} className="flex flex-col items-center p-3 text-gray-400 hover:text-gray-700 dark:hover:text-white transition rounded-full hover:bg-black/5 dark:hover:bg-white/5">
                                <Rewind size={28} />
                                <span className="text-[10px] font-bold mt-1">-10s</span>
                            </button>
                            
                            <button 
                               onClick={controls.togglePlay}
                               className={`w-20 h-20 bg-${themeColor}-600 rounded-[24px] text-white flex items-center justify-center shadow-xl hover:scale-105 transition active:scale-95`}
                            >
                               {state.isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                            </button>

                            <button onClick={() => controls.skip(10)} className="flex flex-col items-center p-3 text-gray-400 hover:text-gray-700 dark:hover:text-white transition rounded-full hover:bg-black/5 dark:hover:bg-white/5">
                                <FastForward size={28} />
                                <span className="text-[10px] font-bold mt-1">+10s</span>
                            </button>
                        </div>

                        {/* Speed Controls */}
                        <div className="flex items-center bg-black/5 dark:bg-white/5 rounded-full px-4 py-1.5 space-x-4">
                            <button 
                                onClick={() => controls.setPlaybackRate(state.playbackRate - 0.25)}
                                className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white transition rounded-full hover:bg-black/10"
                                title="Decrease Speed"
                            >
                                <Minus size={18} />
                            </button>
                            <div className="flex flex-col items-center min-w-[60px]">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Speed</span>
                                <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{state.playbackRate.toFixed(2)}x</span>
                            </div>
                            <button 
                                onClick={() => controls.setPlaybackRate(state.playbackRate + 0.25)}
                                className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white transition rounded-full hover:bg-black/10"
                                title="Increase Speed"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex justify-center items-center px-6 mt-auto shrink-0 pb-4">
                        <button 
                            onClick={handleRevisit}
                            disabled={!displayTopic || displayTopic.id.startsWith('subject-recap')}
                            className={`flex flex-col items-center justify-center px-8 py-3 rounded-2xl font-bold shadow-sm border transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed w-full ${
                                displayTopic?.isMarkedDifficult 
                                    ? `bg-${themeColor}-600 text-white border-${themeColor}-600` 
                                    : `bg-${themeColor}-50 dark:bg-${themeColor}-900/20 text-${themeColor}-700 dark:text-${themeColor}-300 border-${themeColor}-200 dark:border-${themeColor}-800 hover:bg-${themeColor}-100 dark:hover:bg-${themeColor}-900/40`
                            }`}
                        >
                            <div className="flex items-center space-x-2">
                                <Bookmark size={20} className={displayTopic?.isMarkedDifficult ? "fill-current" : ""} />
                                <span>{displayTopic?.isMarkedDifficult ? "Saved to Difficult Topics" : "Found this difficult? Re-visit Soon"}</span>
                            </div>
                            <span className={`text-[10px] font-normal mt-1 ${displayTopic?.isMarkedDifficult ? 'text-white/80' : 'opacity-70'}`}>
                                {displayTopic?.isMarkedDifficult ? "Tap to remove from folder" : "Tap to save for later review"}
                            </span>
                        </button>
                    </div>
                 </div>
            ) : (
                // Library View
                <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-2xl overflow-hidden">
                     <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-[60] pointer-events-auto">
                        <button 
                            type="button"
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                onMinimize(); 
                            }}
                            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full pointer-events-auto cursor-pointer relative z-[60]"
                        >
                            <Minimize2 size={24} />
                        </button>
                        <span className="text-sm font-bold text-gray-500">Audio Library</span>
                        <button 
                            type="button"
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                onMinimize(); 
                            }}
                            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full pointer-events-auto cursor-pointer relative z-[60]"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Library Tabs */}
                    <div className="p-4 pb-0">
                        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-2">
                            <button 
                                onClick={() => setLibraryTab('topics')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                                    libraryTab === 'topics' 
                                    ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-white' 
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                                }`}
                            >
                                Topics
                            </button>
                            <button 
                                onClick={() => setLibraryTab('subjects')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                                    libraryTab === 'subjects' 
                                    ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-white' 
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                                }`}
                            >
                                Subjects
                            </button>
                            <button 
                                onClick={() => setLibraryTab('downloads')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                                    libraryTab === 'downloads' 
                                    ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-white' 
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                                }`}
                            >
                                Downloads
                            </button>
                        </div>
                    </div>
                    
                    <div className="p-4 overflow-y-auto">
                        <div className="mb-6 text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-3xl">
                            <div className={`w-20 h-20 mx-auto bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center text-green-500 mb-4`}>
                                {libraryTab === 'downloads' ? <Download size={32} /> : <Mic2 size={32} />}
                            </div>
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                                {libraryTab === 'downloads' ? 'Offline Library' : 'AI Deep Dive'}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 px-8 mt-2">
                                {libraryTab === 'topics' 
                                    ? "Select a topic for a deep dive conversation." 
                                    : libraryTab === 'subjects'
                                    ? "Select a subject for a full comprehensive recap (10-15 min)."
                                    : "Listen to your saved podcasts even without internet."}
                            </p>
                        </div>

                        {/* List Items */}
                        {libraryTab === 'topics' && availableSubjectNames.length > 0 && (
                            <div className="flex space-x-2 mb-4 overflow-x-auto no-scrollbar px-1 pb-1">
                                <button
                                    onClick={() => setSelectedSubjectFilter('all')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${
                                        selectedSubjectFilter === 'all'
                                        ? `bg-${themeColor}-100 border-${themeColor}-200 text-${themeColor}-700 dark:bg-${themeColor}-900/30 dark:border-${themeColor}-800 dark:text-${themeColor}-300`
                                        : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                                    }`}
                                >
                                    All
                                </button>
                                {availableSubjectNames.map(sub => (
                                    <button
                                        key={sub}
                                        onClick={() => setSelectedSubjectFilter(sub)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${
                                            selectedSubjectFilter === sub
                                            ? `bg-${themeColor}-100 border-${themeColor}-200 text-${themeColor}-700 dark:bg-${themeColor}-900/30 dark:border-${themeColor}-800 dark:text-${themeColor}-300`
                                            : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                                        }`}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>
                        )}

                        <h3 className="text-md font-bold text-gray-800 dark:text-white mb-4 px-2">Ready to Play</h3>
                        
                        <div className="space-y-3">
                            {libraryTab === 'topics' ? (
                                filteredTopics.map(topic => {
                                    const hasAudio = topic.hasSavedAudio || !!(topic as Record<string, unknown>).podcastAudio;
                                    const isDownloading = state.downloadingIds.includes(topic.id);
                                    
                                    return (
                                        <div
                                            key={topic.id}
                                            className={`w-full flex items-center p-3 rounded-2xl border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/80 transition text-left group relative pr-14 cursor-pointer border-gray-100 dark:border-gray-700`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                ensureAudioContext(); // Prime context
                                                controls.playTopic(topic, onUpdateTopic);
                                            }}
                                        >
                                            {/* Dynamic Theme Color Icon Pill */}
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition mr-4 shrink-0 bg-${themeColor}-50 dark:bg-${themeColor}-900/30 text-${themeColor}-600`}>
                                                {state.loading && state.currentTopic?.id === topic.id ? 
                                                    <Loader size={20} className="animate-spin" /> : 
                                                    <Play size={20} fill="currentColor" />
                                                }
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center space-x-2">
                                                    <p className="font-bold text-gray-800 dark:text-white truncate">{topic.topicName}</p>
                                                </div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{topic.subject} • Deep Dive</p>
                                            </div>
                                            <button 
                                                onClick={(e) => {
                                                    if (hasAudio) handleDelete(topic, e);
                                                    else handleDownload(topic, false, e);
                                                }}
                                                // Dynamic Theme Hover States for Action Button
                                                className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition ${
                                                    isDownloading ? '' :
                                                    hasAudio ? 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30' :
                                                    `text-gray-400 hover:text-${themeColor}-500 hover:bg-${themeColor}-50 dark:hover:bg-${themeColor}-900/30`
                                                }`}
                                                disabled={isDownloading}
                                                title={hasAudio ? "Delete Download" : "Download for Offline"}
                                            >
                                                {isDownloading ? (
                                                    <div className={`w-10 h-10 border-4 border-${themeColor}-200 border-t-${themeColor}-500 rounded-lg animate-spin`}></div>
                                                ) : hasAudio ? (
                                                    <Trash2 size={18} />
                                                ) : (
                                                    <Download size={18} />
                                                )}
                                            </button>
                                        </div>
                                    );
                                })
                            ) : libraryTab === 'subjects' ? (
                                Object.values(subjectsMap)
                                    .sort((a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime())
                                    .map((subject: Record<string, unknown>) => {
                                        const mockTopicId = `subject-recap-${subject.id}`;
                                        const isDownloading = state.downloadingIds.includes(mockTopicId);
                                        const hasAudio = availableSubjects.has(subject.id as string);

                                    return (
                                        <div
                                            key={subject.id as string}
                                            className="w-full flex items-center p-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-left group relative pr-14 cursor-pointer"
                                            onClick={() => handlePlaySubject(subject.id as string)}
                                        >
                                            {/* Dynamic Theme Color Icon Pill */}
                                            <div className={`w-12 h-12 rounded-xl bg-${themeColor}-50 dark:bg-${themeColor}-900/30 flex items-center justify-center text-${themeColor}-600 mr-4 shrink-0`}>
                                                {state.loading && state.currentTopic?.id === mockTopicId ? <Loader size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-gray-800 dark:text-white truncate">{subject.name as string} Recap</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subject.count as number} topics • Full Recap</p>
                                            </div>
                                            <button 
                                                onClick={(e) => {
                                                    if (hasAudio) handleDeleteSubject(subject.id as string, e);
                                                    else {
                                                        const mockSubjectTopic: Topic = {
                                                            id: mockTopicId,
                                                            subjectId: subject.id as string,
                                                            subject: subject.name as string,
                                                            topicName: `${subject.name} (Full Recap)`,
                                                            shortNotes: (subject.notes as string[]).join('\n\n'),
                                                            pomodoroTimeMinutes: 0,
                                                            repetitions: [],
                                                            createdAt: new Date().toISOString()
                                                        };
                                                        handleDownload(mockSubjectTopic, true, e);
                                                    }
                                                }}
                                                className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition ${
                                                    isDownloading ? '' :
                                                    hasAudio ? 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30' :
                                                    `text-gray-400 hover:text-${themeColor}-500 hover:bg-${themeColor}-50 dark:hover:bg-${themeColor}-900/30`
                                                }`}
                                                disabled={isDownloading}
                                                title={hasAudio ? "Delete Download" : "Download for Offline"}
                                            >
                                                {isDownloading ? (
                                                    <div className={`w-10 h-10 border-4 border-${themeColor}-200 border-t-${themeColor}-500 rounded-lg animate-spin`}></div>
                                                ) : hasAudio ? (
                                                    <Trash2 size={18} />
                                                ) : (
                                                    <Download size={18} />
                                                )}
                                            </button>
                                        </div>
                                    );
                                })
                            ) : (
                                // Downloads Tab
                                downloadedItems.length === 0 ? (
                                    <div className="text-center py-10">
                                        <p className="text-gray-400 text-sm">No downloaded podcasts yet.</p>
                                    </div>
                                ) : (
                                    downloadedItems.map((item: Record<string, unknown>) => {
                                        const isSubject = !!item.isSubject;
                                        
                                        return (
                                            <div
                                                key={item.id as string}
                                                className="w-full flex items-center p-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-left group relative pr-14 cursor-pointer"
                                                onClick={() => {
                                                    if (isSubject) handlePlaySubject(item.subjectId as string);
                                                    else controls.playTopic(item as unknown as Topic, onUpdateTopic);
                                                }}
                                            >
                                                <div className={`w-12 h-12 rounded-xl bg-${themeColor}-50 dark:bg-${themeColor}-900/30 flex items-center justify-center text-${themeColor}-600 mr-4 shrink-0`}>
                                                    {state.loading && state.currentTopic?.id === item.id ? <Loader size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-gray-800 dark:text-white truncate">{item.topicName as string}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                        {item.subject as string} • {isSubject ? 'Subject Recap' : 'Deep Dive'}
                                                    </p>
                                                </div>
                                                <button 
                                                    onClick={(e) => {
                                                        if (isSubject) handleDeleteSubject(item.subjectId as string, e);
                                                        else handleDelete(item as unknown as Topic, e);
                                                    }}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                                                    title="Delete Download"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        );
                                    })
                                )
                            )}
                        </div>
                        {libraryTab === 'topics' && filteredTopics.length === 0 && (
                            <p className="text-center text-sm text-gray-400 italic py-4">No topics found.</p>
                        )}
                        {libraryTab === 'subjects' && Object.keys(subjectsMap).length === 0 && (
                            <p className="text-center text-sm text-gray-400 italic py-4">No subjects found.</p>
                        )}
                    </div>
                </div>
            )}

            {(state.loading || state.error) && (
                <PodcastStatusOverlay 
                    state={state} 
                    controls={controls} 
                    themeColor={themeColor} 
                    onMinimize={onMinimize}
                />
            )}
        </div>
    );
};
