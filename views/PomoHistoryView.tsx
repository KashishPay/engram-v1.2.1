
import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../components/Card';
import { ArrowLeft, ChevronLeft, ChevronRight, History, Calendar, Clock } from 'lucide-react';
import { getAllLogs, groupLogsByDate, getLocalISODate, PomodoroDailySummary } from '../utils/sessionLog';

interface PomoHistoryViewProps {
    themeColor: string;
    navigateTo: (view: string, data?: any) => void;
}

export const PomoHistoryView: React.FC<PomoHistoryViewProps> = ({ themeColor, navigateTo }) => {
    const [history, setHistory] = useState<Record<string, PomodoroDailySummary>>({});
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string>(getLocalISODate());

    useEffect(() => {
        // Fetch ALL logs (Pomo + Topic)
        const logs = getAllLogs();
        const grouped = groupLogsByDate(logs);
        setHistory(grouped);
        
        // Listen for updates
        const handleUpdate = () => {
            const freshLogs = getAllLogs();
            setHistory(groupLogsByDate(freshLogs));
        };
        window.addEventListener('focus-log-updated', handleUpdate);
        return () => window.removeEventListener('focus-log-updated', handleUpdate);
    }, []);

    const changeMonth = (offset: number) => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
    };

    const getCalendarCells = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay(); // 0-6 Sun-Sat
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let i = 1; i <= daysInMonth; i++) cells.push(i);
        return cells;
    };

    const selectedDayData = history[selectedDate];

    // Heatmap intensity logic
    const getIntensityClass = (minutes: number) => {
        if (minutes === 0) return 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500';
        if (minutes < 25) return `bg-${themeColor}-100 dark:bg-${themeColor}-900/40 text-${themeColor}-700 dark:text-${themeColor}-300`;
        if (minutes < 60) return `bg-${themeColor}-300 dark:bg-${themeColor}-700 text-white`;
        return `bg-${themeColor}-500 dark:bg-${themeColor}-600 text-white shadow-sm`;
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="px-2.5 flex items-center space-x-2 mb-2">
                <button 
                    onClick={() => navigateTo('pomodoro')}
                    className={`p-2 rounded-full hover:bg-${themeColor}-100 dark:hover:bg-gray-800 text-${themeColor}-600 dark:text-${themeColor}-400 transition`}
                >
                    <ArrowLeft size={24} />
                </button>
                <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>Session History</h2>
            </div>

            <div className="px-2.5 space-y-6">
                <Card className="p-4">
                <div className="flex justify-between items-center mb-4 px-2">
                    <button onClick={() => changeMonth(-1)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><ChevronLeft size={24}/></button>
                    <span className="font-bold text-lg text-gray-800 dark:text-gray-100">
                        {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button onClick={() => changeMonth(1)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><ChevronRight size={24}/></button>
                </div>

                <div className="grid grid-cols-7 gap-2 mb-2 text-center">
                    {['S','M','T','W','T','F','S'].map(d => (
                        <div key={d} className="text-xs font-bold text-gray-400">{d}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                    {getCalendarCells().map((day, idx) => {
                        if (!day) return <div key={`empty-${idx}`} />;
                        
                        const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                        const dateStr = getLocalISODate(dateObj);
                        const dayData = history[dateStr];
                        const minutes = dayData?.minutes || 0;
                        const isSelected = selectedDate === dateStr;
                        const isToday = dateStr === getLocalISODate();

                        return (
                            <button
                                key={dateStr}
                                onClick={() => setSelectedDate(dateStr)}
                                className={`aspect-square flex flex-col items-center justify-center rounded-xl transition relative
                                    ${getIntensityClass(minutes)}
                                    ${isSelected ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-900 z-10' : ''}
                                `}
                            >
                                <span className={`text-sm font-bold ${isToday && !minutes ? 'text-blue-500' : ''}`}>{day}</span>
                                {isToday && !isSelected && !minutes && <div className="w-1 h-1 rounded-full bg-blue-500 absolute bottom-1.5" />}
                            </button>
                        );
                    })}
                </div>
                
                <div className="flex justify-center items-center gap-4 mt-6 text-[10px] text-gray-400">
                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-800"></div> 0m</div>
                    <div className="flex items-center gap-1"><div className={`w-3 h-3 rounded bg-${themeColor}-100 dark:bg-${themeColor}-900/40`}></div> &lt;25m</div>
                    <div className="flex items-center gap-1"><div className={`w-3 h-3 rounded bg-${themeColor}-300 dark:bg-${themeColor}-700`}></div> &lt;1h</div>
                    <div className="flex items-center gap-1"><div className={`w-3 h-3 rounded bg-${themeColor}-500 dark:bg-${themeColor}-600`}></div> 1h+</div>
                </div>
            </Card>

                <div className="flex justify-between items-center px-1">
                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {selectedDate === getLocalISODate() ? "Today's Breakdown" : new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h3>
                </div>

                <Card className="p-0 overflow-hidden border-0 shadow-sm min-h-[120px]">
                {selectedDayData ? (
                    <>
                        <div className={`p-4 bg-${themeColor}-50 dark:bg-${themeColor}-900/20 border-b border-${themeColor}-100 dark:border-${themeColor}-800 flex justify-between items-center`}>
                            <div className="flex items-center space-x-2">
                                <Clock size={18} className={`text-${themeColor}-600 dark:text-${themeColor}-400`} />
                                <span className={`font-bold text-${themeColor}-800 dark:text-${themeColor}-200 text-sm`}>
                                    Total Focus
                                </span>
                            </div>
                            <span className={`text-xs font-bold bg-white dark:bg-gray-800 px-3 py-1 rounded-full text-${themeColor}-600 dark:text-${themeColor}-400 shadow-sm border border-gray-100 dark:border-gray-700`}>
                                {selectedDayData.minutes.toFixed(1)} mins
                            </span>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-60 overflow-y-auto custom-scrollbar">
                            {selectedDayData.sessions.slice().reverse().map((session, idx) => (
                                <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                    <div className="min-w-0 pr-4">
                                        <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{session.time || '00:00'}</p>
                                        <p className={`text-xs truncate flex items-center mt-0.5 ${session.sessionLabel ? `text-${themeColor}-600 dark:text-${themeColor}-400 font-medium` : 'text-gray-500 dark:text-gray-400'}`}>
                                            {session.sessionLabel || session.topicName}
                                        </p>
                                    </div>
                                    <div className="shrink-0 flex items-center text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600">
                                        {session.minutes.toFixed(1)}m
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="p-10 text-center flex flex-col items-center justify-center h-full">
                        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 mb-3">
                            <History size={20} />
                        </div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No sessions recorded.</p>
                        <p className="text-xs text-gray-400 mt-1">Select a date with activity to see details.</p>
                    </div>
                )}
            </Card>
        </div>
    </div>
);
};
