
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, Dna, Folder, FolderOpen, ChevronRight, ChevronDown, Plus, RotateCw, Trash2, Undo2, Camera, Upload, Loader2, Sparkles, Image as ImageIcon, X } from 'lucide-react';
import { Card } from '../components/Card';
import { Topic, FlashCard } from '../types';
import { FLASHCARD_SCHEMA } from '../constants';
import { goBackOrFallback } from '../utils/navigation';
import { callGeminiApiWithRetry } from '../services/gemini';
import { triggerHaptic } from '../utils/haptics';
import { compressImage } from '../utils/media';
import DOMPurify from 'dompurify';
import katex from 'katex';

interface FlashcardHubViewProps {
    studyLog: Topic[];
    userId: string;
    themeColor: string;
}

export const FlashcardHubView: React.FC<FlashcardHubViewProps> = ({ userId, themeColor }) => {
    
    // --- Data Loading ---
    const [allCards, setAllCards] = useState<FlashCard[]>([]);
    const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    
    // Evolve State
    const [isEvolving, setIsEvolving] = useState(false);
    const [evolveStatus, setEvolveStatus] = useState<string | null>(null);

    // PYQ / Scan State
    const [isScanning, setIsScanning] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]); // Staging area for multiple images
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    // Undo State
    const [deletedCard, setDeletedCard] = useState<FlashCard | null>(null);
    const undoTimeoutRef = useRef<number | null>(null);

    // Initial Load from Storage
    useEffect(() => {
        try {
            const key = `engram-flashcard-history_${userId}`;
            const raw = localStorage.getItem(key);
            if (raw) {
                setAllCards(JSON.parse(raw));
            }
        } catch (_e) {
            console.error("Failed to load flashcards", _e);
        }
    }, [userId]);

    // Save to Storage
    const persistCards = (newCards: FlashCard[]) => {
        setAllCards(newCards);
        localStorage.setItem(`engram-flashcard-history_${userId}`, JSON.stringify(newCards));
    };

    // --- Computed Hierarchy ---
    // Structure: Subject -> Topic -> Cards[]
    const hierarchy = useMemo(() => {
        const struct: Record<string, Record<string, FlashCard[]>> = {};
        
        allCards.forEach(card => {
            const subj = card.subject || 'Uncategorized';
            const topic = card.topicName || 'General';
            
            if (!struct[subj]) struct[subj] = {};
            if (!struct[subj][topic]) struct[subj][topic] = [];
            
            struct[subj][topic].push(card);
        });
        
        return struct;
    }, [allCards]);

    // Get Active Deck
    const activeDeck = useMemo(() => {
        if (!selectedTopicId) return [];
        // Flatten hierarchy to find topic
        for (const subj in hierarchy) {
            for (const topic in hierarchy[subj]) {
                if (topic === selectedTopicId) {
                    return hierarchy[subj][topic];
                }
            }
        }
        return [];
    }, [hierarchy, selectedTopicId]);

    const activeSubjectName = useMemo(() => {
        if (!selectedTopicId) return '';
        for (const subj in hierarchy) {
            if (hierarchy[subj][selectedTopicId]) return subj;
        }
        return '';
    }, [hierarchy, selectedTopicId]);

    // --- Actions ---

    const toggleSubject = (subj: string) => {
        const next = new Set(expandedSubjects);
        if (next.has(subj)) next.delete(subj);
        else next.add(subj);
        setExpandedSubjects(next);
    };

    const deleteCard = (cardId: string) => {
        const cardToDelete = allCards.find(c => c.id === cardId);
        if (!cardToDelete) return;

        triggerHaptic.impact('Medium');

        // Clear existing timer if user deletes rapidly
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);

        const updated = allCards.filter(c => c.id !== cardId);
        persistCards(updated);

        setDeletedCard(cardToDelete);

        undoTimeoutRef.current = window.setTimeout(() => {
            setDeletedCard(null);
            undoTimeoutRef.current = null;
        }, 4000);
    };

    const handleUndoDelete = () => {
        if (!deletedCard) return;
        triggerHaptic.selection();

        // Restore card
        const updated = [...allCards, deletedCard];
        persistCards(updated);

        setDeletedCard(null);
        if (undoTimeoutRef.current) {
            clearTimeout(undoTimeoutRef.current);
            undoTimeoutRef.current = null;
        }
    };

    // --- Scan / PYQ Logic ---

    // 1. Add files to staging
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const newFiles = Array.from(event.target.files);
            setPendingFiles(prev => [...prev, ...newFiles]);
            triggerHaptic.selection();
        }
        // Reset input so same file can be selected again if needed
        if (event.target) event.target.value = '';
    };

    // 2. Remove file from staging
    const removePendingFile = (index: number) => {
        setPendingFiles(prev => prev.filter((_, i) => i !== index));
    };

    // 3. Process all staged files
    const handleProcessPending = async () => {
        if (pendingFiles.length === 0) return;

        setIsScanning(true);
        triggerHaptic.impact('Light');

        try {
            // Compress all images in parallel
            const compressionPromises = pendingFiles.map(file => compressImage(file));
            const images = await Promise.all(compressionPromises);
            
            const prompt = `Analyze these ${images.length} images of question banks, previous year question papers (PYQ), or handwritten notes.
            
            Task:
            1. Extract EVERY distinct question found across ALL images. DO NOT limit the count. If there are 20 questions, generate 20 flashcards.
            2. If the answer is present in the image, use it.
            3. If the answer is NOT present, solve the question or provide a concise, accurate explanation/answer.
            4. Format as flashcards: 'front' = Question, 'back' = Answer/Explanation.
            5. Use LaTeX for math expressions (e.g. $E=mc^2$).
            
            Return JSON with a 'flashcards' array. Ensure the response captures all items.`;

            const response = await callGeminiApiWithRetry(
                prompt,
                "You are an expert tutor creating study materials from exam papers. You must be exhaustive.",
                FLASHCARD_SCHEMA,
                images, // Send array of images
                null,
                2,
                'gemini-3-flash-preview', 
                'flashcards'
            );

            if (response?.flashcards && Array.isArray(response.flashcards)) {
                const timestamp = new Date();
                const topicName = `Scan ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                
                const newCards = response.flashcards.map((c: Record<string, unknown>) => ({
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    front: c.front as string,
                    back: c.back as string,
                    subject: 'Question Bank',
                    topicName: topicName,
                    createdAt: timestamp.toISOString(),
                    lastResult: undefined
                }));
                
                const updated = [...allCards, ...newCards];
                persistCards(updated);
                
                triggerHaptic.notification('Success');
                
                // Clear staging
                setPendingFiles([]);

                // Auto-expand the "Question Bank" subject
                const nextExpanded = new Set(expandedSubjects);
                nextExpanded.add('Question Bank');
                setExpandedSubjects(nextExpanded);
                
                alert(`Success! Generated ${newCards.length} flashcards from ${images.length} images.`);
            } else {
                throw new Error("No flashcards generated.");
            }

        } catch (_e) {
            console.error(_e);
            triggerHaptic.notification('Error');
            alert("Failed to process images. Please try fewer images or check connection.");
        } finally {
            setIsScanning(false);
        }
    };

    // --- Evolve Logic ---
    const handleEvolve = async () => {
        if (activeDeck.length === 0) return;
        setIsEvolving(true);
        setEvolveStatus("Analyzing Cards...");

        try {
            // Prepare Payload
            const cardsContent = activeDeck.map(c => `Front: ${c.front}\nBack: ${c.back}`).join('\n---\n');
            
            const prompt = `
            You are an expert tutor. I have a deck of ${activeDeck.length} flashcards.
            Your goal is to EVOLVE them:
            1. Keep the same core concept/answer.
            2. Rewrite the "Front" to be more engaging, precise, or context-rich.
            3. Rewrite the "Back" to be clearer and better explained.
            4. Use LaTeX for math ($...$).
            
            Input Cards:
            ${cardsContent}
            
            Output JSON format: { "flashcards": [ { "front": "string", "back": "string" } ] }
            Return exactly ${activeDeck.length} cards in the same order if possible.
            `;

            const res = await callGeminiApiWithRetry(
                prompt,
                "You are a flashcard architect.",
                FLASHCARD_SCHEMA,
                null,
                null,
                2,
                'gemini-3-flash-preview',
                'flashcards'
            );

            if (res.flashcards && Array.isArray(res.flashcards)) {
                const updatedDeck = activeDeck.map((oldCard, idx) => {
                    const newContent = res.flashcards[idx];
                    if (!newContent) return oldCard; // Fallback
                    return {
                        ...oldCard,
                        front: newContent.front,
                        back: newContent.back,
                        lastResult: undefined // Reset known status since wording changed
                    };
                });

                const newAllCards = allCards.map(c => {
                    const match = updatedDeck.find(u => u.id === c.id);
                    return match || c;
                });

                persistCards(newAllCards);
                setEvolveStatus("Evolved Successfully!");
                setTimeout(() => setEvolveStatus(null), 1500);
            }

        } catch (_e) {
            console.error(_e);
            alert("Failed to evolve deck. Please try again.");
        } finally {
            setIsEvolving(false);
        }
    };

    // --- Render Helpers ---
    const renderMath = (text: string) => {
        if (!text) return null;
        // Support $$, \[ \] for block math and $, \( \) for inline math
        const html = text
            .replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (_, p1, p2) => katex.renderToString(p1 || p2, { displayMode: true, throwOnError: false }))
            .replace(/\$([\s\S]*?)\$|\\\(([\s\S]*?)\\\)/g, (_, p1, p2) => katex.renderToString(p1 || p2, { throwOnError: false }))
            .replace(/\n/g, '<br/>');
            
        return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, {
            ADD_TAGS: ['math', 'annotation', 'semantics', 'mtext', 'mn', 'mo', 'mi', 'msup', 'msub', 'mfrac', 'span', 'div', 'br'],
            ADD_ATTR: ['xmlns', 'display', 'mathvariant', 'class']
        }) }} />;
    };

    // --- Main View ---

    if (selectedTopicId) {
        // --- DECK VIEW ---
        return (
            <div className="px-0 py-4 space-y-6 pb-24 relative">
                {deletedCard && (
                    <div className="absolute top-0 left-4 right-4 z-50 flex items-center justify-between bg-gray-900 text-white py-3 px-4 rounded-xl shadow-xl animate-in fade-in slide-in-from-top-2">
                        <span className="text-sm font-medium">Card deleted</span>
                        <button 
                            onClick={handleUndoDelete}
                            className="text-sm font-bold text-blue-300 hover:text-blue-200 flex items-center"
                        >
                            <Undo2 size={16} className="mr-1.5" /> Undo
                        </button>
                    </div>
                )}

                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                        <button onClick={() => setSelectedTopicId(null)} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800`}>
                            <ArrowLeft size={24} />
                        </button>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{selectedTopicId}</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{activeSubjectName} • {activeDeck.length} Cards</p>
                        </div>
                    </div>
                    {/* Evolve Button */}
                    <button 
                        onClick={handleEvolve}
                        disabled={isEvolving || activeDeck.length === 0}
                        className={`p-3 rounded-full shadow-lg transition transform active:scale-95 ${isEvolving ? 'bg-gray-300 dark:bg-gray-700' : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'}`}
                        title="Evolve Deck with AI"
                    >
                        {isEvolving ? <RotateCw size={20} className="animate-spin" /> : <Dna size={20} />}
                    </button>
                </div>

                {evolveStatus && (
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm font-bold text-center rounded-xl animate-pulse border border-purple-200 dark:border-purple-800">
                        {evolveStatus}
                    </div>
                )}

                <div className="space-y-4">
                    {activeDeck.map((card) => (
                        <Card key={card.id} className="p-4 relative group">
                            <div className="absolute top-4 left-0 w-1 h-8 bg-gray-200 dark:bg-gray-700 rounded-r"></div>
                            
                            <div className="mb-3 pl-3">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Front</p>
                                <div className="text-gray-800 dark:text-gray-200 font-medium text-sm leading-relaxed">
                                    {renderMath(card.front)}
                                </div>
                            </div>
                            
                            <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
                            
                            <div className="pl-3">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Back</p>
                                <div className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    {renderMath(card.back)}
                                </div>
                            </div>

                            <button 
                                onClick={(e) => { e.stopPropagation(); deleteCard(card.id); }}
                                className="absolute top-2 right-2 p-2 text-gray-300 hover:text-red-500 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition z-10"
                            >
                                <Trash2 size={16} />
                            </button>
                        </Card>
                    ))}
                </div>
                
                {activeDeck.length === 0 && (
                    <div className="text-center py-10 text-gray-400 italic">
                        No cards in this deck.
                    </div>
                )}
            </div>
        );
    }

    // --- HUB VIEW (Root) ---
    return (
        <div className="px-0 py-4 space-y-6 relative">
            {deletedCard && (
                <div className="absolute top-0 left-4 right-4 z-50 flex items-center justify-between bg-gray-900 text-white py-3 px-4 rounded-xl shadow-xl animate-in fade-in slide-in-from-top-2">
                    <span className="text-sm font-medium">Card deleted</span>
                    <button 
                        onClick={handleUndoDelete}
                        className="text-sm font-bold text-blue-300 hover:text-blue-200 flex items-center"
                    >
                        <Undo2 size={16} className="mr-1.5" /> Undo
                    </button>
                </div>
            )}

            {/* Hidden Inputs for Scan */}
            <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*" 
                multiple
                className="hidden" 
                onChange={handleFileSelect}
            />
            <input 
                ref={cameraInputRef} 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                onChange={handleFileSelect}
            />

            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                    <button onClick={() => goBackOrFallback('#/settings')} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800`}>
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>Flashcard Hub</h2>
                </div>
                
                {/* Header Actions */}
                <div className="flex space-x-2">
                    <button 
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={isScanning}
                        className={`p-2.5 rounded-xl bg-${themeColor}-100 dark:bg-${themeColor}-900/30 text-${themeColor}-600 dark:text-${themeColor}-300 hover:bg-${themeColor}-200 dark:hover:bg-${themeColor}-800 transition shadow-sm disabled:opacity-50`}
                        title="Scan with Camera"
                    >
                        <Camera size={20} />
                    </button>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isScanning}
                        className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition shadow-sm disabled:opacity-50"
                        title="Upload Image"
                    >
                        <Upload size={20} />
                    </button>
                </div>
            </div>

            {/* Pending Files Staging Area */}
            {pendingFiles.length > 0 && (
                <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 animate-in slide-in-from-top-2">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{pendingFiles.length} Images Selected</span>
                        <button 
                            onClick={() => setPendingFiles([])}
                            className="text-xs text-red-500 hover:text-red-600 font-medium"
                        >
                            Clear All
                        </button>
                    </div>
                    
                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar mb-4">
                        {pendingFiles.map((file, idx) => (
                            <div key={idx} className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group">
                                <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover" />
                                <button 
                                    onClick={() => removePendingFile(idx)}
                                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                        <button 
                            onClick={() => cameraInputRef.current?.click()}
                            className="w-20 h-20 shrink-0 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500 transition"
                        >
                            <Plus size={20} />
                            <span className="text-[10px] mt-1">Add More</span>
                        </button>
                    </div>

                    <button 
                        onClick={handleProcessPending}
                        disabled={isScanning}
                        className={`w-full py-3 bg-${themeColor}-600 text-white rounded-xl font-bold shadow-lg hover:bg-${themeColor}-700 transition flex items-center justify-center disabled:opacity-50`}
                    >
                        {isScanning ? <Loader2 size={18} className="animate-spin mr-2" /> : <Sparkles size={18} className="mr-2" />}
                        {isScanning ? 'Processing...' : `Generate Flashcards from ${pendingFiles.length} Images`}
                    </button>
                </div>
            )}

            {/* Empty State / CTA (Only if no pending files and empty library) */}
            {Object.keys(hierarchy).length === 0 && !isScanning && pendingFiles.length === 0 && (
                <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
                        <ImageIcon size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Your library is empty</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-6 max-w-xs mx-auto">
                        Setup a dedicated PYQ bank here. Use the camera to snap question papers and generate cards instantly.
                    </p>
                    <div className="flex justify-center gap-3">
                        <button 
                            onClick={() => cameraInputRef.current?.click()}
                            className={`px-6 py-2.5 bg-${themeColor}-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-${themeColor}-700 transition flex items-center`}
                        >
                            <Camera size={18} className="mr-2"/> Scan Now
                        </button>
                    </div>
                </div>
            )}

            {isScanning && (
                <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-900/30 text-center animate-in fade-in">
                    <Loader2 size={32} className="animate-spin mx-auto text-blue-600 dark:text-blue-400 mb-3" />
                    <h3 className="font-bold text-blue-800 dark:text-blue-200">Analyzing Question Bank...</h3>
                    <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">Extracting ALL questions from images & generating answers.</p>
                </div>
            )}

            <div className="space-y-4">
                {Object.entries(hierarchy).map(([subject, topicsMap]) => {
                    const isExpanded = expandedSubjects.has(subject);
                    const topicCount = Object.keys(topicsMap).length;
                    const totalCards = Object.values(topicsMap).reduce((sum, list) => sum + list.length, 0);

                    return (
                        <div key={subject} className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 transition-all duration-300">
                            <button 
                                onClick={() => toggleSubject(subject)}
                                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                            >
                                <div className="flex items-center space-x-3">
                                    <div className={`p-2 rounded-lg ${isExpanded ? `bg-${themeColor}-100 text-${themeColor}-600 dark:bg-${themeColor}-900/50` : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                                        {isExpanded ? <FolderOpen size={20} /> : <Folder size={20} />}
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm">{subject}</h3>
                                        <p className="text-xs text-gray-400">{topicCount} Topics • {totalCards} Cards</p>
                                    </div>
                                </div>
                                <ChevronDown size={16} className={`text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            {isExpanded && (
                                <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                                    {Object.entries(topicsMap).map(([topicName, cards]) => (
                                        <button 
                                            key={topicName}
                                            onClick={() => setSelectedTopicId(topicName)}
                                            className="w-full flex items-center justify-between p-3 pl-14 pr-4 hover:bg-white dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0 transition group"
                                        >
                                            <div className="text-left">
                                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{topicName}</p>
                                                <p className="text-[10px] text-gray-400">{cards.length} cards</p>
                                            </div>
                                            <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-400" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
