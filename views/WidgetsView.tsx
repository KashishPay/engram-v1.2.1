
import React, { useMemo } from 'react';
import { ArrowLeft, Play, Plus, Calendar as CalendarIcon, Inbox, Flame, BrainCircuit, BarChart3, MoreVertical } from 'lucide-react';
import { Topic, Habit } from '../types';
import { goBackOrFallback } from '../utils/navigation';
import { triggerHaptic } from '../utils/haptics';
import { useFocus } from '../context/FocusContext';

interface WidgetsViewProps {
    studyLog: Topic[];
    habits: Habit[];
    navigateTo: (view: string) => void;
    goBack: () => void;
    themeColor: string;
}

export const WidgetsView: React.FC<WidgetsViewProps> = ({ studyLog, habits, navigateTo, themeColor }) => {
    const { startPomodoro } = useFocus();

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

    const handleAction = (id: string) => {
        triggerHaptic.selection();
        if (id === 'focus' || id === 'miniTimer') {
            startPomodoro('General Focus', 25);
        } else if (id === 'studyProgress' || id === 'studyStreak' || id === 'heatmap' || id === 'weeklyChart') {
            // Usually navigateTo('Home') or Analytics if it existed, but we have Extra views
            navigateTo('Home');
        } else if (id === 'todaysQuiz') {
            navigateTo('Home');
        } else if (id === 'tasks' || id === 'todayTasks' || id === 'eisenhower') {
            navigateTo('Extra'); // Tasks are typically in Extra/Playground or main
        } else if (id === 'habit') {
            navigateTo('Home'); // Go to habits
        } else if (id === 'diary') {
            navigateTo('Extra');
        }
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

        if (id === 'diary') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Medium (2x2)</span>
                        <div className="bg-yellow-100 dark:bg-yellow-900/40 p-5 rounded-[2rem] shadow-lg w-40 h-40 flex flex-col justify-between relative overflow-hidden mx-auto transform hover:scale-105 transition cursor-pointer" onClick={() => triggerHaptic.selection()}>
                            <div className="flex items-center space-x-2 text-yellow-700 dark:text-yellow-500">
                                <span className="font-bold text-[10px] uppercase tracking-wider">Quick Note</span>
                            </div>
                            <div className="flex-1 mt-3 space-y-2">
                                <div className="w-full h-2.5 bg-yellow-200 dark:bg-yellow-700/50 rounded-full"></div>
                                <div className="w-3/4 h-2.5 bg-yellow-200 dark:bg-yellow-700/50 rounded-full"></div>
                            </div>
                            <div className="flex justify-end mt-2">
                                 <div className="w-10 h-10 bg-yellow-400 text-yellow-900 rounded-full flex items-center justify-center shadow-md">
                                    <Plus size={24} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (id === 'tasks') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Medium (2x2)</span>
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-lg w-40 h-40 flex flex-col justify-between relative overflow-hidden mx-auto transform hover:scale-105 transition cursor-pointer" onClick={() => triggerHaptic.selection()}>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add Task</h3>
                            <div className="space-y-3 mt-2">
                                <div className="flex items-center text-gray-500 text-[10px] font-medium">
                                    <CalendarIcon size={14} className="mr-2 text-gray-400" /> Today
                                </div>
                                <div className="flex items-center text-gray-500 text-[10px] font-medium">
                                    <Inbox size={14} className="mr-2 text-gray-400" /> Inbox
                                </div>
                            </div>
                            <div className="flex justify-end mt-auto">
                                 <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-md">
                                    <Plus size={20} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (id === 'miniTimer') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Small (4x1)</span>
                        <div className="bg-white dark:bg-gray-800 px-5 py-4 rounded-[2rem] shadow-lg w-full flex items-center justify-between relative overflow-hidden transform hover:scale-105 transition cursor-pointer" onClick={() => triggerHaptic.selection()}>
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center relative">
                                    <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                                    <div className="absolute top-0 right-0 w-3 h-3 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                                    </div>
                                </div>
                                <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">Focus</span>
                            </div>
                            <div className="flex items-center space-x-4">
                                <span className="text-2xl font-black text-red-400">25:00</span>
                                <div className="flex items-center space-x-2 text-gray-400">
                                    <Play size={16} fill="currentColor" />
                                    <MoreVertical size={16} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (id === 'weeklyChart') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Medium (4x2)</span>
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-lg w-full h-40 relative overflow-hidden flex flex-col cursor-pointer transform hover:scale-105 transition" onClick={() => triggerHaptic.selection()}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-3xl font-black text-gray-800 dark:text-white">0h <span className="text-lg text-gray-400 font-medium ml-1">36h45m</span></h4>
                                </div>
                                <div className="flex flex-col items-end space-y-1 text-[10px] font-bold">
                                    <div className="flex items-center text-red-500"><div className="w-2 h-2 rounded-full bg-red-500 mr-1.5"></div>Pomodoro</div>
                                    <div className="flex items-center text-blue-500"><div className="w-2 h-2 rounded-full bg-blue-500 mr-1.5"></div>Deep Work</div>
                                    <div className="flex items-center text-green-500"><div className="w-2 h-2 rounded-full bg-green-500 mr-1.5"></div>Reading</div>
                                </div>
                            </div>
                            <div className="flex items-end justify-between space-x-2 mt-auto h-12 border-b border-gray-100 pb-1">
                                {[3, 5, 2, 7, 4, 3, 0].map((h, i) => (
                                    <div key={i} className="flex-1 flex flex-col justify-end space-y-0.5">
                                        <div className="w-full bg-blue-300 rounded-sm" style={{height: `${h * 8}px`}}></div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-gray-400 pt-1">
                                <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (id === 'todayTasks') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Large (4x4)</span>
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-lg w-full relative overflow-hidden flex flex-col cursor-pointer transform hover:scale-105 transition" onClick={() => triggerHaptic.selection()}>
                            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                                <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">Today <span className="text-gray-400 text-xs ml-1">4</span></h4>
                                <div className="flex space-x-2 text-gray-400">
                                    <Plus size={16} />
                                    <MoreVertical size={16} />
                                </div>
                            </div>
                            <div className="space-y-3">
                                {[
                                    { color: 'border-red-400', title: 'Advanced math hw', date: 'Oct. 4, 2024' },
                                    { color: 'border-blue-400', title: 'Action Tracker', date: 'Oct. 4, 2024' },
                                    { color: 'border-yellow-400', title: 'Expenses accounting', date: 'Oct. 4, 2024' },
                                    { color: 'border-green-400', title: 'Discuss the activity plan', date: 'Oct. 4, 2024' }
                                ].map((task, i) => (
                                    <div key={i} className="flex justify-between items-center">
                                        <div className="flex items-center space-x-3">
                                            <div className={`w-4 h-4 rounded border-2 ${task.color}`}></div>
                                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{task.title}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-400">{task.date}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (id === 'eisenhower') {
            return (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Large (4x4)</span>
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-lg w-full relative overflow-hidden flex flex-col cursor-pointer transform hover:scale-105 transition" onClick={() => triggerHaptic.selection()}>
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center space-x-2">
                                    <div className="w-5 h-5 bg-yellow-100 rounded flex items-center justify-center text-yellow-600">
                                        <div className="text-[10px]">☑</div>
                                    </div>
                                    <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">Eisenhower Matrix</h4>
                                </div>
                                <div className="flex space-x-2 text-gray-400">
                                    <Plus size={16} />
                                    <MoreVertical size={16} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-red-500 mb-2">Urgent & Important</div>
                                    <div className="text-xs font-semibold text-gray-700">Visual finalizer</div>
                                    <div className="text-xs font-semibold text-gray-700">Email boss</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-yellow-500 mb-2">Not Urgent & Important</div>
                                    <div className="text-xs font-semibold text-gray-700">Expenses accounting</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-blue-500 mb-2">Urgent & Not Important</div>
                                    <div className="text-xs font-semibold text-gray-700">Errands</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-green-500 mb-2">Not Urgent & Not Important</div>
                                    <div className="text-xs font-semibold text-gray-700">Read about sci-fi</div>
                                </div>
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
                <div onClick={() => handleAction('studyStreak')} className="w-full group cursor-pointer">
                    <div className="bg-gradient-to-br from-orange-400 to-red-500 p-4 rounded-3xl shadow-sm w-full aspect-square flex flex-col items-center justify-center relative overflow-hidden cursor-pointer hover:shadow-md transition text-white">
                        <Flame size={32} className="mb-2" fill="currentColor" />
                        <div className="text-center">
                            <p className="text-2xl font-black leading-tight">12</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">Day Streak</p>
                        </div>
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Study Streak <span className="block text-[10px] opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                </div>

                {/* Study Progress Widget */}
                <div onClick={() => handleAction('studyProgress')} className="w-full group cursor-pointer">
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
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Study Progress <span className="block text-[10px] opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                </div>

                {/* Today's Quiz Widget (Takes full width logically but here shown as tile for grid) */}
                <div className="col-span-2">
                    <div onClick={() => handleAction('todaysQuiz')} className="w-full group cursor-pointer">
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
                        <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Today's Quiz (4x2) <span className="inline-block text-[10px] ml-1 opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                    </div>
                </div>

                {/* Focus Widget */}
                <div onClick={() => handleAction('focus')} className="w-full group cursor-pointer">
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
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Focus <span className="block text-[10px] opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                </div>

                {/* Today's Habit Widget */}
                <div onClick={() => handleAction('habit')} className="w-full group cursor-pointer">
                    <div className="bg-green-300 p-5 rounded-3xl shadow-sm w-full aspect-square flex flex-col justify-between relative overflow-hidden cursor-pointer hover:shadow-md transition">
                        <div>
                            <p className="text-green-800 text-xs font-bold opacity-70 mb-1">{habitStreak > 0 ? `${habitStreak} Days` : '16 Days'}</p>
                            <p className="text-green-900 font-bold text-xl leading-tight max-w-[80%]">{primaryHabit.name}</p>
                        </div>
                        <div className="absolute -bottom-1 -right-2 text-7xl transform rotate-12 filter drop-shadow-sm">🍌</div> 
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Today's Habit <span className="block text-[10px] opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                </div>

                {/* Habit Heat Map */}
                <div onClick={() => handleAction('heatmap')} className="w-full group cursor-pointer">
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
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Habit Heat Map <span className="block text-[10px] opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                </div>

                {/* Quick Add */}
                <div onClick={() => handleAction('tasks')} className="w-full group cursor-pointer">
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
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Quick Add <span className="block text-[10px] opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                </div>

                {/* Quick Note / Diary */}
                <div onClick={() => handleAction('diary')} className="w-full group cursor-pointer">
                    <div className="bg-yellow-100 dark:bg-yellow-900/30 p-5 rounded-3xl shadow-sm w-full aspect-square flex flex-col justify-between cursor-pointer hover:shadow-md transition">
                        <div className="flex items-center space-x-2 text-yellow-700 dark:text-yellow-500">
                            <span className="font-bold text-xs uppercase tracking-wider">Quick Note</span>
                        </div>
                        <div className="flex-1 mt-3 space-y-2">
                            <div className="w-full h-2 bg-yellow-200 dark:bg-yellow-700/50 rounded-full"></div>
                            <div className="w-4/5 h-2 bg-yellow-200 dark:bg-yellow-700/50 rounded-full"></div>
                        </div>
                        <div className="flex justify-end mt-2">
                             <div className="w-8 h-8 bg-yellow-400 text-yellow-900 rounded-full flex items-center justify-center shadow-sm">
                                <Plus size={20} />
                            </div>
                        </div>
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Quick Note <span className="block text-[10px] opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                </div>

                {/* Mini Timer (4x1) */}
                <div className="col-span-2">
                    <div onClick={() => handleAction('miniTimer')} className="w-full group cursor-pointer">
                        <div className="bg-white dark:bg-gray-800 px-5 py-4 rounded-3xl shadow-sm w-full flex items-center justify-between relative overflow-hidden cursor-pointer hover:shadow-md transition">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center relative">
                                    <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                                    <div className="absolute top-0 right-0 w-3 h-3 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                                    </div>
                                </div>
                                <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">Focus</span>
                            </div>
                            <div className="flex items-center space-x-4">
                                <span className="text-2xl font-black text-red-400">25:00</span>
                                <div className="flex items-center space-x-2 text-gray-400">
                                    <Play size={16} fill="currentColor" />
                                    <MoreVertical size={16} />
                                </div>
                            </div>
                        </div>
                        <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Mini Timer (4x1) <span className="inline-block text-[10px] ml-1 opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                    </div>
                </div>

                {/* Weekly Focus Chart (4x2) */}
                <div className="col-span-2">
                    <div onClick={() => handleAction('weeklyChart')} className="w-full group cursor-pointer">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm w-full relative overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-3xl font-black text-gray-800 dark:text-white">0h <span className="text-lg text-gray-400 font-medium ml-1">36h45m</span></h4>
                                </div>
                                <div className="flex flex-col items-end space-y-1 text-[10px] font-bold">
                                    <div className="flex items-center text-red-500"><div className="w-2 h-2 rounded-full bg-red-500 mr-1.5"></div>Pomodoro</div>
                                    <div className="flex items-center text-blue-500"><div className="w-2 h-2 rounded-full bg-blue-500 mr-1.5"></div>Deep Work</div>
                                    <div className="flex items-center text-green-500"><div className="w-2 h-2 rounded-full bg-green-500 mr-1.5"></div>Reading</div>
                                </div>
                            </div>
                            <div className="flex items-end justify-between space-x-2 mt-auto h-16 border-b border-gray-100 pb-1">
                                {[3, 5, 2, 7, 4, 3, 0].map((h, i) => (
                                    <div key={i} className="flex-1 flex flex-col justify-end space-y-0.5">
                                        <div className="w-full bg-blue-300 rounded-sm" style={{height: `${h * 10}px`}}></div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-gray-400 pt-1">
                                <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                            </div>
                        </div>
                        <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Weekly Focus Chart <span className="inline-block text-[10px] ml-1 opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                    </div>
                </div>

                {/* Today's Tasks (4x4) */}
                <div className="col-span-2">
                    <div onClick={() => handleAction('todayTasks')} className="w-full group cursor-pointer">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm w-full relative overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition">
                            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                                <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">Today <span className="text-gray-400 text-xs ml-1">4</span></h4>
                                <div className="flex space-x-2 text-gray-400">
                                    <Plus size={16} />
                                    <MoreVertical size={16} />
                                </div>
                            </div>
                            <div className="space-y-3">
                                {[
                                    { color: 'border-red-400', title: 'Advanced math hw', date: 'Oct. 4, 2024' },
                                    { color: 'border-blue-400', title: 'Action Tracker', date: 'Oct. 4, 2024' },
                                    { color: 'border-yellow-400', title: 'Expenses accounting', date: 'Oct. 4, 2024' },
                                    { color: 'border-green-400', title: 'Discuss the activity plan', date: 'Oct. 4, 2024' }
                                ].map((task, i) => (
                                    <div key={i} className="flex justify-between items-center">
                                        <div className="flex items-center space-x-3">
                                            <div className={`w-4 h-4 rounded border-2 ${task.color}`}></div>
                                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{task.title}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-400">{task.date}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="text-center mt-4 pt-2 border-t border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tasks</div>
                        </div>
                        <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Tasks List <span className="inline-block text-[10px] ml-1 opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                    </div>
                </div>

                {/* Eisenhower Matrix (4x4) */}
                <div className="col-span-2">
                    <div onClick={() => handleAction('eisenhower')} className="w-full group cursor-pointer">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm w-full relative overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center space-x-2">
                                    <div className="w-5 h-5 bg-yellow-100 rounded flex items-center justify-center text-yellow-600">
                                        <div className="text-[10px]">☑</div>
                                    </div>
                                    <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">Eisenhower Matrix</h4>
                                </div>
                                <div className="flex space-x-2 text-gray-400">
                                    <Plus size={16} />
                                    <MoreVertical size={16} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-red-500 mb-2">Urgent & Important</div>
                                    <div className="text-xs font-semibold text-gray-700">Visual finalizer</div>
                                    <div className="text-xs font-semibold text-gray-700">Follow-up details</div>
                                    <div className="text-xs font-semibold text-gray-700">Email boss</div>
                                    <div className="text-[10px] text-gray-400 mt-1">2 completed...</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-yellow-500 mb-2">Not Urgent & Important</div>
                                    <div className="text-xs font-semibold text-gray-700">Expenses accounting</div>
                                    <div className="text-xs font-semibold text-gray-700">Industry articles</div>
                                    <div className="text-[10px] text-gray-400 mt-1">1 completed...</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-blue-500 mb-2">Urgent & Not Important</div>
                                    <div className="text-xs font-semibold text-gray-700">Schedule review</div>
                                    <div className="text-xs font-semibold text-gray-700">Errands</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-green-500 mb-2">Not Urgent & Not Important</div>
                                    <div className="text-xs font-semibold text-gray-700">Read about sci-fi</div>
                                    <div className="text-xs font-semibold text-gray-700">Programing practice</div>
                                </div>
                            </div>
                            <div className="text-center mt-4 pt-2 border-t border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Eisenhower Matrix</div>
                        </div>
                        <p className="text-xs font-medium text-gray-700 mt-2 text-center transition-colors group-hover:text-blue-600">Eisenhower Matrix <span className="inline-block text-[10px] ml-1 opacity-0 group-hover:opacity-100">(Tap to select)</span></p>
                    </div>
                </div>
            </div>
            
            <p className="text-center text-xs text-gray-400 mt-6 px-4 pb-10">
                Actionable dashboard. Tap widgets to navigate to features or start timers.
            </p>
        </div>
    );
};
