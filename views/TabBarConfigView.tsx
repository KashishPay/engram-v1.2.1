
import React from 'react';
import { ArrowLeft, Minus, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { TAB_ITEMS } from '../constants';
import { goBackOrFallback } from '../utils/navigation';
import { triggerHaptic } from '../utils/haptics';

interface TabBarConfigViewProps {
    enabledTabIds: string[];
    onToggleTab: (id: string) => void;
    onReorderTabs: (newOrder: string[]) => void;
    navigateTo: (view: string) => void;
    goBack: () => void;
    themeColor: string;
}

export const TabBarConfigView: React.FC<TabBarConfigViewProps> = ({ enabledTabIds, onToggleTab, onReorderTabs, themeColor }) => {
    
    // Core tabs are always active and cannot be removed (no minus button), but can be reordered.
    // 'profile' removed from CORE_TABS to allow it to be optional or just excluded by default from the main list view if not enabled
    const CORE_TABS = ['home', 'subjects'];
    
    // Configurable items can be added/removed.
    const CONFIGURABLE_ITEMS = [
        'profile', 'calendar', 'task', 'matrix', 'pomodoro', 'habit', 'observations', 'search'
    ];
    
    // "Settings" is strictly fixed and handled by App.tsx, so we ignore it here.
    
    // Filter enabled tabs to only include valid ones (excluding settings if present)
    const activeTabs = enabledTabIds.filter(id => CORE_TABS.includes(id) || CONFIGURABLE_ITEMS.includes(id));
    
    // Available items (Configurable items NOT currently active)
    const availableTabs = CONFIGURABLE_ITEMS.filter(id => !enabledTabIds.includes(id));

    const handleToggle = (id: string) => {
        triggerHaptic.selection();
        onToggleTab(id);
    };

    const moveTab = (id: string, direction: 'up' | 'down') => {
        triggerHaptic.selection();
        const index = enabledTabIds.indexOf(id);
        if (index === -1) return;
        
        const newOrder = [...enabledTabIds];
        if (direction === 'up') {
            if (index === 0) return;
            [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
        } else {
            if (index === newOrder.length - 1) return;
            [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
        }
        onReorderTabs(newOrder);
    };

    const handleBack = () => {
        triggerHaptic.selection();
        goBackOrFallback('#/settings');
    };

    return (
        <div className="px-0 py-4 space-y-4">
            <div className="flex items-center space-x-2 mb-6">
                <button onClick={handleBack} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800`}>
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Tab Bar</h2>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                <h3 className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 text-xs font-bold text-gray-400 uppercase tracking-wider">Active Tabs</h3>
                {activeTabs.length === 0 && <p className="p-4 text-gray-400 text-sm italic">No active tabs.</p>}
                
                {activeTabs.map((itemId, idx) => {
                    const item = TAB_ITEMS.find(t => t.id === itemId);
                    if (!item) return null;
                    
                    const isCore = CORE_TABS.includes(itemId);

                    return (
                        <div key={item.id} className="flex items-center justify-between p-4 border-b last:border-b-0 border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                            <div className="flex items-center space-x-4">
                                {isCore ? (
                                    <div className="w-6 h-6 flex items-center justify-center">
                                        {/* Placeholder for alignment */}
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => handleToggle(item.id)}
                                        className="w-6 h-6 rounded-full flex items-center justify-center transition-colors bg-red-500 text-white hover:bg-red-600"
                                    >
                                        <Minus size={14} strokeWidth={3} />
                                    </button>
                                )}
                                
                                <div className="flex items-center space-x-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white ${isCore ? 'bg-blue-500' : 'bg-gray-600 dark:bg-gray-700'}`}>
                                        <item.icon size={20} />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{item.label}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex flex-col space-y-1">
                                <button 
                                    onClick={() => moveTab(item.id, 'up')}
                                    disabled={idx === 0}
                                    className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${idx === 0 ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                    <ChevronUp size={16} />
                                </button>
                                <button 
                                    onClick={() => moveTab(item.id, 'down')}
                                    disabled={idx === activeTabs.length - 1}
                                    className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${idx === activeTabs.length - 1 ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                    <ChevronDown size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })}
                
                {availableTabs.length > 0 && (
                    <>
                        <h3 className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 text-xs font-bold text-gray-400 uppercase tracking-wider border-t border-gray-100 dark:border-gray-700">Available Tabs</h3>
                        {availableTabs.map((itemId) => {
                            const item = TAB_ITEMS.find(t => t.id === itemId);
                            if (!item) return null;
                            
                            return (
                                <div key={item.id} className="flex items-center justify-between p-4 border-b last:border-b-0 border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                    <div className="flex items-center space-x-4">
                                        <button 
                                            onClick={() => handleToggle(item.id)}
                                            className="w-6 h-6 rounded-full flex items-center justify-center transition-colors bg-green-500 text-white hover:bg-green-600"
                                        >
                                            <Plus size={14} strokeWidth={3} />
                                        </button>
                                        
                                        <div className="flex items-center space-x-3">
                                            <div className="w-10 h-10 bg-gray-400 dark:bg-gray-600 rounded-lg flex items-center justify-center text-white">
                                                <item.icon size={20} />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-600 dark:text-gray-300 text-sm">{item.label}</p>
                                                <p className="text-xs text-gray-400">{item.description}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
            
            <p className="text-xs text-gray-400 text-center px-4">
                Core tabs (Blue) cannot be removed. Use arrows to reorder all active tabs.
            </p>
        </div>
    );
};
