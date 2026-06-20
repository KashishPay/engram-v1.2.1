
import React from 'react';
import { ArrowLeft, Play, Plus, Calendar as CalendarIcon, Inbox } from 'lucide-react';
import { Topic, Habit } from '../types';
import { goBackOrFallback } from '../utils/navigation';

interface WidgetsViewProps {
    studyLog: Topic[];
    habits: Habit[];
    navigateTo: (view: string) => void;
    goBack: () => void;
    themeColor: string;
}

export const WidgetsView: React.FC<WidgetsViewProps> = ({ habits, navigateTo, themeColor }) => {
    // Logic for dynamic data
    // const today = new Date().toISOString().split('T')[0];
    
    // Habit logic
    const primaryHabit = habits.length > 0 ? habits[0] : { name: 'Eat fruits', completedDates: [] };
    const habitStreak = primaryHabit.completedDates.length;
    
    // Mock days for heatmap visual
    const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
        <div className="px-0 py-4 space-y-6">
             <div className="flex items-center space-x-2 mb-4">
                <button onClick={() => goBackOrFallback('#/settings')} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600`}>
                    <ArrowLeft size={24} />
                </button>
                <h2 className={`text-2xl font-bold text-${themeColor}-800`}>Widgets</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                {/* Focus Widget */}
                <div className="flex flex-col items-center">
                    <div className="bg-white p-4 rounded-3xl shadow-sm w-full aspect-square flex flex-col items-center justify-between relative overflow-hidden">
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
                        <button 
                            onClick={() => navigateTo('pomodoro')}
                            className="w-full py-2 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md hover:bg-blue-700 transition"
                        >
                            <Play size={14} fill="currentColor" className="mr-1" /> Start
                        </button>
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2">Focus</p>
                </div>

                {/* Today's Habit Widget */}
                <div className="flex flex-col items-center">
                    <div className="bg-green-300 p-5 rounded-3xl shadow-sm w-full aspect-square flex flex-col justify-between relative overflow-hidden cursor-pointer hover:shadow-md transition" onClick={() => navigateTo('habit')}>
                        <div>
                            <p className="text-green-800 text-xs font-bold opacity-70 mb-1">{habitStreak > 0 ? `${habitStreak} Days` : '16 Days'}</p>
                            <p className="text-green-900 font-bold text-xl leading-tight max-w-[80%]">{primaryHabit.name}</p>
                        </div>
                        <div className="absolute -bottom-1 -right-2 text-7xl transform rotate-12 filter drop-shadow-sm">🍌</div> 
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2">Today's Habit</p>
                </div>

                {/* Habit Heat Map */}
                <div className="flex flex-col items-center">
                    <div 
                        className="bg-white p-4 rounded-3xl shadow-sm w-full aspect-square flex flex-col cursor-pointer hover:shadow-md transition"
                        onClick={() => navigateTo('habit')}
                    >
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
                    <p className="text-xs font-medium text-gray-700 mt-2">Habit Heat Map</p>
                </div>

                {/* Quick Add */}
                <div className="flex flex-col items-center">
                    <div className="bg-white p-5 rounded-3xl shadow-sm w-full aspect-square flex flex-col justify-between cursor-pointer hover:shadow-md transition" onClick={() => navigateTo('task')}>
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
                    <p className="text-xs font-medium text-gray-700 mt-2">Quick Add</p>
                </div>
            </div>
            
            <p className="text-center text-xs text-gray-400 mt-6 px-4">
                Long press on any widget to preview on desktop (Android App Only).
            </p>
        </div>
    );
};
