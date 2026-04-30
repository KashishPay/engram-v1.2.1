
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card } from '../components/Card';
import { PomodoroTimer } from '../components/PomodoroTimer';
import { Calendar as CalendarIcon, CheckSquare, LayoutGrid, MapPin, Search, Plus, Clock, Check, Trash2, X, History, ChevronLeft, ChevronRight, BookOpenText, BarChart2, List, ChevronDown, Moon, Flag } from 'lucide-react';
import { DateTimeSettings, Habit, Topic, PomodoroSession } from '../types';
import { AnalyticsService } from '../services/analytics';
import { getPomodoroLogs, logPomodoroSession, getLocalISODate, updatePomodoroLog } from '../utils/sessionLog';
import { chipClassesFor, ringDotClassesFor, polarStyle, ringConfig, bottomRowContainer, smallDotClassesFor } from '../utils/habitUtils';
import { getThemeDetails } from '../constants';
import { getIndianDateInfo, IndianDateInfo } from '../utils/indianHolidays';

interface ExtraViewProps {
    themeColor: string;
    settings?: DateTimeSettings;
    habits?: Habit[];
    onUpdateHabits?: (habits: Habit[]) => void;
    studyLog?: Topic[];
    navigateTo?: (view: string, data?: unknown) => void;
    userId?: string;
}


export const CalendarView: React.FC<ExtraViewProps> = ({ themeColor, settings, studyLog = [], userId }) => {
    const startDay = settings?.startDayOfWeek || 'sunday';
    const [selectedDate, setSelectedDate] = useState<string>(getLocalISODate());
    const [currentMonth, setCurrentMonth] = useState(new Date());
    
    // Removed 'holidays' - simplified to 'focus' or 'indian'
    const [calendarMode, setCalendarMode] = useState<'focus' | 'indian'>('focus');

    // Generate Days Header
    const baseDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun to Sat
    const startOffset = startDay === 'monday' ? 1 : startDay === 'saturday' ? 6 : 0;
    
    const weekDays = useMemo(() => {
        const days = [...baseDays];
        for(let i=0; i<startOffset; i++) {
            days.push(days.shift()!);
        }
        return days;
    }, [startOffset]);

    // Calendar Logic
    const currentMonthIdx = currentMonth.getMonth();
    const currentYear = currentMonth.getFullYear();
    
    const firstDayOfMonth = new Date(currentYear, currentMonthIdx, 1).getDay(); // 0-6 Sun-Sat
    const daysInMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate();

    // Adjust first day based on start day setting
    let adjustedFirstDay = firstDayOfMonth - startOffset;
    if (adjustedFirstDay < 0) adjustedFirstDay += 7;

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    
    // Group into weeks
    const allCells = [...Array(adjustedFirstDay).fill(null), ...days];
    const weeks: (number | null)[][] = [];
    while(allCells.length) weeks.push(allCells.splice(0, 7));

    const handleDateClick = (day: number) => {
        const dateStr = getLocalISODate(new Date(currentYear, currentMonthIdx, day));
        setSelectedDate(dateStr);
    };

    const changeMonth = (offset: number) => {
        setCurrentMonth(new Date(currentYear, currentMonthIdx + offset, 1));
    };

    // --- Data Calculation ---
    
    // 1. Study Sessions
    const dailySessions = useMemo(() => {
        if (userId) {
            const agg = AnalyticsService.getAggregates(userId);
            if (agg && agg.dailyTopicMinutes[selectedDate]) {
                const dayData = agg.dailyTopicMinutes[selectedDate];
                return Object.entries(dayData).map(([topicId, minutes]) => {
                    const topic = studyLog.find(t => t.id === topicId);
                    return {
                        topicName: topic?.topicName || 'Unknown Topic',
                        subject: topic?.subject || 'Unknown Subject',
                        minutes: minutes,
                        id: topicId 
                    };
                });
            }
        }
        const sessions: { topicName: string, subject: string, minutes: number, id: string }[] = [];
        studyLog.forEach(topic => {
            if (topic.focusLogs) {
                topic.focusLogs.forEach((log, index) => {
                    if (log.date === selectedDate) {
                        sessions.push({
                            topicName: topic.topicName,
                            subject: topic.subject,
                            minutes: log.minutes,
                            id: `${topic.id}-${index}`
                        });
                    }
                });
            }
        });
        return sessions;
    }, [studyLog, selectedDate, userId]);

    const totalMinutes = dailySessions.reduce((acc, s) => acc + s.minutes, 0);

    // 2. Indian Info for Selected Date
    const selectedIndianInfo = useMemo(() => {
        return getIndianDateInfo(new Date(selectedDate));
    }, [selectedDate]);

    // 3. Current Month Grid Info (Cache heavy calls for Indian mode)
    const monthData = useMemo(() => {
        const cache: Record<number, IndianDateInfo> = {};
        if (calendarMode !== 'focus') {
            days.forEach(d => {
                const date = new Date(currentYear, currentMonthIdx, d);
                cache[d] = getIndianDateInfo(date);
            });
        }
        return cache;
    }, [currentYear, currentMonthIdx, calendarMode, days]);

    return (
        <div className="space-y-4 pb-20">
            <h1 className={`text-3xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200 flex items-center px-2.5`}>
                <CalendarIcon className="mr-2" /> Calendar
            </h1>
            
            {/* 2-Block Mode Toggle */}
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl shadow-inner max-w-sm mx-2.5">
                <button 
                    onClick={() => setCalendarMode('focus')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        calendarMode === 'focus' 
                        ? `bg-${themeColor}-500 text-white shadow-md` 
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    Focus
                </button>
                <button 
                    onClick={() => setCalendarMode('indian')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        calendarMode === 'indian' 
                        ? `bg-orange-500 text-white shadow-md` 
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    Indian
                </button>
            </div>

            <Card className="p-4 text-center">
                <div className="flex justify-between items-center mb-4 px-2">
                    <button onClick={() => changeMonth(-1)}><ChevronLeft className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"/></button>
                    <span className="font-bold text-lg text-gray-700 dark:text-gray-200">
                        {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button onClick={() => changeMonth(1)}><ChevronRight className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"/></button>
                </div>

                <div className="flex">
                    <div className="flex-1">
                        <div className="grid grid-cols-7 gap-2 mb-2">
                            {weekDays.map((d, i) => (
                                <div key={i} className="font-bold text-gray-400 text-sm h-8 flex items-center justify-center">{d}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1 md:gap-2">
                            {weeks.map((week, wIdx) => (
                                <React.Fragment key={wIdx}>
                                    {week.map((d, dIdx) => {
                                        if (!d) return <div key={`${wIdx}-${dIdx}`} />;
                                        
                                        const dateStr = getLocalISODate(new Date(currentYear, currentMonthIdx, d));
                                        const isSelected = dateStr === selectedDate;
                                        
                                        // Study Data presence (Only relevant for Focus mode mainly)
                                        let hasStudy = false;
                                        if (userId) {
                                            const agg = AnalyticsService.getAggregates(userId);
                                            hasStudy = (agg && agg.dailyTotalMinutes[dateStr] > 0) || false;
                                        } else {
                                            hasStudy = studyLog.some(t => t.focusLogs?.some(l => l.date === dateStr));
                                        }

                                        // Holiday Data Logic
                                        const indianInfo = monthData[d];
                                        
                                        // Determine styling based on Mode
                                        let bgClass = '';
                                        let textClass = 'text-gray-700 dark:text-gray-300';
                                        let content = null;

                                        if (calendarMode === 'focus') {
                                            // 1. FOCUS MODE
                                            if (isSelected) {
                                                bgClass = `bg-${themeColor}-500 text-white shadow-md`;
                                                textClass = 'text-white';
                                            } else {
                                                bgClass = 'hover:bg-gray-100 dark:hover:bg-gray-700';
                                            }
                                            
                                            content = (
                                                <>
                                                    <span className={`text-sm font-medium ${textClass}`}>{d}</span>
                                                    {hasStudy && !isSelected && (
                                                        <div className={`w-1 h-1 rounded-full bg-${themeColor}-400 absolute bottom-1.5`}></div>
                                                    )}
                                                </>
                                            );

                                        } else if (calendarMode === 'indian') {
                                            // 2. INDIAN MODE (Tithi/Festival prioritized)
                                            if (isSelected) {
                                                bgClass = 'bg-orange-500 text-white shadow-md';
                                                textClass = 'text-white';
                                            } else {
                                                bgClass = 'bg-orange-50 dark:bg-orange-900/10 text-orange-900 dark:text-orange-200 border border-orange-100 dark:border-orange-900/30';
                                            }

                                            const showBlueDot = indianInfo?.eventTypes.includes('national');
                                            const showOrangeDot = indianInfo?.eventTypes.includes('hindu');

                                            content = (
                                                <>
                                                    <span className="absolute top-1 left-1.5 text-[9px] font-bold opacity-70">{d}</span>
                                                    <div className="flex flex-col items-center justify-center pt-2">
                                                        <span className="text-[9px] leading-tight text-center px-0.5 font-medium truncate w-full max-w-[40px]">
                                                            {indianInfo?.festival || indianInfo?.tithi || '-'}
                                                        </span>
                                                    </div>
                                                    {/* Dots for Event Type */}
                                                    <div className="absolute bottom-1 flex space-x-1">
                                                        {showBlueDot && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 ring-1 ring-white/50" title="National Holiday"></div>}
                                                        {showOrangeDot && <div className="w-1.5 h-1.5 rounded-full bg-orange-600 ring-1 ring-white/50" title="Hindu Festival"></div>}
                                                    </div>
                                                </>
                                            );
                                        }

                                        return (
                                            <div 
                                                key={`${wIdx}-${dIdx}`} 
                                                onClick={() => handleDateClick(d)}
                                                className={`min-h-[40px] md:min-h-[50px] aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition relative overflow-hidden ${bgClass}`}
                                            >
                                                {content}
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Info & Activity Section */}
            <div className="mt-6">
                <div className="flex justify-between items-center mb-3 px-1">
                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {calendarMode === 'focus' ? 'Activity Log' : 'Day Details'}
                    </h3>
                    <span className="text-xs font-medium text-gray-400">
                        {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </span>
                </div>
                
                <div className="space-y-3">
                    {/* OPTION 3: SPLIT LIST LAYOUT FOR INDIAN MODE */}
                    {calendarMode === 'indian' && (
                        <div className="p-4 rounded-xl border bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800 animate-in fade-in space-y-3">
                            {/* Row 1: National Events */}
                            {selectedIndianInfo.eventTypes.includes('national') && (
                                <div className="flex items-start">
                                    <div className="flex items-center w-24 shrink-0 text-blue-700 dark:text-blue-300 font-bold text-xs">
                                        <Flag size={14} className="mr-1.5" />
                                        National
                                    </div>
                                    <div className="flex-1">
                                        {selectedIndianInfo.events
                                            .filter(e => e.type === 'national')
                                            .map((e, idx) => (
                                                <div key={idx} className="mb-1 last:mb-0">
                                                    <span className="text-sm font-bold text-gray-800 dark:text-white block">{e.name}</span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{e.desc}</span>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            )}

                            {/* Row 2: Hindu Festivals */}
                            {selectedIndianInfo.eventTypes.includes('hindu') && (
                                <div className="flex items-start">
                                    <div className="flex items-center w-24 shrink-0 text-orange-700 dark:text-orange-300 font-bold text-xs">
                                        <div className="mr-1.5 text-lg leading-none">🕉️</div>
                                        Hindu
                                    </div>
                                    <div className="flex-1">
                                        {selectedIndianInfo.events
                                            .filter(e => e.type === 'hindu')
                                            .map((e, idx) => (
                                                <div key={idx} className="mb-1 last:mb-0">
                                                    <span className="text-sm font-bold text-gray-800 dark:text-white block">{e.name}</span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{e.desc}</span>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            )}

                            {/* Separator if needed */}
                            {(selectedIndianInfo.eventTypes.length > 0) && <div className="border-t border-orange-200 dark:border-orange-800/50 my-2"></div>}

                            {/* Row 3: Tithi (Always visible) */}
                            <div className="flex items-center">
                                <div className="flex items-center w-24 shrink-0 text-gray-600 dark:text-gray-400 font-bold text-xs">
                                    <Moon size={14} className="mr-1.5" />
                                    Tithi
                                </div>
                                <div className="flex-1 text-sm font-medium text-gray-800 dark:text-white">
                                    {selectedIndianInfo.tithi}
                                </div>
                            </div>
                        </div>
                    )}

                    <Card className="p-0 overflow-hidden border-0 shadow-sm">
                        <div className={`p-4 bg-${themeColor}-50 dark:bg-${themeColor}-900/20 border-b border-${themeColor}-100 dark:border-${themeColor}-800 flex justify-between items-center`}>
                            <div className="flex items-center space-x-2">
                                <Clock size={18} className={`text-${themeColor}-600 dark:text-${themeColor}-400`} />
                                <span className={`font-bold text-${themeColor}-800 dark:text-${themeColor}-200 text-sm`}>
                                    Daily Focus
                                </span>
                            </div>
                            <span className={`text-xs font-bold bg-white dark:bg-gray-800 px-3 py-1 rounded-full text-${themeColor}-600 dark:text-${themeColor}-400 shadow-sm border border-gray-100 dark:border-gray-700`}>
                                {totalMinutes.toFixed(0)}m Total
                            </span>
                        </div>
                        
                        {dailySessions.length > 0 ? (
                            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[500px] overflow-y-auto custom-scrollbar">
                                {dailySessions.map((session) => (
                                    <React.Fragment key={session.id}>
                                        <div className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                            <div className="min-w-0 pr-4">
                                                <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{session.topicName}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center mt-0.5">
                                                    <BookOpenText size={10} className="mr-1 opacity-70" />
                                                    {session.subject}
                                                </p>
                                            </div>
                                            <div className="shrink-0 flex items-center text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600">
                                                {session.minutes.toFixed(0)}m
                                            </div>
                                        </div>
                                    </React.Fragment>
                                ))}
                            </div>
                        ) : (
                            <div className="p-10 text-center flex flex-col items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 mb-3">
                                    <History size={20} />
                                </div>
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No study sessions recorded.</p>
                                <p className="text-xs text-gray-400 mt-1">Start a Pomodoro timer to track your focus.</p>
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

export const TaskView: React.FC<ExtraViewProps> = ({ themeColor, settings, userId }) => {
// ... rest of TaskView remains identical ...
    const [tasks, setTasks] = useState<{ id: number, text: string, done: boolean, dueDate: string }[]>([
        { id: 1, text: 'Review Network Theory', done: false, dueDate: new Date(Date.now() + 86400000).toISOString() }, // Tomorrow
        { id: 2, text: 'Complete Quiz', done: true, dueDate: new Date(Date.now() + 3 * 86400000).toISOString() }, // 3 Days
    ]);
    const [newTask, setNewTask] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [showCompletedFolder, setShowCompletedFolder] = useState(false);
    const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

    const countdownMode = settings?.countdownMode || false;

    // Determine if selected date is in the past (only for Calendar view)
    const isPastDate = useMemo(() => {
        if (viewMode !== 'calendar') return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const check = new Date(selectedDate);
        check.setHours(0, 0, 0, 0);
        return check.getTime() < today.getTime();
    }, [selectedDate, viewMode]);

    // Persist tasks
    useEffect(() => {
        const stored = localStorage.getItem(`engramTasks_${userId}`);
        if (stored) {
            setTasks(JSON.parse(stored));
        } else {
            setTasks([]);
        }
        setLoadedUserId(userId);
    }, [userId]);

    useEffect(() => {
        if (loadedUserId === userId) {
            localStorage.setItem(`engramTasks_${userId}`, JSON.stringify(tasks));
        }
    }, [tasks, userId, loadedUserId]);

    const getDueDisplay = (isoDate: string) => {
        if (!isoDate) return '';
        const due = new Date(isoDate);
        if (!countdownMode) {
            return due.toLocaleDateString();
        }
        
        const now = new Date();
        const diffTime = Math.abs(due.getTime() - now.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        return `${diffDays} days left`;
    };

    const addTask = () => {
        if (isPastDate) return;
        if(!newTask.trim()) return;
        const dateToUse = viewMode === 'calendar' ? selectedDate : new Date();
        setTasks([...tasks, { id: Date.now(), text: newTask, done: false, dueDate: dateToUse.toISOString() }]);
        setNewTask('');
    };

    const toggleTask = (id: number) => {
        if (isPastDate) return;
        setTasks(tasks.map(task => task.id === id ? {...task, done: !task.done} : task));
    };

    const deleteTask = (id: number) => {
        if (isPastDate) return;
        setTasks(tasks.filter(t => t.id !== id));
    };

    // Calendar Helpers
    const changeMonth = (offset: number) => {
        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1));
    };

    const getCalendarCells = () => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let i = 1; i <= daysInMonth; i++) cells.push(i);
        return cells;
    };

    const filteredTasks = useMemo(() => {
        if (viewMode === 'list') return tasks;
        const targetDate = selectedDate.toISOString().split('T')[0];
        return tasks.filter(t => t.dueDate && t.dueDate.startsWith(targetDate));
    }, [tasks, viewMode, selectedDate]);

    // Split filtered tasks
    const pendingTasks = filteredTasks.filter(t => !t.done);
    const completedTasks = filteredTasks.filter(t => t.done);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-2 px-2.5">
                <h1 className={`text-3xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200 flex items-center`}>
                    <CheckSquare className="mr-2" /> Tasks
                </h1>
                <div className="flex space-x-2">
                    <button 
                        onClick={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
                        className={`p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition`}
                        title="Toggle View"
                    >
                        {viewMode === 'list' ? <CalendarIcon size={20} /> : <List size={20} />}
                    </button>
                </div>
            </div>

            {viewMode === 'calendar' && (
                <Card className="p-4 mb-4">
                    <div className="flex justify-between items-center mb-4">
                        <button onClick={() => changeMonth(-1)}><ChevronLeft size={20} className="text-gray-400"/></button>
                        <span className="font-bold text-gray-800 dark:text-white">
                            {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={() => changeMonth(1)}><ChevronRight size={20} className="text-gray-400"/></button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="text-xs font-bold text-gray-400">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {getCalendarCells().map((day, idx) => {
                            if (!day) return <div key={idx}></div>;
                            
                            const dateObj = new Date(Date.UTC(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                            const dateStr = dateObj.toISOString().split('T')[0];
                            
                            const dayTasks = tasks.filter(t => t.dueDate && t.dueDate.startsWith(dateStr));
                            const hasPending = dayTasks.some(t => !t.done);
                            const hasDone = dayTasks.some(t => t.done);
                            const isSelected = selectedDate.toISOString().split('T')[0] === dateStr;
                            
                            return (
                                <div 
                                    key={idx} 
                                    onClick={() => setSelectedDate(dateObj)}
                                    className={`aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer transition relative
                                        ${isSelected ? `bg-${themeColor}-100 dark:bg-${themeColor}-900/40 ring-2 ring-${themeColor}-500` : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
                                    `}
                                >
                                    <span className={`text-sm ${isSelected ? `font-bold text-${themeColor}-700 dark:text-${themeColor}-300` : 'text-gray-700 dark:text-gray-300'}`}>{day}</span>
                                    {(hasPending || hasDone) && (
                                        <div className="flex space-x-0.5 mt-1 h-1">
                                            {hasPending && <div className="w-1 h-1 rounded-full bg-red-400"></div>}
                                            {hasDone && <div className="w-1 h-1 rounded-full bg-green-400"></div>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            <div className="flex gap-2 px-2.5">
                <input 
                    className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 dark:text-white disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-900" 
                    placeholder={isPastDate ? "Cannot edit past dates" : (viewMode === 'calendar' ? `Add task for ${selectedDate.toLocaleDateString()}...` : "Add a new task...")}
                    value={newTask}
                    disabled={isPastDate}
                    onChange={(e) => setNewTask(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTask()}
                />
                <button 
                    onClick={addTask} 
                    disabled={isPastDate}
                    className={`bg-${themeColor}-500 text-white p-2 rounded-lg ${isPastDate ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Plus />
                </button>
            </div>

            {viewMode === 'calendar' && (
                 <div className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider px-2.5">
                    {selectedDate.toDateString() === new Date().toDateString() ? "Today's Tasks" : `Tasks for ${selectedDate.toLocaleDateString()}`}
                </div>
            )}

            {filteredTasks.length === 0 && (
                <div className="text-center py-8 text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                    <p>{viewMode === 'calendar' ? "No tasks for this date." : "No tasks added yet."}</p>
                </div>
            )}

            {/* Pending Tasks */}
            <div className="space-y-2">
                {pendingTasks.map(t => (
                    <Card key={t.id} className="p-3 flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            <input 
                                type="checkbox" 
                                checked={t.done} 
                                onChange={() => toggleTask(t.id)}
                                disabled={isPastDate}
                                className={`w-5 h-5 text-${themeColor}-600 rounded focus:ring-${themeColor}-500 cursor-pointer ${isPastDate ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                            <span className={`text-gray-800 dark:text-gray-100 ${isPastDate ? 'opacity-70' : ''}`}>{t.text}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            {t.dueDate && (
                                <div className={`text-xs px-2 py-1 rounded ${countdownMode ? 'bg-orange-100 text-orange-700 font-mono' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                                    {countdownMode && <Clock size={10} className="inline mr-1"/>}
                                    {getDueDisplay(t.dueDate)}
                                </div>
                            )}
                            {!isPastDate && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}
                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition relative z-10"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </Card>
                ))}
            </div>

            {/* Completed Tasks Folder */}
            {completedTasks.length > 0 && (
                <div className="mt-4">
                    <button 
                        onClick={() => setShowCompletedFolder(!showCompletedFolder)}
                        className="flex items-center text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 hover:text-gray-600 transition"
                    >
                        {showCompletedFolder ? <ChevronDown size={14} className="mr-1"/> : <ChevronRight size={14} className="mr-1"/>}
                        Completed ({completedTasks.length})
                    </button>
                    
                    {showCompletedFolder && (
                        <div className="space-y-2 opacity-80">
                            {completedTasks.map(t => (
                                <Card key={t.id} className="p-3 flex items-center justify-between group bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700">
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="checkbox" 
                                            checked={t.done} 
                                            onChange={() => toggleTask(t.id)}
                                            disabled={isPastDate}
                                            className={`w-5 h-5 text-${themeColor}-600 rounded focus:ring-${themeColor}-500 cursor-pointer ${isPastDate ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        />
                                        <span className="line-through text-gray-400">{t.text}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        {!isPastDate && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition relative z-10"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {countdownMode && (
                <p className="text-center text-xs text-orange-500 mt-4">Countdown Mode is Active</p>
            )}
        </div>
    );
};

export const EisenhowerMatrixView: React.FC<ExtraViewProps> = ({ themeColor, userId }) => {
    // ... Eisenhower Matrix implementation unchanged ...
    const [tasks, setTasks] = useState<{ id: string; text: string; q: number; done?: boolean }[]>([]);
    const [input, setInput] = useState<{ [key: number]: string }>({ 1: '', 2: '', 3: '', 4: '' });
    const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem(`engramMatrix_${userId}`);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setTasks(parsed.map((t: Record<string, unknown>) => ({ ...t, done: !!t.done })));
            } catch {
                setTasks([]);
            }
        } else {
            setTasks([]);
        }
        setLoadedUserId(userId);
    }, [userId]);

    useEffect(() => {
        if (loadedUserId === userId) {
            localStorage.setItem(`engramMatrix_${userId}`, JSON.stringify(tasks));
        }
    }, [tasks, userId, loadedUserId]);

    const addTask = (q: number) => {
        const text = input[q]?.trim();
        if (!text) return;
        setTasks([...tasks, { id: Date.now().toString(), text, q, done: false }]);
        setInput({ ...input, [q]: '' });
    };

    const removeTask = (id: string) => {
        setTasks(tasks.filter(t => t.id !== id));
    };

    const toggleTask = (id: string) => {
        setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
    };

    const quadrantConfig = [
        { q: 1, title: "Urgent & Important", color: "red", desc: "Do it now." },
        { q: 2, title: "Not Urgent & Important", color: "blue", desc: "Schedule it." },
        { q: 3, title: "Urgent & Not Important", color: "yellow", desc: "Delegate it." },
        { q: 4, title: "Not Urgent & Not Important", color: "green", desc: "Delete it." }
    ];

    return (
        <div className="space-y-4">
            <h1 className={`text-3xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200 flex items-center px-2.5`}>
                <LayoutGrid className="mr-2" /> Matrix
            </h1>
            <div className="grid grid-cols-2 gap-4">
                {quadrantConfig.map((config) => (
                    <div key={config.q} className={`bg-${config.color}-50 dark:bg-${config.color}-900/20 border-2 border-${config.color}-100 dark:border-${config.color}-800 p-3 flex flex-col h-[260px] sm:h-[300px] rounded-xl shadow-sm transition transform hover:scale-[1.02] duration-200`}>
                        <div className="flex justify-between items-start mb-2 shrink-0">
                            <div>
                                <h3 className={`font-bold text-${config.color}-700 dark:text-${config.color}-300 text-sm`}>{config.title}</h3>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 opacity-75">{config.desc}</p>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar min-h-0">
                            {tasks.filter(t => t.q === config.q).map(t => (
                                <div 
                                    key={t.id} 
                                    className="flex items-start group bg-white/70 dark:bg-gray-800/50 p-2 pl-3 rounded-lg text-xs shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-700 cursor-pointer mb-1.5 last:mb-0"
                                    onClick={() => toggleTask(t.id)}
                                >
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}
                                        className={`mr-3 mt-1 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-all ${
                                            t.done 
                                            ? `bg-${config.color}-500 border-${config.color}-500 text-white` 
                                            : `bg-white dark:bg-gray-700 border-${config.color}-200 dark:border-${config.color}-800`
                                        }`}
                                        aria-label={t.done ? "Mark as not done" : "Mark as done"}
                                    >
                                        {t.done && <Check size={10} strokeWidth={3} />}
                                    </button>
                                    <span 
                                        className={`flex-1 text-gray-700 dark:text-gray-200 font-medium overflow-wrap-anywhere leading-relaxed py-0.5 ${t.done ? 'line-through opacity-50' : ''}`}
                                    >
                                        {t.text}
                                    </span>
                                    <button 
                                        type="button"
                                        aria-label="Delete task"
                                        onClick={(e) => { e.stopPropagation(); removeTask(t.id); }} 
                                        className="task-delete-btn shrink-0"
                                    >
                                        <X size={14} strokeWidth={2.5} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="mt-2 shrink-0">
                            <input 
                                value={input[config.q] || ''}
                                onChange={(e) => setInput({...input, [config.q]: e.target.value})}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTask(config.q);
                                    }
                                }}
                                enterKeyHint="go"
                                placeholder="Add task..."
                                className="w-full text-xs p-2 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-transparent hover:border-gray-300 focus:border-blue-400 focus:bg-white dark:focus:bg-gray-800 focus:shadow-sm focus:outline-none transition-all placeholder-gray-400 text-gray-800 dark:text-gray-200"
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const PomodoroFullView: React.FC<ExtraViewProps> = ({ themeColor, navigateTo }) => {
    // ... Pomodoro Full View implementation unchanged ...
    const [logs, setLogs] = useState<PomodoroSession[]>([]);
    const [today, setToday] = useState(getLocalISODate());
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');

    const loadLogs = useCallback(() => {
        try {
            const storedLogs = getPomodoroLogs();
            setLogs(storedLogs);
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        loadLogs();
        const handleUpdate = () => loadLogs();
        const handleVisibility = () => {
            if (!document.hidden) {
                setToday(getLocalISODate());
                loadLogs();
            }
        };
        
        window.addEventListener('focus-log-updated', handleUpdate);
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleVisibility);
        
        return () => {
            window.removeEventListener('focus-log-updated', handleUpdate);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleVisibility);
        };
    }, [loadLogs]);

    const handleLog = (minutes: number) => {
        logPomodoroSession(minutes);
    };

    const startEditing = (log: PomodoroSession) => {
        setEditingId(log.createdAt);
        setEditValue(log.sessionLabel || '');
    };

    const saveLabel = (createdAt: number) => {
        if (editValue.trim()) {
            updatePomodoroLog(createdAt, { sessionLabel: editValue.trim() });
        } else {
            updatePomodoroLog(createdAt, { sessionLabel: undefined });
        }
        setEditingId(null);
    };

    const todaysLogs = logs.filter(l => l.date === today);
    const totalToday = todaysLogs.reduce((acc, l) => acc + l.minutes, 0);

    return (
        <div className="space-y-6">
            <div className="px-2.5">
                <PomodoroTimer 
                topicId="general-focus" 
                topicName="General Focus" 
                onTimeLogged={handleLog} 
                themeColor={themeColor} 
            />
            </div>
            
            <Card className="p-5">
                <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center text-lg">
                        <History size={20} className="mr-2 text-gray-500" /> Today's Sessions
                    </h3>
                    {navigateTo && (
                        <button 
                            onClick={() => navigateTo('pomoCalendar')}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-bold transition bg-${themeColor}-100 text-${themeColor}-600 dark:bg-${themeColor}-900/30 dark:text-${themeColor}-400 hover:bg-${themeColor}-200 dark:hover:bg-${themeColor}-800`}
                            title="View History"
                        >
                            <CalendarIcon size={14} className="mr-1" />
                            <span>History</span>
                        </button>
                    )}
                </div>
                
                <div className="space-y-0 divider-y divide-gray-100 dark:divide-gray-700">
                    {todaysLogs.length > 0 ? (
                        todaysLogs.map((log, idx) => (
                            <div key={idx} className="flex justify-between items-center py-3 border-b border-gray-50 dark:border-gray-800 last:border-0">
                                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-16 shrink-0">{log.time || '00:00'}</span>
                                
                                <div className="flex-1 mx-3 min-w-0">
                                    {editingId === log.createdAt ? (
                                        <input
                                            autoFocus
                                            className="w-full bg-transparent border-b border-gray-300 dark:border-gray-600 outline-none text-sm text-gray-800 dark:text-gray-200 pb-0.5"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={() => saveLabel(log.createdAt)}
                                            onKeyDown={(e) => e.key === 'Enter' && saveLabel(log.createdAt)}
                                            placeholder="Name this session..."
                                        />
                                    ) : (
                                        <div 
                                            onClick={() => startEditing(log)}
                                            className={`text-sm truncate w-full text-left cursor-pointer group flex items-center ${log.sessionLabel ? 'text-gray-800 dark:text-gray-200 font-medium' : 'text-gray-300 dark:text-gray-600 italic hover:text-gray-400'}`}
                                        >
                                            <span className="truncate">{log.sessionLabel || 'Add label'}</span>
                                            {!log.sessionLabel && <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity border border-dashed border-gray-300 dark:border-gray-600 rounded px-1 text-[10px]">Edit</div>}
                                        </div>
                                    )}
                                </div>

                                <span className={`text-sm font-bold text-${themeColor}-600 dark:text-${themeColor}-400 shrink-0`}>{log.minutes.toFixed(1)}m</span>
                            </div>
                        ))
                    ) : (
                         <div className="text-center py-8">
                            <p className="text-sm text-gray-400 italic">No general sessions recorded today.</p>
                        </div>
                    )}
                </div>

                {todaysLogs.length > 0 && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-2 flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-300 font-bold">Total</span>
                        <span className="text-lg font-extrabold text-gray-900 dark:text-white">{totalToday.toFixed(1)} mins</span>
                    </div>
                )}
            </Card>
        </div>
    );
};

export const HabitTrackerView: React.FC<ExtraViewProps> = ({ themeColor, habits = [], onUpdateHabits }) => {
    // ... Habit Tracker implementation unchanged ...
    const theme = getThemeDetails(themeColor);

    const [newHabitName, setNewHabitName] = useState('');
    const [showInput, setShowInput] = useState(false);
    const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(new Date());
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

    const { displayDates } = useMemo(() => {
        const display = [];
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            display.push({
                fullDate: getLocalISODate(date),
                dayName: days[date.getDay()],
                isToday: i === 0
            });
        }
        return { displayDates: display };
    }, []);

    const toggleHabit = (habitId: string, date: string) => {
        if (!onUpdateHabits) return;
        const updatedHabits = habits.map(h => {
            if (h.id === habitId) {
                const isCompleted = h.completedDates.includes(date);
                const newDates = isCompleted 
                    ? h.completedDates.filter(d => d !== date)
                    : [...h.completedDates, date];
                return { ...h, completedDates: newDates, updatedAt: new Date().toISOString() };
            }
            return h;
        });
        onUpdateHabits(updatedHabits);
    };

    const addHabit = () => {
        if (!newHabitName.trim() || !onUpdateHabits) return;
        const newHabit: Habit = {
            id: Date.now().toString(),
            name: newHabitName.trim(),
            completedDates: [],
            updatedAt: new Date().toISOString()
        };
        onUpdateHabits([...habits, newHabit]);
        setNewHabitName('');
        setShowInput(false);
    };

    const confirmDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeleteCandidateId(id);
    };

    const cancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeleteCandidateId(null);
    };

    const executeDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (onUpdateHabits) {
            onUpdateHabits(habits.filter(h => h.id !== id));
        }
        setDeleteCandidateId(null);
    };

    const changeMonth = (offset: number) => {
        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1));
    };

    const getCalendarCells = () => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let i = 1; i <= daysInMonth; i++) cells.push(i);
        return cells;
    };

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center mb-2 px-2.5">
                <h1 className={`text-3xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200 flex items-center`}>
                    <MapPin className="mr-2" /> Habits
                </h1>
                <div className="flex space-x-2">
                    <button 
                        onClick={() => setViewMode(viewMode === 'week' ? 'month' : 'week')}
                        className={`p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition`}
                        title="Toggle View"
                    >
                        {viewMode === 'week' ? <CalendarIcon size={20} /> : <BarChart2 size={20} />}
                    </button>
                    <button 
                        onClick={() => setShowInput(!showInput)}
                        className={`p-2 rounded-full ${theme.lightBg} ${theme.text} hover:opacity-80 transition`}
                    >
                        <Plus size={20} />
                    </button>
                </div>
             </div>

             {showInput && (
                <Card className="p-4 flex gap-2 animate-in fade-in slide-in-from-top-2">
                    <input 
                        value={newHabitName}
                        onChange={(e) => setNewHabitName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addHabit()}
                        placeholder="Enter habit name..."
                        className="flex-1 p-2 border rounded-lg outline-none focus:border-blue-500 bg-white dark:bg-gray-800 dark:text-white dark:border-gray-700"
                        autoFocus
                    />
                    <button 
                        onClick={addHabit}
                        className={`bg-${themeColor}-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-${themeColor}-600`}
                    >
                        Add
                    </button>
                </Card>
             )}

            {viewMode === 'month' && (
                <Card className="p-4 mb-4">
                    <div className="flex justify-between items-center mb-4">
                        <button onClick={() => changeMonth(-1)}><ChevronLeft size={20} className="text-gray-400"/></button>
                        <span className="font-bold text-gray-800 dark:text-white">
                            {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={() => changeMonth(1)}><ChevronRight size={20} className="text-gray-400"/></button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="text-xs font-bold text-gray-400">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {getCalendarCells().map((day, idx) => {
                            if (!day) return <div key={idx}></div>;
                            
                            const dateObj = new Date(Date.UTC(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                            const dateStr = getLocalISODate(dateObj); 
                            
                            const completedHabits = habits
                                .map((h, i) => ({ ...h, colorIndex: i }))
                                .filter(h => Array.isArray(h.completedDates) && h.completedDates.includes(dateStr));

                            const isSelected = getLocalISODate(selectedCalendarDate) === dateStr;
                            
                            const { r, maxDots } = ringConfig(34); 
                            const ringDots = completedHabits.slice(0, maxDots); 
                            const useRing = ringDots.length >= 4; 

                            const selectedRing = isSelected ? 'ring-2 ring-offset-1 ' + (theme?.text?.replace('text-', 'ring-') ?? 'ring-amber-400') : 'ring-0 ring-transparent';
                            const chipBg = isSelected ? `${theme.lightBg} ${selectedRing}` : 'bg-white dark:bg-gray-800';

                            return (
                                <button
                                    key={dateStr}
                                    className={[
                                        'relative',
                                        'aspect-square rounded-lg',
                                        'flex items-center justify-center',
                                        'cursor-pointer transition',
                                        chipBg,
                                        !isSelected ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : ''
                                    ].join(' ')}
                                    onClick={() => setSelectedCalendarDate(dateObj)}
                                    aria-label={`Select ${dateStr}`}
                                >
                                    <span className={`z-10 text-sm font-semibold select-none ${isSelected ? theme.text : 'text-gray-700 dark:text-gray-300'}`}>{day}</span>

                                    {!useRing && ringDots.length > 0 && (
                                        <div className={bottomRowContainer()}>
                                            {ringDots.map(h => (
                                                <div key={h.id} className={smallDotClassesFor(h.colorIndex)} />
                                            ))}
                                        </div>
                                    )}

                                    {useRing && (
                                        <div className="absolute top-1/2 left-1/2 w-0 h-0 pointer-events-none">
                                            {ringDots.map((h, i) => (
                                                <div 
                                                    key={`${h.id}-${i}`} 
                                                    className={ringDotClassesFor(h.colorIndex)}
                                                    style={polarStyle(i, ringDots.length, r, { cx: 0, cy: 0 })} 
                                                />
                                            ))}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </Card>
            )}

            <Card className="p-6">
                {habits.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                        No habits added yet. Tap + to start tracking!
                    </div>
                ) : (
                    <div className="space-y-6">
                        {viewMode === 'month' && (
                            <div className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">
                                {selectedCalendarDate.toDateString() === new Date().toDateString() ? "Today's Habits" : `Habits for ${selectedCalendarDate.toLocaleDateString()}`}
                            </div>
                        )}
                        
                        {habits.map((habit, idx) => {
                            const chipClasses = chipClassesFor(idx);

                            if (viewMode === 'month') {
                                const targetDateStr = getLocalISODate(selectedCalendarDate);
                                const isDone = habit.completedDates.includes(targetDateStr);
                                const todayStr = getLocalISODate(new Date());
                                const isEditable = targetDateStr === todayStr;

                                return (
                                    <div key={habit.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                        <span className="font-semibold text-gray-800 dark:text-gray-200">{habit.name}</span>
                                        <div className="flex items-center space-x-3">
                                            <button 
                                                onClick={() => isEditable && toggleHabit(habit.id, targetDateStr)}
                                                disabled={!isEditable}
                                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${isDone ? chipClasses : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-300'} ${!isEditable ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                {isDone && <Check size={20} strokeWidth={3} />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            }

                            // WEEK VIEW
                            if (deleteCandidateId === habit.id) {
                                return (
                                    <div key={habit.id} className="flex flex-col space-y-3 pb-4 border-b last:border-0 border-gray-100 dark:border-gray-700 last:pb-0 animate-in fade-in slide-in-from-right-5">
                                        <div className="flex justify-between items-center bg-red-50 dark:bg-red-900/20 p-3 rounded-2xl border border-red-100 dark:border-red-900/50">
                                            <span className="font-bold text-red-600 dark:text-red-400 text-sm">Delete "{habit.name}"?</span>
                                            <div className="flex space-x-2">
                                                <button 
                                                    onClick={(e) => cancelDelete(e)}
                                                    className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={(e) => executeDelete(e, habit.id)}
                                                    className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg shadow-md hover:bg-red-600 transition"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={habit.id} className="flex flex-col space-y-3 pb-4 border-b last:border-0 border-gray-100 dark:border-gray-700 last:pb-0">
                                    <div className="flex justify-between items-center">
                                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-lg">{habit.name}</span>
                                        <button 
                                            onClick={(e) => confirmDelete(e, habit.id)} 
                                            className="p-2 -mr-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition outline-none focus:outline-none"
                                        >
                                            <Trash2 size={18}/>
                                        </button>
                                    </div>
                                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/30 p-3 rounded-2xl">
                                        {displayDates.map((item) => {
                                            const isCompleted = habit.completedDates.includes(item.fullDate);
                                            const isClickable = item.isToday;

                                            return (
                                                <div key={item.fullDate} className="flex flex-col items-center space-y-1">
                                                    <span className={`text-[10px] font-bold ${item.isToday ? theme.text : 'text-gray-400'}`}>{item.dayName}</span>
                                                    <button 
                                                        onClick={() => (item.isToday || isCompleted) && toggleHabit(habit.id, item.fullDate)} 
                                                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${isCompleted ? `${chipClasses} scale-105` : isClickable ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-500 cursor-pointer' : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 opacity-60'}`}
                                                    >
                                                        {isCompleted && <Check size={18} strokeWidth={3} />}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
};

export const SearchView: React.FC<ExtraViewProps & { studyLog?: Topic[], navigateTo?: (view: string, data?: unknown) => void }> = ({ themeColor, studyLog = [], navigateTo }) => {
    // ... SearchView implementation unchanged ...
    const [query, setQuery] = useState('');

    const results = useMemo(() => {
        if (!query.trim()) return [];
        const lowerQ = query.toLowerCase();
        return studyLog.filter(t => 
            t.topicName.toLowerCase().includes(lowerQ) || 
            t.subject.toLowerCase().includes(lowerQ) ||
            t.shortNotes.toLowerCase().includes(lowerQ)
        );
    }, [query, studyLog]);

    return (
        <div className="space-y-4">
             <h1 className={`text-3xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200 flex items-center px-2.5`}>
                <Search className="mr-2" /> Search
            </h1>
            <div className="relative px-2.5">
                <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                <input 
                    className="w-full pl-10 p-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white" 
                    placeholder="Search notes, quizzes, topics..." 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                />
            </div>
            
            <div className="mt-4">
                {query.trim().length === 0 ? (
                    <div className="text-center text-gray-400 mt-10">
                        Start typing to search your study materials...
                    </div>
                ) : results.length > 0 ? (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-500 font-medium px-1">Found {results.length} results</p>
                        {results.map(topic => (
                            <button
                                key={topic.id}
                                onClick={() => navigateTo && navigateTo('topicDetail', topic)}
                                className={`w-full text-left bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition hover:border-${themeColor}-200 dark:hover:border-${themeColor}-800 flex justify-between items-center group`}
                            >
                                <div className="overflow-hidden">
                                    <h4 className="font-bold text-gray-800 dark:text-white truncate">{topic.topicName}</h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{topic.subject}</p>
                                    <p className="text-xs text-gray-400 truncate mt-1">{topic.shortNotes.substring(0, 50)}...</p>
                                </div>
                                <div className={`w-8 h-8 rounded-full bg-${themeColor}-50 dark:bg-${themeColor}-900/50 flex items-center justify-center text-${themeColor}-600 dark:text-${themeColor}-400 group-hover:bg-${themeColor}-100 dark:group-hover:bg-${themeColor}-900 transition`}>
                                    <BookOpenText size={16} />
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-gray-400">
                        No matches found for "{query}".
                    </div>
                )}
            </div>
        </div>
    );
};
