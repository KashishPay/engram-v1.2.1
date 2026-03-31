
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GraduationCap, ListRestart, PieChart, Filter, Layers, RotateCw, Check, X, Calendar, TrendingUp, AlertTriangle, ChevronRight, ChevronDown, ChevronUp, History, RefreshCcw, Settings2, Trash2, Undo2, XCircle } from 'lucide-react';
import { Card } from '../components/Card';
import { ProgressChart } from '../components/ProgressChart';
import { Topic, Subject, UserProfile, FlashCard } from '../types';
import { SPACING_INTERVALS, FLASHCARD_SCHEMA } from '../constants';
import { callGeminiApiWithRetry } from '../services/gemini';
import { getTopicBodyFromIDB } from '../services/storage';
import { TopicSelectorModal } from '../components/TopicSelectorModal'; 
import katex from 'katex';
import DOMPurify from 'dompurify';
import { triggerHaptic } from '../utils/haptics';
import { AdManager } from '../services/admob';

const injectAdCards = (cards: FlashCard[]): FlashCard[] => {
    let config = AdManager.getConfig();
    
    // Fallback config if network hasn't finished loading yet
    if (!config) {
        config = {
            banner_ad_unit_id: 'ca-app-pub-3940256099942544/6300978111',
            min_interval: 3,
            max_interval: 5,
            is_active: true
        };
    }

    if (!config.is_active || cards.length === 0) return cards;

    const newCards: FlashCard[] = [];
    let nextAdIndex = Math.floor(Math.random() * (config.max_interval - config.min_interval + 1)) + config.min_interval;
    let cardsSinceLastAd = 0;

    for (let i = 0; i < cards.length; i++) {
        newCards.push(cards[i]);
        cardsSinceLastAd++;

        if (cardsSinceLastAd >= nextAdIndex && i !== cards.length - 1) {
            newCards.push({
                id: `ad-${Date.now()}-${i}`,
                front: 'AD_PLACEHOLDER',
                back: 'AD_PLACEHOLDER',
                isAd: true
            });
            cardsSinceLastAd = 0;
            nextAdIndex = Math.floor(Math.random() * (config.max_interval - config.min_interval + 1)) + config.min_interval;
        }
    }
    return newCards;
};

interface HomeViewProps {
    studyLog: Topic[];
    allSubjects: Subject[];
    navigateTo: (view: string, data?: unknown) => void;
    userId: string | null;
    themeColor: string;
    userProfile: UserProfile;
    loading?: boolean;
}

const HomeSkeleton = () => (
    <div className="p-4 space-y-6 animate-pulse">
        <div className="flex justify-between items-center mb-2">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
        </div>
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
    </div>
);

const FlashCardDeck: React.FC<{ 
    topics: Topic[], 
    allSubjects: Subject[], 
    themeColor: string, 
    dueTopics: Topic[], 
    onReview: (topic: Topic) => void,
    userId: string,
    navigateTo: (view: string) => void
}> = ({ topics, allSubjects, themeColor, dueTopics, onReview, userId, navigateTo }) => {
    const [cards, setCards] = useState<FlashCard[]>([]);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    const [swipe, setSwipe] = useState<'left' | 'right' | null>(null);
    const [adDelay, setAdDelay] = useState(0);
    const [completed, setCompleted] = useState(false);
    const [cardHistory, setCardHistory] = useState<FlashCard[]>(() => {
        try {
            const scopedKey = `engram-flashcard-history_${userId}`;
            const saved = localStorage.getItem(scopedKey);
            if (saved) return JSON.parse(saved);
            return [];
        } catch { return []; }
    });
    
    // Config State
    const [showSelector, setShowSelector] = useState(false);
    const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
    const [showRevisitOptions, setShowRevisitOptions] = useState(false);

    // Font Size State (Persisted)
    const [fontScale, setFontScale] = useState<number>(() => {
        try {
            return parseFloat(localStorage.getItem(`engram_fc_font_${userId}`) || '1.25'); // Default 1.25rem (~text-xl)
        } catch { return 1.25; }
    });

    // Undo State
    const [deletedCard, setDeletedCard] = useState<{ card: FlashCard, index: number } | null>(null);
    const undoTimeoutRef = useRef<number | null>(null);

    // Initial Selection Sync: Empty means nothing selected.
    const effectiveSelectionForModal = useMemo(() => {
        return selectedTopicIds;
    }, [selectedTopicIds]);

    useEffect(() => {
        try {
            const scopedKey = `engram-flashcard-history_${userId}`;
            const saved = localStorage.getItem(scopedKey);
            if (saved) setCardHistory(JSON.parse(saved));
            else setCardHistory([]);
        } catch { setCardHistory([]); }
    }, [userId]);

    const saveHistory = (newHistory: FlashCard[]) => {
        setCardHistory(newHistory);
        localStorage.setItem(`engram-flashcard-history_${userId}`, JSON.stringify(newHistory));
    };

    const handleFontChange = (delta: number, e: React.MouseEvent) => {
        e.stopPropagation();
        triggerHaptic.selection();
        setFontScale(prev => {
            const next = Math.min(Math.max(0.75, prev + delta), 3.0); // Clamp between 0.75rem and 3.0rem
            localStorage.setItem(`engram_fc_font_${userId}`, next.toString());
            return next;
        });
    };

    const generateCards = async (overrideIds?: string[]) => {
        const idsToUse = Array.isArray(overrideIds) ? overrideIds : selectedTopicIds;
        const pool = topics.filter(t => idsToUse.includes(t.id));
        
        if (pool.length === 0) {
            setShowSelector(true);
            return;
        }

        let desiredCount = 5;
        let persona = "";
        try {
            const prefsRaw = localStorage.getItem(`engram_ai_preferences_${userId}`) || '{}';
            const prefs = JSON.parse(prefsRaw);
            desiredCount = Number(prefs?.flashcards?.cardsPerDeck) || 5;
            if (prefs?.flashcards?.persona) {
                persona = prefs.flashcards.persona;
            }
        } catch {
            // Ignore parse errors
        }
        desiredCount = Math.min(20, Math.max(5, desiredCount)); 
        
        console.debug("[FLASHCARDS] requested", { desiredCount, poolSize: pool.length });
        
        setLoading(true);
        setCompleted(false);
        setIndex(0);
        setCards([]); 
        setShowRevisitOptions(false);
        triggerHaptic.impact('Light');
        
        const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, desiredCount);
        
        // --- MEMORY OPTIMIZATION START ---
        // Sequential loading to prevent OOM on mobile when handling large note sets
        let context = "";
        
        for (const t of shuffled) {
            try {
                // Check if notes are already in memory, otherwise fetch from IDB
                let notesContent = t.shortNotes;
                if (!notesContent || notesContent.length === 0) {
                    notesContent = await getTopicBodyFromIDB(userId, t.id) || "";
                }
                
                // Truncate immediately to save RAM. 
                // 1000 chars is plenty for flashcard generation context per topic.
                const snippet = notesContent.substring(0, 1000); 
                
                if (snippet.trim().length > 0) {
                    context += `Subject: ${t.subject}\nTopic: ${t.topicName}\nNotes: ${snippet}\n\n---\n\n`;
                }
            } catch (e) {
                console.warn(`[FLASHCARDS] Failed to load context for ${t.topicName}`, e);
            }
        }
        // --- MEMORY OPTIMIZATION END ---
        
        const recentFronts = cardHistory.slice(-30).map(c => c.front);
        const avoidInstruction = recentFronts.length > 0 
            ? `\n\nIMPORTANT CONSTRAINT: Do NOT repeat the following questions or concepts. Generate unique content:\n- ${recentFronts.join('\n- ')}` 
            : '';

        const prompt = `Generate ${desiredCount} flashcards based on the provided notes. 
        IMPORTANT: Create a mix of questions covering different topics from the provided content if possible.
        The front should be a concept or question, the back should be the explanation.
        Use LaTeX for all math expressions (e.g., $E=mc^2$).
        ${avoidInstruction}
        
        Source Material:
        ${context}`;
        
        const systemInstr = persona 
            ? `You are a flashcard generator. Persona: ${persona}`
            : "You are a flashcard generator.";

        try {
            const data = await callGeminiApiWithRetry(
                prompt, 
                systemInstr, 
                FLASHCARD_SCHEMA,
                null,
                null,
                3,
                'gemini-3-flash-preview',
                'flashcards'
            );

            if (data?.flashcards && Array.isArray(data.flashcards)) {
                let list = data.flashcards;
                if (list.length > desiredCount) list = list.slice(0, desiredCount);

                const isMixed = effectiveIds.length > 1;

                const newCards = list.map((c: Record<string, unknown>) => ({
                    ...c,
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    front: c.front as string,
                    back: c.back as string,
                    subject: isMixed ? 'Mixed' : shuffled[0]?.subject || 'General',
                    topicName: shuffled.length === 1 ? shuffled[0].topicName : 'Mixed Review',
                    createdAt: new Date().toISOString(),
                    lastResult: undefined
                }));
                
                setCards(injectAdCards(newCards));
                triggerHaptic.notification('Success');
                const updatedHistory = [...cardHistory, ...newCards];
                if (updatedHistory.length > 200) updatedHistory.splice(0, updatedHistory.length - 200);
                saveHistory(updatedHistory);
            } else {
                console.error("Invalid flashcard data received");
            }
        } catch (_e) {
            console.error(_e);
            triggerHaptic.notification('Error');
            if (_e instanceof Error && (_e.message?.includes("add your own free API Key") || _e.name === 'UsageLimitError')) {
                 if (confirm("The standard AI quota is currently busy or limited.\n\nWould you like to add your own free API Key in Settings for faster, priority access?")) {
                     navigateTo('settings');
                 }
            } else {
                 alert("Failed to generate cards. Please check your connection.");
            }
        } finally {
            setLoading(false);
        }
    };

    const revisitCards = (filter: 'all' | 'missed' | 'others' = 'all') => {
        let historyPool = cardHistory; 

        if (filter === 'missed') {
            historyPool = historyPool.filter(c => c.lastResult === 'unknown');
        } else if (filter === 'others') {
            historyPool = historyPool.filter(c => c.lastResult !== 'unknown');
        }

        if (historyPool.length === 0) {
            alert(filter === 'missed' ? "No cards marked as 'Unknown' found!" : "No saved cards found.");
            return;
        }

        const shuffled = [...historyPool].sort(() => 0.5 - Math.random());
        setCards(injectAdCards(shuffled));
        setIndex(0);
        setCompleted(false);
        setIsFlipped(false);
        setShowRevisitOptions(false);
        triggerHaptic.selection();
    };

    const handleSwipe = (direction: 'left' | 'right') => {
        if (swipe) return; 
        setSwipe(direction);
        triggerHaptic.impact('Medium'); // Swipe haptic
        
        const currentCard = cards[index];
        if (currentCard && !currentCard.isAd) {
            const updatedCard: FlashCard = { ...currentCard, lastResult: direction === 'left' ? 'unknown' : 'known' };
            const newCards = [...cards];
            newCards[index] = updatedCard;
            setCards(newCards);
            const historyIndex = cardHistory.findIndex(c => c.id === currentCard.id);
            let updatedHistory;
            if (historyIndex >= 0) {
                updatedHistory = [...cardHistory];
                updatedHistory[historyIndex] = updatedCard;
            } else {
                updatedHistory = [...cardHistory, updatedCard];
            }
            saveHistory(updatedHistory);
        }
        setTimeout(() => {
            setIndex(prev => {
                const nextIndex = prev + 1;
                if (nextIndex >= cards.length) {
                    setCompleted(true);
                    triggerHaptic.notification('Success');
                    return prev; 
                }
                return nextIndex;
            });
            setSwipe(null);
            setIsFlipped(false);
        }, 300); 
    };

    const handleDeleteCard = (e: React.MouseEvent) => {
        e.stopPropagation();
        triggerHaptic.impact('Medium');
        const currentCard = cards[index];
        if (!currentCard) return;

        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);

        const newCards = cards.filter((_, i) => i !== index);
        setCards(newCards);
        
        const newHistory = cardHistory.filter(c => c.id !== currentCard.id);
        saveHistory(newHistory);

        setDeletedCard({ card: currentCard, index: index }); 
        
        undoTimeoutRef.current = window.setTimeout(() => {
            setDeletedCard(null);
            undoTimeoutRef.current = null;
        }, 5000);

        if (newCards.length === 0) {
            setCompleted(true);
        } else if (index >= newCards.length) {
            if (index > 0) setIndex(index - 1);
            else setCompleted(true);
        }
        
        setIsFlipped(false);
    };

    const handleUndoDelete = () => {
        if (!deletedCard) return;
        triggerHaptic.selection();
        
        const newHistory = [...cardHistory, deletedCard.card];
        saveHistory(newHistory);

        const newCards = [...cards];
        newCards.splice(deletedCard.index, 0, deletedCard.card);
        setCards(newCards);
        
        setIndex(deletedCard.index);
        setIsFlipped(false);
        setCompleted(false);

        setDeletedCard(null);
        if (undoTimeoutRef.current) {
            clearTimeout(undoTimeoutRef.current);
            undoTimeoutRef.current = null;
        }
    };

    useEffect(() => {
        const currentCard = cards[index];
        if (currentCard?.isAd && !completed) {
            AdManager.showFlashcardBanner();
            setAdDelay(3); // 3 seconds delay for ads
            const timer = setInterval(() => {
                setAdDelay(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => {
                clearInterval(timer);
                AdManager.hideBanner();
            };
        } else {
            setAdDelay(0);
            AdManager.hideBanner();
        }
        
        return () => {
            AdManager.hideBanner();
        };
    }, [index, cards, completed]);

    const renderCardContent = (text: string) => {
        if (!text) return "";
        
        // Support $$, \[ \] for block math and $, \( \) for inline math
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
            } catch {
                return match;
            }
        });
        
        processedText = processedText.replace(inlineMathRegex, (match, p1, p2) => {
            const formula = p1 || p2;
            try {
                const html = katex.renderToString(formula, { displayMode: false, throwOnError: false });
                return html;
            } catch {
                return match;
            }
        });
        
        blockMatches.forEach((html, index) => {
            const wrapper = `<div>${html}</div>`;
            processedText = processedText.replace(`__BLOCK_MATH_${index}__`, wrapper);
        });
        
        processedText = processedText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-700 px-1 rounded font-mono text-sm text-red-500">$1</code>')
            .replace(/\n/g, '<br />');
            
        return DOMPurify.sanitize(processedText, {
            ADD_TAGS: ['math', 'annotation', 'semantics', 'mtext', 'mn', 'mo', 'mi', 'msup', 'msub', 'mfrac', 'span', 'div', 'strong', 'em', 'code', 'br'],
            ADD_ATTR: ['xmlns', 'display', 'mathvariant', 'class']
        });
    };

    if (loading) {
        return (
            <div className={`p-10 flex flex-col items-center justify-center text-${themeColor}-600 dark:text-${themeColor}-400`}>
                <RotateCw size={32} className="animate-spin mb-4" />
                <p className="font-semibold text-sm">Generating AI Flashcards...</p>
            </div>
        );
    }

    if (cards.length === 0 || completed) {
        // Summary View logic...
        const totalHistoryCount = cardHistory.length;
        const missedCount = cardHistory.filter(c => c.lastResult === 'unknown').length;
        const savedCount = totalHistoryCount - missedCount;
        const selectionLabel = selectedTopicIds.length === 0
            ? 'Select Topics'
            : selectedTopicIds.length === topics.length 
                ? 'All Subjects' 
                : `${selectedTopicIds.length} Selected`;

        return (
            <div className="p-6 text-center">
                <TopicSelectorModal 
                    isOpen={showSelector}
                    onClose={() => setShowSelector(false)}
                    onConfirm={(ids) => {
                        setSelectedTopicIds(ids);
                        generateCards(ids);
                    }}
                    topics={topics}
                    subjects={allSubjects}
                    initialSelection={effectiveSelectionForModal}
                    themeColor={themeColor}
                />

                <div className={`w-16 h-16 bg-${themeColor}-100 dark:bg-${themeColor}-900 text-${themeColor}-600 dark:text-${themeColor}-300 rounded-full flex items-center justify-center mx-auto mb-4`}>
                    <Layers size={32} />
                </div>
                {dueTopics.length > 0 && !completed && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800 animate-pulse">
                        <div className="flex items-center justify-center mb-2 text-red-600 dark:text-red-400">
                            <ListRestart size={24} className="mr-2"/>
                            <span className="font-bold">Review Required</span>
                        </div>
                        <p className="text-xs text-red-700 dark:text-red-300 mb-3">{dueTopics.length} topics are due for spaced repetition.</p>
                        <button 
                            onClick={() => onReview(dueTopics[0])} 
                            data-testid="start-review-btn"
                            className="w-full py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold text-sm shadow-md transition"
                        >
                            Start Reviewing the Quiz
                        </button>
                    </div>
                )}
                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{completed ? "Session Complete!" : "Practice Mode"}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{completed ? "Great job! Want to go another round?" : "Generate AI flashcards from your active topics to keep your memory sharp."}</p>
                <div className="space-y-3">
                    {!showRevisitOptions && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => { triggerHaptic.selection(); setShowSelector(true); }}
                                className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm flex items-center justify-between border border-transparent hover:border-gray-300 dark:hover:border-gray-600 transition"
                            >
                                <span className="truncate">{selectionLabel}</span>
                                <Settings2 size={16} />
                            </button>
                            <button 
                                onClick={() => generateCards()} 
                                disabled={topics.length === 0} 
                                className={`flex-1 py-3 px-4 bg-${themeColor}-500 text-white rounded-xl font-bold shadow-lg hover:bg-${themeColor}-600 transition disabled:opacity-50 text-sm`}
                            >
                                {topics.length === 0 ? "Add Topics" : selectedTopicIds.length === 0 ? "Select Topics" : "Generate Cards"}
                            </button>
                        </div>
                    )}
                    {(completed || cardHistory.length > 0) && !showRevisitOptions && (
                        <button onClick={() => { triggerHaptic.selection(); setShowRevisitOptions(true); }} className={`w-full py-3 bg-white dark:bg-gray-700 text-${themeColor}-600 dark:text-${themeColor}-400 border-2 border-${themeColor}-100 dark:border-${themeColor}-800 rounded-xl font-bold hover:bg-${themeColor}-50 dark:hover:bg-${themeColor}-900/30 transition flex flex-col items-center justify-center`}><span>Revisit Saved Cards</span><span className="text-[10px] opacity-70 font-normal">({totalHistoryCount} saved total)</span></button>
                    )}
                    {showRevisitOptions && (
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 border border-gray-100 dark:border-gray-700">
                             <div className="flex justify-between items-center mb-1">
                                 <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Select Review Mode</p>
                                 <button onClick={() => setShowRevisitOptions(false)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
                             </div>
                             <button onClick={() => revisitCards('missed')} disabled={missedCount === 0} className={`w-full py-3 rounded-xl font-bold flex justify-between px-4 items-center transition ${missedCount > 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'}`}><div className="flex items-center"><X size={16} className="mr-2" /><span>Review Missed</span></div><span className={`px-2 py-0.5 rounded-full text-xs ${missedCount > 0 ? 'bg-white/50 text-red-800 dark:text-red-200' : 'bg-gray-200 text-gray-500'}`}>{missedCount}</span></button>
                             <button onClick={() => revisitCards('others')} className="w-full py-3 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-xl font-bold flex justify-between px-4 items-center hover:bg-gray-50 dark:hover:bg-gray-600 transition"><div className="flex items-center"><RefreshCcw size={16} className="mr-2" /><span>Review All Saved</span></div><span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full text-xs text-gray-600 dark:text-gray-400">{savedCount}</span></button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (index >= cards.length) return null;
    const currentCard = cards[index];
    if (!currentCard) return null;

    return (
        <div className="p-4 h-[450px] flex flex-col items-center relative z-0">
            {deletedCard && (
                <div className="absolute top-0 z-30 flex items-center bg-gray-900 text-white text-xs py-2 px-4 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2">
                    <span className="mr-3 font-medium">Card deleted</span>
                    <button 
                        onClick={handleUndoDelete}
                        className="font-bold text-blue-300 hover:text-blue-200 flex items-center"
                    >
                        <Undo2 size={12} className="mr-1" /> Undo
                    </button>
                </div>
            )}

            <div className="relative w-full flex-1 flex items-center justify-center perspective-1000">
                {index + 1 < cards.length && <div className="absolute inset-0 bg-gray-100 dark:bg-gray-700 rounded-2xl border border-gray-200 dark:border-gray-600 transform scale-95 translate-y-3 z-0"></div>}
                
                {/* ACTIVE CARD FACE */}
                <div onClick={() => { if (!currentCard.isAd) { triggerHaptic.selection(); setIsFlipped(!isFlipped); } }} className={`absolute inset-0 z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-6 flex flex-col items-center justify-center text-center ${!currentCard.isAd ? 'cursor-pointer' : ''} transition-all duration-300 ${swipe === 'left' ? '-translate-x-[150%] rotate-[-15deg] opacity-0' : ''} ${swipe === 'right' ? 'translate-x-[150%] rotate-[15deg] opacity-0' : ''}`}>
                    
                    {/* Header Row: Q/A & Status */}
                    <div className="absolute top-4 left-4 flex items-center space-x-2 text-[10px] font-bold text-gray-400 tracking-widest uppercase z-20">
                        <span>{currentCard.isAd ? 'SPONSORED' : (isFlipped ? 'ANSWER' : 'QUESTION')}</span>
                        {!currentCard.isAd && currentCard.lastResult === 'unknown' && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[9px] font-bold flex items-center"><X size={8} className="mr-0.5"/> Missed</span>}
                        {!currentCard.isAd && currentCard.lastResult === 'known' && <span className="px-1.5 py-0.5 bg-green-100 text-green-600 rounded text-[9px] font-bold flex items-center"><Check size={8} className="mr-0.5"/> Known</span>}
                    </div>

                    {/* FONT CONTROLS - Top Right */}
                    {!currentCard.isAd && (
                        <div className="absolute top-3 right-3 flex items-center space-x-1 z-30" onClick={e => e.stopPropagation()}>
                            <button onClick={(e) => handleFontChange(-0.125, e)} className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition shadow-sm" title="Smaller Text">A-</button>
                            <button onClick={(e) => handleFontChange(0.125, e)} className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition shadow-sm" title="Larger Text">A+</button>
                        </div>
                    )}

                    {/* Card Content Area */}
                    <div className="flex-1 flex items-center justify-center w-full overflow-hidden mt-10 mb-6">
                        {currentCard.isAd ? (
                            <div className="text-gray-400 text-sm flex flex-col items-center">
                                <span className="mb-2">Advertisement</span>
                                <span className="text-xs opacity-50">Loading...</span>
                            </div>
                        ) : (
                            <div className="max-h-full overflow-y-auto no-scrollbar w-full px-2">
                                <div 
                                    style={{ fontSize: `${fontScale}rem` }}
                                    className={`font-medium leading-relaxed text-gray-800 dark:text-gray-100 break-words ${isFlipped ? `text-${themeColor}-600 dark:text-${themeColor}-400 font-semibold` : ''}`} 
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderCardContent(isFlipped ? (currentCard.back || "") : (currentCard.front || ""))) }} 
                                />
                            </div>
                        )}
                    </div>

                    {/* Footer Info: Subject & Hint */}
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
                        {!currentCard.isAd && currentCard.subject && <span className={`text-[10px] font-bold text-${themeColor}-400 uppercase tracking-wider`}>{currentCard.subject}</span>}
                        {!currentCard.isAd && <span className="text-[10px] text-gray-300">Tap to flip</span>}
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center w-full mt-6 z-20 gap-4">
                {!currentCard.isAd ? (
                    <button 
                        onClick={handleDeleteCard}
                        className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full shadow-sm text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition flex items-center justify-center active:scale-95"
                        title="Delete Saved Card"
                    >
                        <Trash2 size={18} />
                    </button>
                ) : (
                    <div className="w-10 h-10"></div>
                )}
                <div className="flex items-center space-x-6">
                    <button onClick={() => handleSwipe('left')} disabled={!!swipe || adDelay > 0} className={`w-14 h-14 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 text-red-500 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 hover:scale-110 transition disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed ${adDelay > 0 ? 'opacity-50' : ''}`}>
                        {adDelay > 0 ? <span className="text-lg font-bold text-gray-400">{adDelay}</span> : <X size={24} strokeWidth={3} />}
                    </button>
                    <div className="text-xs font-medium text-gray-400">{index + 1} / {cards.length}</div>
                    <button onClick={() => handleSwipe('right')} disabled={!!swipe || adDelay > 0} className={`w-14 h-14 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 text-green-500 flex items-center justify-center hover:bg-green-50 dark:hover:bg-green-900/20 hover:scale-110 transition disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed ${adDelay > 0 ? 'opacity-50' : ''}`}>
                        {adDelay > 0 ? <span className="text-lg font-bold text-gray-400">{adDelay}</span> : <Check size={24} strokeWidth={3} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const HomeView: React.FC<HomeViewProps> = React.memo(({ studyLog, allSubjects, navigateTo, userId, themeColor, userProfile, loading }) => {
    
    // If still loading and we have no data, show skeleton
    if (loading && (!studyLog || studyLog.length === 0)) {
        return <HomeSkeleton />;
    }

    const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
    const [showQuizDetails, setShowQuizDetails] = useState(true);
    
    const today = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const dueTopics = useMemo(() => studyLog.filter(topic => {
        if (topic.repetitions?.length === 0) return true;
        const lastRep = topic.repetitions[topic.repetitions.length - 1];
        return lastRep && lastRep.nextReviewDate <= today;
    }), [studyLog, today]);

    const activeTopics = useMemo(() => studyLog.filter(topic => {
        if (topic.repetitions?.length === 0) return false;
        const lastRep = topic.repetitions[topic.repetitions.length - 1];
        return lastRep && lastRep.nextReviewDate > today && topic.repetitions.length < SPACING_INTERVALS.length;
    }), [studyLog, today]);
    
    const criticalTopics = useMemo(() => {
        return studyLog.filter(topic => {
            const reps = topic.repetitions || [];
            if (reps.length >= 5) {
                const fifthRep = reps[4]; 
                const totalQs = fifthRep.totalQuestions || 10;
                let percentage = fifthRep.score > totalQs ? fifthRep.score : (fifthRep.score / totalQs) * 100;
                if (percentage > 100) percentage = 100;
                return percentage < 90; 
            }
            return false;
        });
    }, [studyLog]);

    const filteredTopics = useMemo(() => {
        return selectedSubjectFilter === 'all' 
            ? studyLog 
            : studyLog.filter(t => t.subjectId === selectedSubjectFilter);
    }, [studyLog, selectedSubjectFilter]);

    const statsTotalMinutes = filteredTopics.reduce((sum, t) => sum + (t.pomodoroTimeMinutes || 0), 0);
    const statsTotalHours = Math.floor(statsTotalMinutes / 60);
    const statsRemainingMins = Math.round(statsTotalMinutes % 60);
    const statsTotalQuizzes = filteredTopics.reduce((sum, t) => sum + (t.repetitions?.length || 0), 0);
    
    const quizzedTopics = useMemo(() => {
        return filteredTopics
            .filter(t => (t.repetitions?.length || 0) > 0)
            .sort((a, b) => {
                const dateA = a.repetitions?.[a.repetitions.length - 1]?.dateCompleted || '';
                const dateB = b.repetitions?.[b.repetitions.length - 1]?.dateCompleted || '';
                return dateB.localeCompare(dateA); 
            });
    }, [filteredTopics]);

    // NEW LOGIC: Calculate top 3 most recent attempts
    const recentAttempts = useMemo(() => {
        // quizzedTopics is already sorted descending by date
        return quizzedTopics.slice(0, 3).map(topic => {
            const lastRep = topic.repetitions[topic.repetitions.length - 1];
            return {
                id: topic.id,
                topic,
                score: lastRep.score,
                date: lastRep.dateCompleted,
                quizAttempt: lastRep.quizAttempt,
                totalQuestions: lastRep.totalQuestions,
                repNum: topic.repetitions.length
            };
        });
    }, [quizzedTopics]);

    const chartData = useMemo(() => {
        const repetitionsByCount: { [key: number]: number[] } = {};
        filteredTopics.forEach(topic => {
            topic.repetitions?.forEach((rep, index) => {
                const repNum = index + 1;
                if (!repetitionsByCount[repNum]) repetitionsByCount[repNum] = [];
                const totalQs = rep.totalQuestions || 10;
                let percentage = rep.score > totalQs ? rep.score : (rep.score / totalQs) * 100;
                if (percentage > 100) percentage = 100;
                repetitionsByCount[repNum].push(percentage);
            });
        });

        return Object.keys(repetitionsByCount).map(repNum => {
            const scores = repetitionsByCount[parseInt(repNum)];
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            return { rep: parseInt(repNum), avg: avg };
        }).sort((a, b) => a.rep - b.rep);
    }, [filteredTopics]);

    return (
        <div className="py-4 space-y-6">
            <div className="px-4 flex justify-between items-center mb-2">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                        {greeting}, <span className="capitalize">{userProfile.name}</span>
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Ready to learn?</p>
                </div>
                <div className="flex items-center space-x-3">
                    <div className={`p-2 bg-${themeColor}-100 dark:bg-${themeColor}-900 rounded-full`}>
                        <GraduationCap size={24} className={`text-${themeColor}-600 dark:text-${themeColor}-300`} />
                    </div>
                </div>
            </div>

            <div className="px-4 grid grid-cols-2 gap-4">
                <div 
                    className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-red-100 dark:border-red-900/30 flex flex-col justify-between cursor-pointer hover:shadow-md transition"
                    onClick={() => navigateTo('topicList', { type: 'due', topics: dueTopics })}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-400 uppercase">Due Today</span>
                        <Calendar size={16} className="text-red-400"/>
                    </div>
                    <div>
                        <span className="text-3xl font-extrabold text-gray-800 dark:text-gray-100">{dueTopics.length}</span>
                        <span className="text-xs text-gray-400 ml-1">topics</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: dueTopics.length > 0 ? '100%' : '0%' }}></div>
                    </div>
                </div>

                <div 
                    className={`bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-${themeColor}-100 dark:border-${themeColor}-900/30 flex flex-col justify-between cursor-pointer hover:shadow-md transition`}
                    onClick={() => navigateTo('topicList', { type: 'active', topics: activeTopics })}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-400 uppercase">Active</span>
                        <TrendingUp size={16} className={`text-${themeColor}-400`}/>
                    </div>
                    <div>
                        <span className="text-3xl font-extrabold text-gray-800 dark:text-gray-100">{activeTopics.length}</span>
                        <span className="text-xs text-gray-400 ml-1">topics</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div className={`h-full bg-${themeColor}-500 rounded-full`} style={{ width: '60%' }}></div>
                    </div>
                </div>
            </div>

            <Card className={`${dueTopics.length > 0 ? 'bg-gradient-to-br from-red-50 to-white dark:from-red-900/20 dark:to-gray-800' : 'bg-white dark:bg-gray-800'}`}>
                <FlashCardDeck 
                    topics={activeTopics.length > 0 ? activeTopics : studyLog} 
                    allSubjects={allSubjects}
                    themeColor={themeColor} 
                    dueTopics={dueTopics}
                    onReview={(topic) => navigateTo('topicDetail', topic)}
                    userId={userId || 'guest'}
                    navigateTo={navigateTo}
                />
            </Card>

            <div className="px-4 space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center px-1">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                        <PieChart size={18} className="mr-2 text-gray-400" /> Analytics
                    </h2>
                    
                    <div className="flex items-center space-x-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full shadow-sm border border-gray-100 dark:border-gray-700">
                        <Filter size={14} className="text-gray-400" />
                        <select 
                            value={selectedSubjectFilter} 
                            onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                            className="bg-transparent text-xs font-semibold text-gray-600 dark:text-gray-300 focus:outline-none cursor-pointer"
                        >
                            <option value="all" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200">All Subjects</option>
                            {allSubjects.map(s => (
                                <option key={s.id} value={s.id} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200">{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                
                <ProgressChart data={chartData} themeColor={themeColor} />

                <div className="grid grid-cols-2 gap-3">
                     <div 
                        className={`bg-${themeColor}-50 dark:bg-${themeColor}-900/20 p-4 rounded-2xl border border-${themeColor}-100 dark:border-${themeColor}-800 transition-all cursor-pointer hover:shadow-md relative overflow-hidden`}
                        onClick={() => navigateTo('studyBreakdown', { id: selectedSubjectFilter })}
                        role="button"
                        tabIndex={0}
                        aria-label="Open Study Breakdown"
                     >
                        <div className="flex justify-between items-start">
                            <div>
                                <p className={`text-xs font-bold text-${themeColor}-600 dark:text-${themeColor}-400 uppercase mb-1`}>Total Study</p>
                                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                                    {statsTotalHours}<span className="text-sm text-gray-400">h</span> {statsRemainingMins}<span className="text-sm text-gray-400">m</span>
                                </p>
                            </div>
                            <div className={`p-1 rounded-full hover:bg-${themeColor}-100 dark:hover:bg-${themeColor}-800/50 text-${themeColor}-400`}>
                                <ChevronRight size={16} />
                            </div>
                        </div>
                     </div>

                     <div 
                        className={`bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800 transition-all hover:shadow-md relative overflow-hidden`}
                     >
                        <div 
                            className="flex justify-between items-start cursor-pointer"
                            onClick={() => navigateTo('topicList', { type: 'history', topics: quizzedTopics })}
                        >
                            <div>
                                <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase mb-1">Quizzes Done</p>
                                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{statsTotalQuizzes}</p>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShowQuizDetails(!showQuizDetails); }}
                                className="text-orange-400 bg-white dark:bg-orange-900/40 rounded-full p-1 hover:bg-orange-100 dark:hover:bg-orange-900/60 transition"
                            >
                                {showQuizDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                        </div>

                        {showQuizDetails && recentAttempts.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-800/50 animate-in fade-in slide-in-from-top-1">
                                <div className="flex items-center text-[10px] font-bold text-gray-400 uppercase mb-2">
                                    <History size={10} className="mr-1"/> RECENT
                                </div>
                                <div className="space-y-3">
                                    {recentAttempts.map((attempt) => (
                                        <div key={attempt.id} className="pb-3 border-b border-orange-100 dark:border-orange-800/30 last:border-0 last:pb-0">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-bold text-gray-700 dark:text-gray-300 text-sm truncate max-w-[120px]">
                                                    {attempt.topic.topicName}
                                                </span>
                                                <div className="flex items-center space-x-2">
                                                    <div className="flex justify-between items-center relative px-1 w-24">
                                                        {/* Connecting Line */}
                                                        <div className="absolute left-1 right-1 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200 dark:bg-gray-700 rounded-full z-0"></div>
                                                        
                                                        {/* Nodes */}
                                                        {Array.from({ length: 5 }).map((_, i) => {
                                                            const rep = attempt.topic.repetitions?.[i];
                                                            const isCompleted = !!rep;
                                                            const isNext = i === (attempt.topic.repetitions?.length || 0);
                                                            
                                                            let nodeColor = "bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600";
                                                            let icon = null;
                                                            
                                                            let percentageScore = 0;
                                                            
                                                            if (isCompleted) {
                                                                const totalQs = rep.totalQuestions || 10;
                                                                percentageScore = rep.score > totalQs ? rep.score : (rep.score / totalQs) * 100;
                                                                if (percentageScore > 100) percentageScore = 100;
                                                                
                                                                if (percentageScore >= 80) {
                                                                    nodeColor = "bg-green-500 border-green-600 text-white shadow-sm";
                                                                    icon = <Check size={8} strokeWidth={3} />;
                                                                } else if (percentageScore >= 50) {
                                                                    nodeColor = "bg-yellow-500 border-yellow-600 text-white shadow-sm";
                                                                    icon = <Check size={8} strokeWidth={3} />;
                                                                } else {
                                                                    nodeColor = "bg-red-500 border-red-600 text-white shadow-sm";
                                                                    icon = <XCircle size={8} strokeWidth={3} />;
                                                                }
                                                            } else if (isNext) {
                                                                nodeColor = `bg-white dark:bg-gray-800 border border-${themeColor}-500 shadow-[0_0_4px_rgba(0,0,0,0.1)]`;
                                                            }

                                                            return (
                                                                <div 
                                                                    key={i} 
                                                                    className={`relative z-10 w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all duration-200 ${nodeColor}`}
                                                                    title={isCompleted ? `Review Repetition ${i + 1} (Score: ${Math.round(percentageScore)}%)` : isNext ? "Next Review" : "Upcoming"}
                                                                >
                                                                    {icon}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <span className={`text-xs font-bold ${(() => {
                                                        const totalQs = attempt.quizAttempt?.questions?.length || attempt.totalQuestions || 10;
                                                        let percentage = attempt.score > totalQs ? attempt.score : (attempt.score / totalQs) * 100;
                                                        if (percentage > 100) percentage = 100;
                                                        return percentage >= 70 ? 'text-green-600' : 'text-orange-600';
                                                    })()}`}>
                                                        {attempt.score > (attempt.quizAttempt?.questions?.length || attempt.totalQuestions || 10) ? `${attempt.score}%` : `${attempt.score}/${attempt.quizAttempt?.questions?.length || attempt.totalQuestions || 10}`}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigateTo('quizReview', {
                                                        topic: attempt.topic,
                                                        quizAttempt: attempt.quizAttempt,
                                                        repetitionNumber: attempt.repNum
                                                    });
                                                }}
                                                className="w-full py-2 bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 text-xs font-bold rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/30 transition flex items-center justify-center shadow-sm"
                                            >
                                                Review Result
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {showQuizDetails && recentAttempts.length === 0 && (
                            <div className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-800/50">
                                <p className="text-xs text-gray-400 italic">No quizzes completed yet.</p>
                            </div>
                        )}
                     </div>
                </div>
                
                {criticalTopics.length > 0 && (
                    <Card className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 mt-4">
                        <div className="flex items-center mb-3 text-red-700 dark:text-red-400">
                            <AlertTriangle size={20} className="mr-2" />
                            <h3 className="font-bold">Critical Revision Needed</h3>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mb-4">
                            You scored less than 89% on the 5th repetition for these topics. Immediate review recommended to ensure mastery.
                        </p>
                        <div className="space-y-2">
                            {criticalTopics.map(topic => (
                                <button
                                    key={topic.id}
                                    onClick={() => navigateTo('topicDetail', topic)}
                                    className="w-full text-left p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-red-100 dark:border-red-900/30 flex justify-between items-center hover:bg-red-50 dark:hover:bg-gray-700 transition"
                                >
                                    <span className="font-medium text-gray-800 dark:text-gray-200 text-sm truncate">{topic.topicName}</span>
                                    <span className="text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded">
                                         Score: {topic.repetitions[4].score > (topic.repetitions[4].totalQuestions || 10) ? `${topic.repetitions[4].score}%` : `${topic.repetitions[4].score}/${topic.repetitions[4].totalQuestions || 10}`}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </Card>
                )}
            </div>
            
            <p className="text-xs text-gray-300 dark:text-gray-600 text-center pt-10">User ID: {userId ? userId.slice(0, 8) : 'guest'}...</p>
        </div>
    );
});
