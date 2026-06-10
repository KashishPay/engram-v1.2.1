
import React, { useState, useRef, useMemo } from 'react';
import { ArrowLeft, Play, Plus, Calendar as CalendarIcon, Inbox, X, Flame, BrainCircuit, BarChart3 } from 'lucide-react';
import { Topic, Habit } from '../types';
import { goBackOrFallback } from '../utils/navigation';
import { triggerHaptic } from '../utils/haptics';

interface WidgetsViewProps {
    studyLog: Topic[];
    habits: Habit[];
    navigateTo: (view: string) => void;
    goBack: () => void;
    themeColor: string;
}

const LongPressable: React.FC<{ onLongPress: () => void, onClick?: () => void, children: React.ReactNode }> = ({ onLongPress, onClick, children }) => {
    const timerRef = useRef<NodeJS.Timeout>();
    const isLongPress = useRef(false);

    const handleStart = () => {
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            onLongPress();
        }, 500);
    };

    const handleEnd = (e: React.SyntheticEvent) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!isLongPress.current && onClick) {
            onClick();
        }
    };

    return (
        <div 
            onTouchStart={handleStart} 
            onTouchEnd={handleEnd} 
            onMouseDown={handleStart}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            className="w-full flex flex-col items-center select-none"
        >
            {children}
        </div>
    );
};

export const WidgetsView: React.FC<WidgetsViewProps> = ({ studyLog, habits, navigateTo, themeColor }) => {
    const [previewWidget, setPreviewWidget] = useState<string | null>(null);

    // Analyze Study Topics
    const totalTopics = studyLog.length;
    const dueCount = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return studyLog.filter(topic => {
            if (topic.isJourneyPaused) return false;
            if (topic.repetitions?.length === 0) return true;
            const lastRep = topic.repetitions[topic.repetitions.length - 1];
            return lastRep && lastRep.nextReviewDate <= today;
        }).length;
    }, [studyLog]);
    
    // Habit logic
    const primaryHabit = habits.length > 0 ? habits[0] : { name: 'Eat fruits', completedDates: [] };
    const habitStreak = primaryHabit.completedDates.length;
    
    // Mock days for heatmap visual
    const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    const handleLongPress = (id: string) => {
        triggerHaptic.impact('Heavy');
        setPreviewWidget(id);
    };

    // Simulated widget rendering in the "Add to Home Screen" modal
    const renderWidgetPreview = (id: string) => {
        if (id === 'focus') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Small (2x2)</span>
                        <div className="bg-white p-4 rounded-3xl shadow-lg w-32 h-32 flex flex-col items-center justify-between relative overflow-hidden mx-auto transform hover:scale-105 transition cursor-pointer" onClick={() => triggerHaptic.selection()}>
                            <div className="mt-1 relative">
                                <div className="w-10 h-10 bg-red-500 rounded-full shadow-inner relative flex items-center justify-center">
                                    <div className="absolute top-1 right-2 w-2 h-2 bg-red-400 rounded-full opacity-50"></div>
                                </div>
                                <div className="absolute -top-1 left-1/2 transform -translate-x-1/2">
                                    <div className="w-3 h-1.5 bg-green-600 rounded-t-full"></div>
                                </div>
                            </div>
                            <div className="text-center -mt-1"><p className="text-gray-400 text-[10px] font-medium">Today: 0m</p></div>
                            <div className="w-full py-1.5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs shadow-md"><Play size={10} fill="currentColor" className="mr-1" /> Start</div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Wide (4x2)</span>
                        <div className="bg-white p-4 rounded-[2rem] shadow-lg w-full h-32 flex items-center justify-between relative overflow-hidden mx-auto transform hover:scale-105 transition cursor-pointer" onClick={() => triggerHaptic.selection()}>
                            <div className="flex items-center space-x-4">
                                <div className="relative">
                                    <div className="w-16 h-16 bg-red-500 rounded-full shadow-inner relative flex items-center justify-center">
                                        <div className="absolute top-2 right-3 w-3 h-3 bg-red-400 rounded-full opacity-50"></div>
                                    </div>
                                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2">
                                        <div className="w-4 h-2 bg-green-600 rounded-t-full"></div>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 text-lg">Focus Mode</h4>
                                    <p className="text-gray-400 text-sm font-medium">Today: 0m • Streak: 0</p>
                                </div>
                            </div>
                            <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-md"><Play size={20} fill="currentColor" /></div>
                        </div>
                    </div>
                </div>
            );
        }

        if (id === 'habit') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Medium (2x2)</span>
                        <div className="bg-green-300 p-4 rounded-3xl shadow-lg w-40 h-40 flex flex-col justify-between relative overflow-hidden mx-auto transform hover:scale-105 transition cursor-pointer" onClick={() => triggerHaptic.selection()}>
                            <div>
                                <p className="text-green-800 text-[10px] font-bold opacity-70 mb-1">{habitStreak > 0 ? `${habitStreak} Days` : '16 Days'}</p>
                                <p className="text-green-900 font-bold text-lg leading-tight max-w-[80%]">{primaryHabit.name}</p>
                            </div>
                            <div className="absolute -bottom-1 -right-2 text-6xl transform rotate-12 filter drop-shadow-sm">🍌</div> 
                        </div>
                    </div>
                </div>
            );
        }

        if (id === 'studyStreak') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Small (2x2)</span>
                        <div className="bg-gradient-to-br from-orange-400 to-red-500 p-4 rounded-3xl shadow-lg w-32 h-32 flex flex-col items-center justify-center relative overflow-hidden mx-auto transform hover:scale-105 transition cursor-pointer text-white" onClick={() => triggerHaptic.selection()}>
                            <Flame size={40} className="mb-1" fill="currentColor" />
                            <div className="text-center">
                                <p className="text-3xl font-black leading-none">12</p>
                                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Day Streak</p>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (id === 'todaysQuiz') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Wide (4x2)</span>
                        <div className="bg-white p-4 rounded-[2rem] shadow-lg w-full h-32 flex items-center justify-between relative overflow-hidden mx-auto transform hover:scale-105 transition cursor-pointer" onClick={() => triggerHaptic.selection()}>
                            <div className="flex flex-col h-full justify-center space-y-1">
                                <div className="flex items-center text-purple-600 mb-1">
                                    <BrainCircuit size={18} className="mr-2" />
                                    <span className="font-bold text-sm uppercase tracking-wider">Today's Review</span>
                                </div>
                                <h4 className="font-black text-gray-800 text-3xl">{dueCount} <span className="text-lg font-bold text-gray-400">due</span></h4>
                            </div>
                            <div className="h-full flex flex-col justify-end">
                                <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-md ml-auto"><Play size={20} fill="currentColor" className="ml-1" /></div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        
        if (id === 'studyProgress') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Medium (2x2)</span>
                        <div className="bg-gray-900 p-4 rounded-[2rem] shadow-lg w-40 h-40 flex flex-col justify-between relative overflow-hidden mx-auto transform hover:scale-105 transition cursor-pointer text-white" onClick={() => triggerHaptic.selection()}>
                            <div className="flex items-center space-x-2 text-blue-400">
                                <BarChart3 size={16} />
                                <span className="text-xs font-bold uppercase tracking-wider">Topics</span>
                            </div>
                            <div>
                                <h4 className="text-4xl font-black">{totalTopics}</h4>
                                <p className="text-xs text-gray-400 font-medium">mastered</p>
                            </div>
                            <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mt-2">
                                <div className="bg-blue-500 h-full w-[65%] rounded-full"></div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="p-8 text-center text-white/70 italic">Preview not available for this widget variant yet.</div>
        );
    };

    return (
        <div className="px-0 py-4 space-y-6 relative h-full overflow-y-auto">
            <div className="flex items-center space-x-2 mb-4 px-4 sticky top-0 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md z-10 py-2">
                <button onClick={() => goBackOrFallback('#/settings')} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600`}>
                    <ArrowLeft size={24} />
                </button>
                <h2 className={`text-2xl font-bold text-${themeColor}-800`}>Widgets</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4 px-4">
                {/* Daily Streak Widget */}
                <LongPressable onLongPress={() => handleLongPress('studyStreak')} onClick={() => triggerHaptic.selection()}>
                    <div className="bg-gradient-to-br from-orange-400 to-red-500 p-4 rounded-3xl shadow-sm w-full aspect-square flex flex-col items-center justify-center relative overflow-hidden cursor-pointer hover:shadow-md transition text-white">
                        <Flame size={32} className="mb-2" fill="currentColor" />
                        <div className="text-center">
                            <p className="text-2xl font-black leading-tight">12</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">Day Streak</p>
                        </div>
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center">Study Streak</p>
                </LongPressable>

                {/* Study Progress Widget */}
                <LongPressable onLongPress={() => handleLongPress('studyProgress')} onClick={() => { triggerHaptic.selection(); navigateTo('subjects'); }}>
                    <div className="bg-gray-900 p-4 rounded-3xl shadow-sm w-full aspect-square flex flex-col justify-between relative overflow-hidden cursor-pointer hover:shadow-md transition text-white">
                        <div className="flex items-center space-x-1.5 text-blue-400">
                            <BarChart3 size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Topics</span>
                        </div>
                        <div>
                            <h4 className="text-3xl font-black">{totalTopics}</h4>
                            <p className="text-[10px] text-gray-400 font-medium leading-none mt-1">mastered</p>
                        </div>
                        <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full w-[65%] rounded-full"></div>
                        </div>
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center">Study Progress</p>
                </LongPressable>

                {/* Today's Quiz Widget (Takes full width logically but here shown as tile for grid) */}
                <div className="col-span-2">
                    <LongPressable onLongPress={() => handleLongPress('todaysQuiz')} onClick={() => { triggerHaptic.selection(); navigateTo('diary'); }}>
                        <div className="bg-white p-4 rounded-3xl shadow-sm w-full flex items-center justify-between relative overflow-hidden cursor-pointer hover:shadow-md transition">
                            <div className="flex flex-col">
                                <div className="flex items-center text-purple-600 mb-1">
                                    <BrainCircuit size={16} className="mr-1.5" />
                                    <span className="font-bold text-[10px] uppercase tracking-wider">Review Session</span>
                                </div>
                                <h4 className="font-black text-gray-800 text-2xl">{dueCount} <span className="text-sm font-bold text-gray-400">due</span></h4>
                            </div>
                            <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-md">
                                <Play size={16} fill="currentColor" className="ml-0.5" />
                            </div>
                        </div>
                        <p className="text-xs font-medium text-gray-700 mt-2 text-center">Today's Quiz (4x2)</p>
                    </LongPressable>
                </div>

                {/* Focus Widget */}
                <LongPressable onLongPress={() => handleLongPress('focus')} onClick={() => { triggerHaptic.selection(); navigateTo('pomodoro'); }}>
                    <div className="bg-white p-4 rounded-3xl shadow-sm w-full aspect-square flex flex-col items-center justify-between relative overflow-hidden cursor-pointer hover:shadow-md transition">
                        <div className="mt-2 relative">
                            <div className="w-14 h-14 bg-red-500 rounded-full shadow-inner relative flex items-center justify-center">
                                {/* Gloss */}
                                <div className="absolute top-2 right-3 w-3 h-3 bg-red-400 rounded-full opacity-50"></div>
                            </div>
                            {/* Stem */}
                            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2">
                                <div className="w-4 h-2 bg-green-600 rounded-t-full"></div>
                                <div className="w-1 h-2 bg-green-600 mx-auto"></div>
                            </div>
                        </div>
                        <div className="text-center -mt-1">
                            <p className="text-gray-400 text-xs font-medium">Today: 0m</p>
                        </div>
                        <div className="w-full py-2 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md">
                            <Play size={14} fill="currentColor" className="mr-1" /> Start
                        </div>
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center">Focus</p>
                </LongPressable>

                {/* Today's Habit Widget */}
                <LongPressable onLongPress={() => handleLongPress('habit')} onClick={() => { triggerHaptic.selection(); navigateTo('habit'); }}>
                    <div className="bg-green-300 p-5 rounded-3xl shadow-sm w-full aspect-square flex flex-col justify-between relative overflow-hidden cursor-pointer hover:shadow-md transition">
                        <div>
                            <p className="text-green-800 text-xs font-bold opacity-70 mb-1">{habitStreak > 0 ? `${habitStreak} Days` : '16 Days'}</p>
                            <p className="text-green-900 font-bold text-xl leading-tight max-w-[80%]">{primaryHabit.name}</p>
                        </div>
                        <div className="absolute -bottom-1 -right-2 text-7xl transform rotate-12 filter drop-shadow-sm">🍌</div> 
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center">Today's Habit</p>
                </LongPressable>

                {/* Habit Heat Map */}
                <LongPressable onLongPress={() => handleLongPress('heatmap')} onClick={() => { triggerHaptic.selection(); navigateTo('habit'); }}>
                    <div className="bg-white p-4 rounded-3xl shadow-sm w-full aspect-square flex flex-col cursor-pointer hover:shadow-md transition">
                        <div className="flex items-center space-x-2 mb-3">
                            <div className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center text-[10px] text-white font-bold shrink-0">
                                {primaryHabit.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-bold text-gray-700 truncate">{primaryHabit.name}</span>
                        </div>
                        
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="flex justify-between text-[8px] text-gray-400 mb-1 px-0.5">
                                {weekDays.map((d, i) => <span key={i}>{d}</span>)}
                            </div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {Array.from({length: 28}).map((_, i) => {
                                    // Visual simulation of heatmap
                                    const active = (i % 3 === 0) || (i % 5 === 0); 
                                    return <div key={i} className={`h-1.5 w-full rounded-full ${active ? 'bg-green-400' : 'bg-gray-100'}`}></div>
                                })}
                            </div>
                        </div>
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center">Habit Heat Map</p>
                </LongPressable>

                {/* Quick Add */}
                <LongPressable onLongPress={() => handleLongPress('tasks')} onClick={() => { triggerHaptic.selection(); navigateTo('task'); }}>
                    <div className="bg-white p-5 rounded-3xl shadow-sm w-full aspect-square flex flex-col justify-between cursor-pointer hover:shadow-md transition">
                        <h3 className="text-lg font-bold text-gray-900">Add Task</h3>
                        <div className="space-y-3">
                            <div className="flex items-center text-gray-500 text-xs font-medium">
                                <CalendarIcon size={14} className="mr-2 text-gray-400" /> Today
                            </div>
                            <div className="flex items-center text-gray-500 text-xs font-medium">
                                <Inbox size={14} className="mr-2 text-gray-400" /> Inbox
                            </div>
                        </div>
                        <div className="flex justify-end mt-2">
                             <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                                <Plus size={20} />
                            </div>
                        </div>
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center">Quick Add</p>
                </LongPressable>
            </div>
            
            <p className="text-center text-xs text-gray-400 mt-6 px-4 pb-10">
                Long press on any widget to preview on desktop (Android App Only).
            </p>

            {/* Desktop Preview Overlay Modal */}
            {previewWidget && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-gray-100 dark:bg-gray-900 rounded-[2rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8">
                        <div className="p-6 relative">
                            <button 
                                onClick={() => { triggerHaptic.selection(); setPreviewWidget(null); }}
                                className="absolute top-4 right-4 p-2 bg-gray-200/50 dark:bg-gray-800/50 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-white transition"
                            >
                                <X size={20} />
                            </button>
                            
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Add to Home Screen</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
                                Choose a widget size. Adding native widgets requires installation of the app via Android/iOS.
                            </p>

                            <div className="bg-gray-200/50 dark:bg-gray-800/50 p-6 rounded-3xl border border-white/20 dark:border-white/5 space-y-6">
                                {renderWidgetPreview(previewWidget)}
                            </div>
                        </div>
                        <div className="p-4 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800">
                            <button 
                                onClick={() => {
                                    triggerHaptic.notification('Success');
                                    alert('Native widgets require native OS integration! This preview demonstrates how they would look.');
                                    setPreviewWidget(null);
                                }}
                                className={`w-full py-3.5 bg-${themeColor}-600 hover:bg-${themeColor}-700 text-white rounded-xl font-bold text-sm shadow-md transition`}
                            >
                                Add Widget
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
