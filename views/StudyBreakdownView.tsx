
import React, { useMemo } from 'react';
import { ArrowLeft, Clock, ChevronDown } from 'lucide-react';
import { Card } from '../components/Card';
import { Topic } from '../types';
import { goBackOrFallback } from '../utils/navigation';

interface StudyBreakdownViewProps {
    studyLog: Topic[];
    initialFilter: string;
    navigateTo: (view: string, data?: unknown) => void;
    themeColor: string;
}

export const StudyBreakdownView: React.FC<StudyBreakdownViewProps> = ({ studyLog, initialFilter, themeColor }) => {
    
    const filteredTopics = useMemo(() => {
        if (initialFilter === 'all') return studyLog;
        return studyLog.filter(t => t.subjectId === initialFilter);
    }, [studyLog, initialFilter]);

    const totalMinutes = filteredTopics.reduce((sum, t) => sum + (t.pomodoroTimeMinutes || 0), 0);
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);

    const breakdown = useMemo(() => {
        const map: Record<string, { name: string; minutes: number; topics: { name: string; minutes: number }[] }> = {};
        
        filteredTopics.forEach(t => {
            const s = t.subject || 'Uncategorized';
            if (!map[s]) map[s] = { name: s, minutes: 0, topics: [] };
            
            const m = t.pomodoroTimeMinutes || 0;
            if (m > 0) {
                map[s].minutes += m;
                map[s].topics.push({ name: t.topicName, minutes: m });
            }
        });

        return Object.values(map)
            .filter(item => item.minutes > 0)
            .sort((a, b) => b.minutes - a.minutes);
    }, [filteredTopics]);

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
                <Card className={`p-6 bg-white dark:bg-gray-800 text-center mb-6 border-l-4 border-${themeColor}-500`}>
                <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Total Time Logged</p>
                <div className={`text-4xl font-extrabold text-${themeColor}-600 dark:text-${themeColor}-400`}>
                    {hours}<span className="text-xl text-gray-400">h</span> {mins}<span className="text-xl text-gray-400">m</span>
                </div>
            </Card>

                <div className="space-y-3">
                    {breakdown.map((subject, idx) => (
                    <details key={idx} className="group bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition select-none list-none">
                            <div className="flex items-center">
                                <div className={`p-2 rounded-lg bg-${themeColor}-50 dark:bg-${themeColor}-900/20 text-${themeColor}-600 mr-3`}>
                                    <Clock size={18} />
                                </div>
                                <span className="font-bold text-gray-800 dark:text-white text-sm">{subject.name}</span>
                            </div>
                            <div className="flex items-center">
                                <span className="text-sm font-mono font-bold text-gray-600 dark:text-gray-300 mr-3">
                                    {Math.floor(subject.minutes / 60)}h {Math.round(subject.minutes % 60)}m
                                </span>
                                <ChevronDown size={16} className="text-gray-400 group-open:rotate-180 transition-transform" />
                            </div>
                        </summary>
                        <div className="px-4 pb-4 pt-0 border-t border-gray-50 dark:border-gray-700/50">
                            <div className="mt-3 space-y-2">
                                {subject.topics.sort((a,b) => b.minutes - a.minutes).map((topic, tIdx) => (
                                    <div key={tIdx} className="flex justify-between items-center text-xs">
                                        <span className="text-gray-600 dark:text-gray-400 truncate pr-2">{topic.name}</span>
                                        <span className="text-gray-500 font-mono whitespace-nowrap">
                                            {topic.minutes.toFixed(0)}m
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </details>
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
