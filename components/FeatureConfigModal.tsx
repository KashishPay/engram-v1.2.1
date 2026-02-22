
import React, { useState, useEffect } from 'react';
import { X, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface FeatureConfigModalProps {
    isOpen: boolean;
    featureId: 'quiz' | 'chat' | 'podcast' | 'flashcards' | 'ocr';
    onClose: () => void;
}

const FEATURE_TITLES: Record<string, string> = {
    quiz: 'Pop Quiz Configuration',
    chat: 'Chat Persona',
    podcast: 'Podcast Settings',
    flashcards: 'Flashcard Settings',
    ocr: 'OCR Scanner Settings'
};

const ADVANCED_MODELS = [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended)' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3.0 Flash Preview' },
    { id: 'gemini-3-pro-preview', label: 'Gemini 3.0 Pro Preview' }
];

export const FeatureConfigModal: React.FC<FeatureConfigModalProps> = ({ isOpen, featureId, onClose }) => {
    const [prefs, setPrefs] = useState<any>({});
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        if (isOpen) {
            try {
                const stored = localStorage.getItem('engram_ai_preferences');
                if (stored) {
                    const allPrefs = JSON.parse(stored);
                    setPrefs(allPrefs[featureId] || {});
                } else {
                    setPrefs({});
                }
            } catch (e) {
                setPrefs({});
            }
            setShowAdvanced(false);
        }
    }, [isOpen, featureId]);

    const handleSave = () => {
        try {
            const stored = localStorage.getItem('engram_ai_preferences');
            const allPrefs = stored ? JSON.parse(stored) : {};
            allPrefs[featureId] = prefs;
            localStorage.setItem('engram_ai_preferences', JSON.stringify(allPrefs));
            onClose();
        } catch (e) {
            console.error("Failed to save preferences", e);
        }
    };

    const updatePref = (key: string, value: any) => {
        setPrefs((prev: any) => ({ ...prev, [key]: value }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all scale-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{FEATURE_TITLES[featureId] || 'Feature Settings'}</h3>
                    <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-5">
                    {/* Common Model Selector */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">AI Model Tier</label>
                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl mb-3">
                            {['flash', 'pro'].map((m) => (
                                <button
                                    key={m}
                                    onClick={() => updatePref('model', m)}
                                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition capitalize ${
                                        (prefs.model === 'flash' || prefs.model === 'pro' ? prefs.model : (prefs.model?.includes('flash') ? 'flash' : 'pro')) === m 
                                        ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' 
                                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                        
                        <button 
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition w-full justify-center py-1"
                        >
                            <span className="mr-1">Advanced Options</span>
                            {showAdvanced ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                        </button>

                        {showAdvanced && (
                            <div className="mt-2 animate-in fade-in slide-in-from-top-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-2 border border-gray-100 dark:border-gray-700">
                                {ADVANCED_MODELS.map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => updatePref('model', opt.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex justify-between items-center ${
                                            prefs.model === opt.id 
                                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' 
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        {opt.label}
                                        {prefs.model === opt.id && <Check size={12} />}
                                    </button>
                                ))}
                            </div>
                        )}
                        
                        {!showAdvanced && (
                            <p className="text-[10px] text-gray-400 mt-2 px-1 text-center">
                                "Pro" offers deeper reasoning. "Flash" is faster.
                            </p>
                        )}
                    </div>

                    {/* Common Persona Input */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Custom Persona</label>
                        <textarea
                            value={prefs.persona || ''}
                            onChange={(e) => updatePref('persona', e.target.value)}
                            placeholder="e.g. Preparing for GATE (EE): concise numerical steps, formula rigor, exam-style terminology."
                            className="w-full h-20 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:text-white resize-none placeholder-gray-400"
                        />
                    </div>

                    {featureId === 'quiz' && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Difficulty</label>
                            <select 
                                value={prefs.difficulty || 'normal'}
                                onChange={(e) => updatePref('difficulty', e.target.value)}
                                className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                            >
                                <option value="normal">Normal (Recall)</option>
                                <option value="hard">Hard (Application)</option>
                                <option value="insane">Insane (Synthesis)</option>
                            </select>
                        </div>
                    )}

                    {featureId === 'podcast' && (
                        <>
                            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-generate on new topic</span>
                                <button 
                                    onClick={() => updatePref('autoGenerateOnNewTopic', !prefs.autoGenerateOnNewTopic)}
                                    className={`w-10 h-6 rounded-full p-1 transition-colors duration-200 relative ${prefs.autoGenerateOnNewTopic ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${prefs.autoGenerateOnNewTopic ? 'translate-x-4' : 'translate-x-0'}`} />
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4">TTS Quality</label>
                                <div className="flex space-x-2">
                                    <button 
                                        onClick={() => updatePref('ttsModel', 'flash-tts')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg border ${prefs.ttsModel !== 'pro-tts' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 border-transparent text-gray-500'}`}
                                    >
                                        Standard
                                    </button>
                                    <button 
                                        onClick={() => updatePref('ttsModel', 'pro-tts')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg border ${prefs.ttsModel === 'pro-tts' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 border-transparent text-gray-500'}`}
                                    >
                                        High Def
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {featureId === 'flashcards' && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Cards per Generation: {prefs.cardsPerDeck || 5}</label>
                            <input 
                                type="range" 
                                min="5" 
                                max="20" 
                                step="5"
                                value={prefs.cardsPerDeck || 5}
                                onChange={(e) => updatePref('cardsPerDeck', parseInt(e.target.value))}
                                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>5</span>
                                <span>10</span>
                                <span>15</span>
                                <span>20</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-8 flex space-x-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm">Cancel</button>
                    <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-blue-700 transition flex justify-center items-center">
                        <Check size={18} className="mr-2" /> Apply
                    </button>
                </div>
            </div>
        </div>
    );
};
