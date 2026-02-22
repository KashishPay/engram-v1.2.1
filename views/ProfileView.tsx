
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ArrowLeft, MoreVertical, ChevronRight, Edit2, Plus, Check, X, Camera, Flame, LogOut, UserPlus, Users, Lock, Info, RotateCw, Calendar as CalendarIcon, AlertTriangle, Sparkles } from 'lucide-react';
import { Card } from '../components/Card';
import { Topic, UserProfile, Habit } from '../types';
import { generateScoreAnalysis } from '../services/gemini';
import { goBackOrFallback } from '../utils/navigation';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { getHabitColor, dotClassesFor, ringDotClassesFor, polarStyle, ringConfig } from '../utils/habitUtils';
import { getThemeDetails } from '../constants';

interface ProfileViewProps {
    userId: string;
    studyLog: Topic[];
    userProfile: UserProfile;
    onUpdateProfile: (profile: UserProfile) => void;
    habits: Habit[];
    onUpdateHabits: (habits: Habit[]) => void;
    navigateTo: (view: string, data?: any) => void;
    goBack: () => void;
    themeColor: string;
    availableProfiles: {id: string, name: string, avatar: string | null}[];
    onSwitchProfile: (id: string) => void;
    onAddProfile: () => void;
    onSignOut: () => void;
}

const StatsChart = ({ data, color, height = 60, labels }: { data: number[], color: string, height?: number, labels: string[] }) => {
    const max = Math.max(...data, 1);
    const min = 0;
    const width = 300;
    
    // Create points for SVG polyline
    const points = data.map((val, idx) => {
        const x = (idx / (data.length - 1)) * width;
        const y = height - ((val - min) / (max - min)) * height;
        return `${x},${y}`;
    }).join(' ');

    // Gradient ID
    const gradId = `grad-${color}-${Math.random()}`;

    return (
        <div className="w-full h-full relative" style={{ height: `${height + 20}px` }}>
            <svg viewBox={`0 0 ${width} ${height + 10}`} className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.5" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                {/* Area under curve */}
                <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#${gradId})`} />
                {/* Line */}
                <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {/* Dots */}
                {data.map((val, idx) => {
                    const x = (idx / (data.length - 1)) * width;
                    const y = height - ((val - min) / (max - min)) * height;
                    return (
                        <circle key={idx} cx={x} cy={y} r="3" fill="#fff" stroke={color} strokeWidth="2" />
                    );
                })}
            </svg>
            <div className="flex justify-between text-xs text-gray-300 dark:text-gray-500 mt-2 font-medium">
                {labels.map((l, i) => (
                    <span key={i} className={i === 0 || i === labels.length - 1 || i % 2 === 0 ? '' : 'hidden md:inline'}>{l}</span>
                ))}
            </div>
        </div>
    );
};

export const ProfileView: React.FC<ProfileViewProps> = ({ 
    userId, studyLog, userProfile, onUpdateProfile, habits, onUpdateHabits, navigateTo, goBack, themeColor, availableProfiles = [], onSwitchProfile, onAddProfile, onSignOut
}) => {
    
    const { user } = useAuth();
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState(userProfile.name);
    const [newHabitName, setNewHabitName] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [showSwitchModal, setShowSwitchModal] = useState(false);
    const [activeModal, setActiveModal] = useState<'badges' | 'score' | 'streak' | null>(null);
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [analyzingScore, setAnalyzingScore] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Theme Config
    const theme = getThemeDetails(themeColor);

    // Password Update State
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [newPwd, setNewPwd] = useState("");
    const [confirmPwd, setConfirmPwd] = useState("");
    const [pwdMsg, setPwdMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
    const [pwdBusy, setPwdBusy] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        if (showMenu) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMenu]);

    const getLast7Days = () => {
        const days = [];
        const labels = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(d.toISOString().split('T')[0]);
            if (i === 0) {
                labels.push('Today');
            } else {
                const dayNum = d.getDate();
                const suffix = (dayNum === 1 || dayNum === 21 || dayNum === 31) ? 'st' :
                               (dayNum === 2 || dayNum === 22) ? 'nd' :
                               (dayNum === 3 || dayNum === 23) ? 'rd' : 'th';
                labels.push(`${dayNum}${suffix}`);
            }
        }
        return { days, labels };
    };
    const { days: last7Days, labels: dateLabels } = useMemo(() => getLast7Days(), []);

    const achievementScoreData = useMemo(() => {
        return last7Days.map(date => {
            const topicCount = studyLog.filter(t => t.createdAt.split('T')[0] <= date).length;
            const repCount = studyLog.reduce((acc, t) => {
                return acc + (t.repetitions?.filter(r => r.dateCompleted <= date).length || 0);
            }, 0);
            return topicCount + (repCount * 2);
        });
    }, [studyLog, last7Days]);

    const currentAchievementScore = achievementScoreData[achievementScoreData.length - 1];
    const level = Math.floor(currentAchievementScore / 20) + 1;

    const streakInfo = useMemo(() => {
        const activityDates = new Set<string>();
        studyLog.forEach(topic => {
            if (topic.createdAt) activityDates.add(topic.createdAt.split('T')[0]);
            topic.repetitions?.forEach(rep => activityDates.add(rep.dateCompleted));
            topic.focusLogs?.forEach(log => activityDates.add(log.date));
        });
        const sortedDates = Array.from(activityDates).sort();
        if (sortedDates.length === 0) return { current: 0 };
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        let current = 0;
        const lastActive = sortedDates[sortedDates.length - 1];
        if (lastActive === today || lastActive === yesterday) {
            current = 1;
            let currDate = lastActive;
            for (let i = sortedDates.length - 2; i >= 0; i--) {
                const prevDate = sortedDates[i];
                const d = new Date(currDate);
                d.setDate(d.getDate() - 1);
                if (prevDate === d.toISOString().split('T')[0]) {
                    current++;
                    currDate = prevDate;
                } else break;
            }
        }
        return { current };
    }, [studyLog]);

    const currentStreak = streakInfo.current;

    const badges = useMemo(() => {
        const topicCount = studyLog.length;
        const totalMinutes = studyLog.reduce((acc, t) => acc + (t.pomodoroTimeMinutes || 0), 0);
        let totalReps = 0;
        studyLog.forEach(t => { totalReps += (t.repetitions?.length || 0); });
        const allBadgeDefinitions = [
            { id: 's1', icon: '🔥', lvl: 1, name: 'Spark', desc: '3 Day Streak', req: 3, type: 'streak' },
            { id: 's2', icon: '⚡', lvl: 2, name: 'Charged', desc: '7 Day Streak', req: 7, type: 'streak' },
            { id: 's3', icon: '🌋', lvl: 3, name: 'Wildfire', desc: '21 Day Streak', req: 21, type: 'streak' },
            { id: 's4', icon: '🌌', lvl: 4, name: 'Eternal', desc: '100 Day Streak', req: 100, type: 'streak' },
            { id: 't1', icon: '🌱', lvl: 1, name: 'Initiate', desc: 'Create 1 Topic', req: 1, type: 'topic' },
            { id: 't2', icon: '📚', lvl: 2, name: 'Scribe', desc: 'Create 10 Topics', req: 10, type: 'topic' },
            { id: 't3', icon: '🏛️', lvl: 3, name: 'Archivist', desc: 'Create 50 Topics', req: 50, type: 'topic' },
            { id: 'f1', icon: '⏳', lvl: 1, name: 'Focused', desc: '1 Hour Study', req: 60, type: 'minutes' },
            { id: 'f2', icon: '🧘', lvl: 2, name: 'Deep Diver', desc: '5 Hours Study', req: 300, type: 'minutes' },
            { id: 'r1', icon: '🛡️', lvl: 1, name: 'Reviewer', desc: '10 Repetitions', req: 10, type: 'reps' },
            { id: 'r2', icon: '⚔️', lvl: 2, name: 'Veteran', desc: '50 Repetitions', req: 50, type: 'reps' },
            { id: 'r3', icon: '🏰', lvl: 3, name: 'Titan', desc: '200 Repetitions', req: 200, type: 'reps' },
        ];
        return allBadgeDefinitions.map(def => {
            let unlocked = false;
            if (def.type === 'streak') unlocked = currentStreak >= def.req;
            if (def.type === 'topic') unlocked = topicCount >= def.req;
            if (def.type === 'minutes') unlocked = totalMinutes >= def.req;
            if (def.type === 'reps') unlocked = totalReps >= def.req;
            return { ...def, unlocked };
        });
    }, [studyLog, currentStreak]);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            onUpdateProfile({ ...userProfile, avatar: reader.result as string });
        };
        reader.readAsDataURL(file);
    };

    const handleSaveName = () => {
        if (tempName.trim()) {
            onUpdateProfile({ ...userProfile, name: tempName.trim() });
            setIsEditingName(false);
        }
    };

    const handleAddHabit = () => {
        if (!newHabitName.trim()) return;
        const newHabit: Habit = {
            id: Date.now().toString(),
            name: newHabitName.trim(),
            completedDates: []
        };
        onUpdateHabits([...habits, newHabit]);
        setNewHabitName('');
    };

    const toggleHabitForToday = (habitId: string) => {
        const today = new Date().toISOString().split('T')[0];
        onUpdateHabits(habits.map(h => {
            if (h.id === habitId) {
                const isCompleted = h.completedDates.includes(today);
                return {
                    ...h,
                    completedDates: isCompleted 
                        ? h.completedDates.filter(d => d !== today)
                        : [...h.completedDates, today]
                };
            }
            return h;
        }));
    };

    const handleAnalyzeScore = async () => {
        setAnalyzingScore(true);
        const analysis = await generateScoreAnalysis(userProfile.name, currentAchievementScore, level, studyLog);
        setAiAnalysis(analysis);
        setAnalyzingScore(false);
    };

    const handleUpdatePassword = async () => {
        if (newPwd !== confirmPwd) {
            setPwdMsg({ type: 'error', text: "Passwords do not match." });
            return;
        }
        if (newPwd.length < 6) {
            setPwdMsg({ type: 'error', text: "Password must be at least 6 characters." });
            return;
        }
        setPwdBusy(true);
        setPwdMsg(null);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPwd });
            if (error) throw error;
            setPwdMsg({ type: 'success', text: "Password updated successfully!" });
            setTimeout(() => {
                setShowPasswordModal(false);
                setPwdMsg(null);
                setNewPwd("");
                setConfirmPwd("");
            }, 1500);
        } catch (e: any) {
            setPwdMsg({ type: 'error', text: e.message || "Failed to update." });
        } finally {
            setPwdBusy(false);
        }
    };

    const scrollRef = useRef<HTMLDivElement>(null);

    const activityDates = useMemo(() => {
        const dates = [];
        const today = new Date();
        for (let i = -45; i <= 15; i++) {
            const d = new Date();
            d.setDate(today.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            
            // Map individual habit completion status
            const dayHabits = habits.map((h, idx) => ({
                id: h.id,
                completed: h.completedDates.includes(dateStr),
                colorIndex: idx, // Pass index for color mapping
                name: h.name
            }));

            dates.push({
                date: d,
                dateStr,
                dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
                dayNum: d.getDate(),
                dayHabits,
                isToday: i === 0
            });
        }
        return dates;
    }, [habits]);

    const activeDaysCount = useMemo(() => {
        const today = new Date();
        const cutoff = new Date();
        cutoff.setDate(today.getDate() - 30);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        const activeDates = new Set<string>();
        habits.forEach(h => {
            h.completedDates.forEach(d => {
                if (d >= cutoffStr && d <= todayStr) {
                    activeDates.add(d);
                }
            });
        });
        return activeDates.size;
    }, [habits]);

    useEffect(() => {
        if (scrollRef.current) {
            const todayEl = scrollRef.current.querySelector('[data-is-today="true"]');
            if (todayEl) {
                const containerWidth = scrollRef.current.offsetWidth;
                const elLeft = (todayEl as HTMLElement).offsetLeft;
                const elWidth = (todayEl as HTMLElement).offsetWidth;
                scrollRef.current.scrollLeft = elLeft - containerWidth / 2 + elWidth / 2;
            }
        }
    }, [activityDates]);

    return (
        <div className="min-h-full bg-orange-50/30 dark:bg-gray-900 pb-[calc(var(--tabbar-height,64px)+env(safe-area-inset-bottom,0px)+24px)] -mx-1.5 transition-colors duration-200 relative">
            <div className="p-4 flex items-center justify-between sticky top-0 bg-white/0 z-20 pointer-events-none">
                <button 
                    onClick={() => goBackOrFallback('#/settings')}
                    className="w-10 h-10 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-full shadow-sm hover:bg-white dark:hover:bg-gray-700 transition pointer-events-auto text-gray-800 dark:text-gray-200"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="relative pointer-events-auto" ref={menuRef}>
                    <button 
                        onClick={() => setShowMenu(!showMenu)}
                        className="w-10 h-10 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-full shadow-sm hover:bg-white dark:hover:bg-gray-700 transition text-gray-800 dark:text-gray-200"
                    >
                        <MoreVertical size={20} />
                    </button>
                    {showMenu && (
                        <div className="absolute right-0 top-12 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-30 animate-in fade-in slide-in-from-top-2">
                            <button 
                                onClick={() => { setShowSwitchModal(true); setShowMenu(false); }}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center text-sm font-medium text-gray-700 dark:text-gray-200"
                            >
                                <Users size={16} className="mr-2" /> Switch Profile
                            </button>
                            {user && (
                                <button 
                                    onClick={() => { setShowPasswordModal(true); setShowMenu(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center text-sm font-medium text-gray-700 dark:text-gray-200"
                                >
                                    <Lock size={16} className="mr-2" /> Set New Password
                                </button>
                            )}
                            <button 
                                onClick={() => { onSignOut(); setShowMenu(false); }}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center text-sm font-medium text-red-600"
                            >
                                <LogOut size={16} className="mr-2" /> Sign Out
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Overlays for Details */}
            {activeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setActiveModal(null)}>
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                            <X size={20} />
                        </button>
                        
                        {activeModal === 'score' && (
                            <>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Achievement Score</h3>
                                <div className="text-center py-6">
                                    <span className="text-6xl font-black text-orange-500">{currentAchievementScore}</span>
                                    <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">Level {level} • Beginner</p>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl mb-4">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Score Breakdown</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-600 dark:text-gray-300">Topics Created</span>
                                            <span className="font-bold text-gray-900 dark:text-white">{studyLog.length} <span className="text-green-500 text-xs">(+1/ea)</span></span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600 dark:text-gray-300">Repetitions</span>
                                            <span className="font-bold text-gray-900 dark:text-white">{studyLog.reduce((acc, t) => acc + (t.repetitions?.length || 0), 0)} <span className="text-green-500 text-xs">(+2/ea)</span></span>
                                        </div>
                                    </div>
                                </div>
                                {aiAnalysis ? (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-sm text-blue-800 dark:text-blue-200 border border-blue-100 dark:border-blue-800 leading-relaxed">
                                        <div className="flex items-center mb-2 font-bold"><Sparkles size={16} className="mr-2"/> AI Analysis</div>
                                        {aiAnalysis}
                                    </div>
                                ) : (
                                    <button 
                                        onClick={handleAnalyzeScore}
                                        disabled={analyzingScore}
                                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-bold shadow-md hover:opacity-90 transition flex items-center justify-center"
                                    >
                                        {analyzingScore ? <RotateCw size={20} className="animate-spin" /> : <><Sparkles size={18} className="mr-2" /> Analyze with AI</>}
                                    </button>
                                )}
                            </>
                        )}
                        
                        {activeModal === 'badges' && (
                            <>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Badge Collection</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    {badges.map((b, i) => (
                                        <div key={i} className={`flex flex-col items-center p-3 rounded-xl border ${b.unlocked ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-gray-50 dark:bg-gray-800 border-transparent opacity-50 grayscale'}`}>
                                            <div className="text-3xl mb-2">{b.icon}</div>
                                            <span className="text-xs font-bold text-center text-gray-800 dark:text-white leading-tight">{b.name}</span>
                                            <span className="text-[9px] text-center text-gray-500 dark:text-gray-400 mt-1">{b.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {activeModal === 'streak' && (
                            <>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Current Streak</h3>
                                <div className="text-center py-8">
                                    <Flame size={64} className="mx-auto text-orange-500 mb-4 animate-pulse" fill="currentColor" />
                                    <span className="text-5xl font-black text-gray-900 dark:text-white">{currentStreak}</span>
                                    <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">Days in a row</p>
                                    <p className="text-xs text-gray-400 mt-4 px-4">Study every day to keep your streak alive and unlock special badges!</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {showSwitchModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
                        <button onClick={() => setShowSwitchModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20}/></button>
                        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Switch Profile</h3>
                        <div className="space-y-2 mb-4">
                            {availableProfiles.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => { onSwitchProfile(p.id); setShowSwitchModal(false); }}
                                    className={`w-full flex items-center p-3 rounded-xl transition ${p.id === userId ? `bg-${themeColor}-50 border border-${themeColor}-200` : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden mr-3">
                                        {p.avatar ? <img src={p.avatar} className="w-full h-full object-cover"/> : <div className="w-full h-full bg-gray-300"/>}
                                    </div>
                                    <span className={`font-bold ${p.id === userId ? `text-${themeColor}-700` : 'text-gray-700 dark:text-gray-200'}`}>{p.name}</span>
                                    {p.id === userId && <Check size={16} className={`ml-auto text-${themeColor}-600`} />}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={onAddProfile}
                            className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-500 font-bold flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                        >
                            <UserPlus size={18} className="mr-2" /> Add New Profile
                        </button>
                    </div>
                </div>
            )}

            {showPasswordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
                        <button onClick={() => setShowPasswordModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20}/></button>
                        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Set New Password</h3>
                        
                        <div className="space-y-4 mb-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Password</label>
                                <input 
                                    type="password"
                                    value={newPwd}
                                    onChange={e => setNewPwd(e.target.value)}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    placeholder="At least 6 characters"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Confirm Password</label>
                                <input 
                                    type="password"
                                    value={confirmPwd}
                                    onChange={e => setConfirmPwd(e.target.value)}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    placeholder="Re-enter password"
                                />
                            </div>
                        </div>

                        {pwdMsg && (
                            <div className={`p-3 rounded-xl text-sm font-medium text-center mb-4 ${pwdMsg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {pwdMsg.text}
                            </div>
                        )}

                        <button 
                            onClick={handleUpdatePassword}
                            disabled={pwdBusy || !newPwd || !confirmPwd}
                            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {pwdBusy ? <RotateCw size={18} className="animate-spin" /> : 'Update Password'}
                        </button>
                    </div>
                </div>
            )}

            <div className="px-6 flex flex-col items-center -mt-8 pt-4">
                <div className="relative group cursor-pointer z-10">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg bg-blue-100 relative">
                        {userProfile.avatar ? (
                            <img src={userProfile.avatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <img 
                                src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${userId}&backgroundColor=b6e3f4`} 
                                alt="Profile" 
                                className="w-full h-full" 
                            />
                        )}
                        <div className="absolute inset-0 bg-black bg-opacity-30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <Camera className="text-white" size={24} />
                        </div>
                    </div>
                    <input 
                        type="file" 
                        accept="image/*" 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        onChange={handleAvatarChange} 
                    />
                </div>
                
                <div className="flex items-center mt-3 relative">
                    {isEditingName ? (
                        <div className="flex items-center space-x-2">
                            <input 
                                value={tempName} 
                                onChange={(e) => setTempName(e.target.value)}
                                className="border-b border-gray-300 focus:border-blue-500 outline-none text-xl font-bold text-gray-900 dark:text-white bg-transparent text-center w-48"
                                autoFocus
                            />
                            <button onClick={handleSaveName} className="p-1 bg-green-100 text-green-600 rounded-full"><Check size={16}/></button>
                            <button onClick={() => setIsEditingName(false)} className="p-1 bg-red-100 text-red-600 rounded-full"><X size={16}/></button>
                        </div>
                    ) : (
                        <div onClick={() => setIsEditingName(true)} className="flex items-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded-lg transition">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate max-w-[200px]">{userProfile.name}</h2>
                            <Edit2 size={14} className="text-gray-400 ml-2" />
                        </div>
                    )}
                </div>

                {currentStreak > 0 && (
                     <button 
                        onClick={() => setActiveModal('streak')}
                        className="mt-2 flex items-center space-x-1 px-3 py-1 bg-orange-100 dark:bg-orange-900/40 rounded-full hover:scale-105 transition active:scale-95 cursor-pointer border border-orange-200 dark:border-orange-800"
                     >
                        <Flame size={14} className="text-orange-500 animate-pulse" fill="currentColor" />
                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{currentStreak} Day Streak</span>
                     </button>
                )}
            </div>

            <div className="px-4 mt-6 space-y-4">
                <Card 
                    className="p-5 cursor-pointer hover:shadow-md transition active:scale-[0.99] border border-transparent hover:border-orange-200 dark:hover:border-orange-900"
                    onClick={() => setActiveModal('score')}
                >
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-gray-800 dark:text-white">My Achievement Score</h3>
                        <ChevronRight size={16} className="text-gray-400" />
                    </div>
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Achievement Score</p>
                            <p className="text-3xl font-bold text-gray-900 dark:text-white">{currentAchievementScore}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Level Lv.{level}</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-white">Beginner</p>
                        </div>
                    </div>
                    <div className="h-24 pointer-events-none">
                         <StatsChart data={achievementScoreData} labels={dateLabels} color="#f97316" />
                    </div>
                </Card>

                <Card 
                    className="p-4 cursor-pointer hover:shadow-md transition active:scale-[0.99] border border-transparent hover:border-orange-200 dark:hover:border-orange-900"
                    onClick={() => setActiveModal('badges')}
                >
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-800 dark:text-white">My Badges</h3>
                        <div className="flex items-center text-gray-400 text-sm">
                            {badges.filter(b => b.unlocked).length} <ChevronRight size={16} />
                        </div>
                    </div>
                    {badges.some(b => b.unlocked) ? (
                        <div className="grid grid-cols-5 gap-3 pb-2">
                            {badges.filter(b => b.unlocked).slice(0, 5).map((b, i) => (
                                <div key={i} className="flex flex-col items-center group relative">
                                    <div className={`flex-shrink-0 w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-700/50 flex flex-col items-center justify-center relative border border-gray-100 dark:border-gray-700 shadow-sm transition transform hover:scale-110`} title={`${b.name}: ${b.desc}`}>
                                        <span className="text-2xl">{b.icon}</span>
                                        <span className={`absolute -top-1 -right-1 text-[8px] font-bold text-white px-1.5 py-0.5 rounded-full shadow-sm border border-white dark:border-gray-800 ${
                                            b.lvl === 3 ? 'bg-amber-500' : b.lvl === 2 ? 'bg-gray-400' : 'bg-orange-700'
                                        }`}>
                                            {b.lvl}
                                        </span>
                                    </div>
                                    <span className="text-[9px] text-gray-500 dark:text-gray-400 mt-1 text-center w-full truncate px-0.5">
                                        {b.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                            <p className="text-gray-400 text-xs italic">Start studying to earn badges!</p>
                        </div>
                    )}
                </Card>

                <Card className="p-5 mb-10">
                     <div className="flex items-center mb-4">
                        <h3 className="font-bold text-gray-800 dark:text-white">Weekly Habit Status</h3>
                    </div>
                    
                    <div className="flex items-center bg-gray-50 dark:bg-gray-800 rounded-xl p-1 pr-2 mb-4 border border-gray-200 dark:border-gray-700 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900 focus-within:border-blue-300 transition-all">
                        <input 
                            value={newHabitName}
                            onChange={(e) => setNewHabitName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddHabit()}
                            placeholder="Add new habit..."
                            className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none text-gray-700 dark:text-gray-200"
                        />
                        <button 
                            onClick={handleAddHabit} 
                            disabled={!newHabitName.trim()}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${!newHabitName.trim() ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm'}`}
                        >
                            Add
                        </button>
                    </div>

                    {habits.length > 0 ? (
                        <div className="space-y-3 mb-6">
                            {habits.map((h, idx) => {
                                const isDoneToday = h.completedDates.includes(new Date().toISOString().split('T')[0]);
                                const colorToken = getHabitColor(idx);
                                const checkButtonClass = isDoneToday 
                                    ? `${colorToken.chipBg} ${colorToken.chipText} border-transparent shadow-sm` 
                                    : 'border-gray-300 dark:border-gray-600 bg-transparent text-gray-300';

                                return (
                                    <div key={h.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${colorToken.dotBg} shrink-0`} />
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{h.name}</span>
                                        </div>
                                        <button 
                                            onClick={() => toggleHabitForToday(h.id)}
                                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${checkButtonClass}`}
                                        >
                                            {isDoneToday && <Check size={12} strokeWidth={3} />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-6 text-gray-400 text-xs italic">
                            No habits tracking yet.
                        </div>
                    )}

                    <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mt-2">
                        <div className="flex justify-between items-center mb-3 px-1">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Activity Log</h4>
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">{activeDaysCount} Days Active (Last 30)</span>
                        </div>
                        <div 
                            ref={scrollRef}
                            className="flex space-x-1.5 overflow-x-auto pb-2 no-scrollbar px-1"
                        >
                            {activityDates.map((item, i) => {
                                const completedRingDots = item.dayHabits
                                    .map((h, idx) => ({ ...h, colorIndex: idx }))
                                    .filter(h => h.completed);
                                
                                const { r, maxDots } = ringConfig(32);
                                const dotsToRender = completedRingDots.slice(0, maxDots);
                                const isToday = item.isToday;
                                const containerClass = `flex flex-col items-center min-w-[32px] snap-center ${isToday ? `${theme.lightBg} rounded-lg pb-1` : ''}`;
                                const chipBg = isToday ? 'bg-white/60' : 'bg-gray-100 dark:bg-gray-800';
                                const dateColor = isToday ? theme.text : 'text-gray-400 dark:text-gray-500';

                                return (
                                    <div 
                                        key={i} 
                                        data-is-today={isToday.toString()}
                                        className={containerClass}
                                    >
                                        <div className={`relative w-8 h-8 mb-1 rounded-full flex items-center justify-center overflow-visible ${chipBg}`}>
                                            {/* Date Numeral */}
                                            <span className={`z-10 text-[10px] font-bold select-none ${dateColor}`}>
                                                {item.dayNum}
                                            </span>

                                            {/* Ring Dots */}
                                            {dotsToRender.length > 0 && (
                                                <div className="absolute inset-0 pointer-events-none">
                                                    {dotsToRender.map((h, dotIdx) => (
                                                        <div 
                                                            key={h.id}
                                                            className={ringDotClassesFor(h.colorIndex)}
                                                            // 32px width -> center at 16, 16
                                                            style={polarStyle(dotIdx, dotsToRender.length, r, { cx: 16, cy: 16 })}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Day Name */}
                                        <span className="text-[8px] text-gray-300 dark:text-gray-600 uppercase font-bold">
                                            {item.dayName.charAt(0)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Card>
            </div>
            
            {/* Fallback spacer to ensure content clears the fixed bottom tab bar */}
            <div style={{ height: 'calc(var(--tabbar-height, 64px) + env(safe-area-inset-bottom, 0px))' }} />
        </div>
    );
};
