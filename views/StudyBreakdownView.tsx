
import React, { useMemo } from 'react';
import { ArrowLeft, Clock, ChevronDown } from 'lucide-react';
import { Card } from '../components/Card';
import { Topic } from '../types';
import { goBackOrFallback } from '../utils/navigation';
import { triggerHaptic } from '../utils/haptics';


interface StudyBreakdownViewProps {
    studyLog: Topic[];
    initialFilter: string;
    navigateTo: (view: string, data?: unknown) => void;
    themeColor: string;
}

export const StudyBreakdownView: React.FC<StudyBreakdownViewProps> = ({ studyLog, initialFilter, themeColor }) => {
    
    React.useEffect(() => {
        return () => {
        };
    }, []);

    const filteredTopics = useMemo(() => {
        if (initialFilter === 'all') return studyLog;
        return studyLog.filter(t => t.subjectId === initialFilter);
    }, [studyLog, initialFilter]);

    const weeks = useMemo(() => {
        let minDateStr = '';
        let maxDateStr = '';

        studyLog.forEach(t => {
            t.focusLogs?.forEach(log => {
                if (!minDateStr || log.date < minDateStr) minDateStr = log.date;
                if (!maxDateStr || log.date > maxDateStr) maxDateStr = log.date;
            });
        });

        if (!minDateStr) {
            minDateStr = new Date().toISOString().split('T')[0];
            maxDateStr = minDateStr;
        }

        const getMonday = (dStr: string) => {
            const date = new Date(dStr);
            const day = date.getDay() || 7; 
            date.setDate(date.getDate() - (day - 1));
            return date;
        };

        const startWeek = getMonday(minDateStr);
        const currentWeekStart = getMonday(new Date().toISOString().split('T')[0]);
        let endWeek = getMonday(maxDateStr);
        if (currentWeekStart > endWeek) {
            endWeek = currentWeekStart;
        }

        const options: { id: string; label: string; startISO: string; endISO: string }[] = [];
        let current = new Date(startWeek);
        let weekNum = 1;

        const formatDate = (d: Date) => {
            return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        };

        const getISO = (d: Date) => {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }

        options.push({
            id: 'all-time',
            label: 'All Time',
            startISO: '0000-00-00',
            endISO: '9999-12-31'
        });

        while (current <= endWeek) {
            const wStart = new Date(current);
            const wEnd = new Date(current);
            wEnd.setDate(wEnd.getDate() + 6);

            options.push({
                id: `week-${weekNum}`,
                label: `Week ${weekNum} (${formatDate(wStart)} - ${formatDate(wEnd)})`,
                startISO: getISO(wStart),
                endISO: getISO(wEnd)
            });

            current.setDate(current.getDate() + 7);
            weekNum++;
        }

        const reversedWeeks = options.slice(1).reverse();
        return [options[0], ...reversedWeeks];
    }, [studyLog]);

    const [selectedWeekId, setSelectedWeekId] = React.useState<string>('all-time');
    const handleWeekChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedWeekId(e.target.value);
        triggerHaptic.selection();
    };

    const selectedWeek = weeks.find(w => w.id === selectedWeekId) || weeks[0];

    const breakdown = useMemo(() => {
        const map: Record<string, { name: string; minutes: number; topics: { name: string; minutes: number }[] }> = {};
        
        filteredTopics.forEach(t => {
            const s = t.subject || 'Uncategorized';
            if (!map[s]) map[s] = { name: s, minutes: 0, topics: [] };
            
            let m = 0;
            if (selectedWeekId === 'all-time') {
                m = t.pomodoroTimeMinutes || 0;
            } else {
                m = (t.focusLogs || [])
                    .filter(log => log.date >= selectedWeek.startISO && log.date <= selectedWeek.endISO)
                    .reduce((sum, log) => sum + log.minutes, 0);
            }
            
            if (m > 0) {
                map[s].minutes += m;
                map[s].topics.push({ name: t.topicName, minutes: m });
            }
        });

        return Object.values(map)
            .filter(item => item.minutes > 0)
            .sort((a, b) => b.minutes - a.minutes);
    }, [filteredTopics, selectedWeekId, selectedWeek]);

    const totalMinutes = useMemo(() => {
        return breakdown.reduce((sum, s) => sum + s.minutes, 0);
    }, [breakdown]);

    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);

    return (
        <div className="px-1.5 space-y-6">
            <div className="px-2.5 flex items-center space-x-2 mb-4">
                <button onClick={() => goBackOrFallback('#/home')} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800`}>
                    <ArrowLeft size={24} />
                </button>
                <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>Study Breakdown</h2>
            </div>

            <div className="px-1.5 space-y-6">
                <div className="px-4 space-y-6">
                <Card className={`p-8 bg-white dark:bg-[#1a1b1e] border-0 ring-1 ring-gray-100 dark:ring-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] rounded-[24px] text-center mb-8 relative overflow-hidden`}>
                    {/* Soft decorative glow */}
                    <div className={`absolute -top-12 -right-12 w-32 h-32 bg-${themeColor}-400/10 dark:bg-${themeColor}-400/5 rounded-full blur-[40px] pointer-events-none`} />
                    <div className={`absolute -bottom-12 -left-12 w-32 h-32 bg-${themeColor}-400/10 dark:bg-${themeColor}-400/5 rounded-full blur-[40px] pointer-events-none`} />
                    
                    <div className="flex justify-end mb-4 relative z-10">
                        <div className="relative inline-flex items-center group">
                            <select
                                value={selectedWeekId}
                                onChange={handleWeekChange}
                                className={`appearance-none bg-white/40 dark:bg-black/20 backdrop-blur-md text-gray-700 dark:text-gray-300 font-bold tracking-tight text-[11px] py-2 pl-3 pr-8 rounded-full border border-gray-200/50 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-${themeColor}-500/50 cursor-pointer shadow-sm hover:bg-white/80 dark:hover:bg-black/40 transition-all duration-300`}
                            >
                                {weeks.map(w => (
                                    <option key={w.id} value={w.id} className="text-gray-900 bg-white">{w.label}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 pointer-events-none transition-colors" />
                        </div>
                    </div>
                    
                    <div className="relative z-10 pb-2">
                        <p className={`text-${themeColor}-600/80 dark:text-${themeColor}-400/70 text-[10px] font-black uppercase tracking-[0.2em] mb-2`}>Total Focus Time</p>
                        <div className={`text-5xl font-black text-gray-900 dark:text-white tracking-tight flex items-baseline justify-center space-x-1.5`}>
                            <span>{hours}</span>
                            <span className="text-xl font-bold text-gray-400 dark:text-gray-500 -ml-0.5 mr-2">h</span> 
                            <span>{mins}</span>
                            <span className="text-xl font-bold text-gray-400 dark:text-gray-500 -ml-0.5">m</span>
                        </div>
                    </div>
                </Card>

                <div className="space-y-4">
                    {breakdown.map((subject, idx) => (
                        <Card key={idx} className="bg-white dark:bg-[#1a1b1e] rounded-[20px] shadow-[0_2px_10px_rgb(0,0,0,0.02)] border-0 ring-1 ring-gray-100 dark:ring-white/5 overflow-hidden group">
                            <details className="group [&_summary::-webkit-details-marker]:hidden">
                                <summary className="flex items-center justify-between p-4 sm:p-5 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors select-none">
                                    <div className="flex items-center">
                                        <div className={`p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] text-${themeColor}-500 dark:text-${themeColor}-400 mr-3.5 group-hover:scale-105 transition-transform`}>
                                            <Clock size={18} strokeWidth={2.5} />
                                        </div>
                                        <span className="font-bold text-gray-900 dark:text-gray-100 text-[15px]">{subject.name}</span>
                                    </div>
                                    <div className="flex items-center">
                                        <span className="text-[13px] font-mono font-bold text-gray-500 dark:text-gray-400 mr-3.5 tracking-tight flex items-baseline">
                                            {Math.floor(subject.minutes / 60)}<span className="text-[10px] ml-0.5 text-gray-400">h</span> 
                                            <span className="ml-1">{Math.round(subject.minutes % 60)}</span><span className="text-[10px] ml-0.5 text-gray-400">m</span>
                                        </span>
                                        <ChevronDown size={18} strokeWidth={2.5} className="text-gray-300 dark:text-gray-600 group-open:rotate-180 transition-transform duration-300" />
                                    </div>
                                </summary>
                                <div className="px-5 pb-5 pt-0">
                                    <div className="pt-4 border-t border-gray-100 dark:border-white/5 space-y-3.5">
                                        {subject.topics.sort((a,b) => b.minutes - a.minutes).map((topic, tIdx) => (
                                            <div key={tIdx} className="flex justify-between items-center text-[13px]">
                                                <div className="flex items-center space-x-2.5 truncate pr-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full bg-${themeColor}-400/50 flex-shrink-0`}></div>
                                                    <span className="text-gray-600 dark:text-gray-400 font-semibold truncate">{topic.name}</span>
                                                </div>
                                                <span className="text-gray-500 dark:text-gray-500 font-mono font-semibold tracking-tight whitespace-nowrap">
                                                    {topic.minutes.toFixed(0)}<span className="text-[10px] text-gray-400 ml-0.5">m</span>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        </Card>
                    ))}
                
                {breakdown.length === 0 && (
                    <div className="text-center py-10 text-gray-400">
                        <p>No study time recorded yet.</p>
                    </div>
                )}
                </div>
            </div>
        </div>
    </div>
);
};
