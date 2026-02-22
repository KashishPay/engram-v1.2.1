
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Sparkles, Settings2, Zap, BrainCircuit, Headphones, MessageCircle, Layers, ChevronRight, Lock, Key, FileText } from 'lucide-react';
import { Card } from '../components/Card';
import { getUsageStats } from '../services/gemini';
import { FeatureConfigModal } from '../components/FeatureConfigModal';
import { goBackOrFallback } from '../utils/navigation';

interface AiFeaturesViewProps {
    navigateTo: (view: string, data?: any) => void;
    goBack: () => void;
    themeColor: string;
}

export const AiFeaturesView: React.FC<AiFeaturesViewProps> = ({ navigateTo, goBack, themeColor }) => {
    const [stats, setStats] = useState<any>(null);
    const [configModal, setConfigModal] = useState<{ isOpen: boolean, featureId: 'quiz' | 'chat' | 'podcast' | 'flashcards' | 'ocr' | null }>({ isOpen: false, featureId: null });

    useEffect(() => {
        setStats(getUsageStats());
    }, []);

    const handleConfigure = (id: 'quiz' | 'chat' | 'podcast' | 'flashcards' | 'ocr') => {
        setConfigModal({ isOpen: true, featureId: id });
    };

    const handleCloseModal = () => {
        setConfigModal({ ...configModal, isOpen: false });
    };

    const isUnlimited = stats?.source === 'custom';
    const percentUsed = stats ? Math.min(100, (stats.count / stats.limit) * 100) : 0;

    return (
        <div className="px-0 py-4 space-y-6">
            <div className="flex items-center space-x-2 mb-4">
                <button onClick={() => goBackOrFallback('#/settings')} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800`}>
                    <ArrowLeft size={24} />
                </button>
                <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>AI Features & Quota</h2>
            </div>

            {/* Quota Banner */}
            <Card className="p-6 relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800 text-white border-0">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Sparkles size={80} />
                </div>
                
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Current Plan</p>
                            <h3 className="text-xl font-bold flex items-center">
                                {isUnlimited ? <><Key size={20} className="mr-2 text-yellow-400"/> Custom API Key</> : "Standard Quota"}
                            </h3>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${isUnlimited ? 'bg-yellow-500/20 text-yellow-300' : 'bg-blue-500/20 text-blue-300'}`}>
                            {isUnlimited ? 'UNLIMITED' : 'FREE TIER'}
                        </div>
                    </div>

                    <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2 font-medium">
                            <span className="text-gray-300">Monthly Usage</span>
                            <span className="text-white">{isUnlimited ? '∞' : `${stats?.count || 0} / ${stats?.limit || 50}`}</span>
                        </div>
                        {isUnlimited ? (
                            <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 w-full animate-pulse opacity-50"></div>
                            </div>
                        ) : (
                            <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full transition-all duration-500 ${percentUsed > 90 ? 'bg-red-500' : 'bg-blue-500'}`} 
                                    style={{ width: `${percentUsed}%` }}
                                ></div>
                            </div>
                        )}
                        <p className="text-[10px] text-gray-400 mt-2">
                            {isUnlimited ? "Usage tracked by your Google Cloud Project." : "Resets on the 1st of next month."}
                        </p>
                    </div>

                    {!isUnlimited && (
                        <button 
                            onClick={() => navigateTo('settings')} 
                            className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition flex items-center justify-center backdrop-blur-sm"
                        >
                            Increase Limit (Add Key) <ChevronRight size={14} className="ml-1"/>
                        </button>
                    )}
                </div>
            </Card>

            <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2">Configure Features</h3>
                
                {[
                    { id: 'quiz', label: 'Pop Quiz', icon: Zap, color: 'text-amber-500', desc: 'Difficulty & Model' },
                    { id: 'chat', label: 'Chat Tutor', icon: MessageCircle, color: 'text-blue-500', desc: 'Persona & Style' },
                    { id: 'podcast', label: 'Audio Podcast', icon: Headphones, color: 'text-purple-500', desc: 'Auto-gen & Voices' },
                    { id: 'flashcards', label: 'Flashcards', icon: Layers, color: 'text-green-500', desc: 'Deck Size & Depth' },
                    { id: 'ocr', label: 'OCR Scanner', icon: FileText, color: 'text-orange-500', desc: 'Extraction Style' }
                ].map(feature => (
                    <Card 
                        key={feature.id} 
                        className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/80 transition cursor-pointer group"
                        onClick={() => handleConfigure(feature.id as any)}
                    >
                        <div className="flex items-center space-x-4">
                            <div className={`w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center ${feature.color}`}>
                                <feature.icon size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-800 dark:text-gray-200">{feature.label}</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{feature.desc}</p>
                            </div>
                        </div>
                        <button className="p-2 bg-gray-100 dark:bg-gray-700/50 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
                            <Settings2 size={18} />
                        </button>
                    </Card>
                ))}
            </div>

            {configModal.featureId && (
                <FeatureConfigModal 
                    isOpen={configModal.isOpen} 
                    featureId={configModal.featureId} 
                    onClose={handleCloseModal}
                />
            )}
        </div>
    );
};
