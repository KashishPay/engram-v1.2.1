
import React, { useMemo } from 'react';
import { ArrowLeft, CheckCircle, Check, XCircle } from 'lucide-react';
import { Card } from '../components/Card';
import { Topic } from '../types';
import { VirtualList } from '../components/VirtualList';
import { AdManager } from '../services/admob';

interface TopicListViewProps {
    title: string;
    topics: Topic[];
    navigateTo: (view: string, data?: unknown) => void;
    themeColor: string;
}

type ListItem = { type: 'topic'; data: Topic };

export const TopicListView: React.FC<TopicListViewProps> = ({ title, topics, navigateTo, themeColor }) => {
    
    React.useEffect(() => {
        const adEligibleTitles = ['Due for Review', 'Recent Quizzes', 'Active Topics'];
        if (adEligibleTitles.includes(title)) {
            AdManager.showReviewBanner();
        }
        return () => {
            if (adEligibleTitles.includes(title)) {
                AdManager.hideBanner();
            }
        };
    }, [title]);

    const listItems = useMemo(() => {
        return topics.map(t => ({ type: 'topic' as const, data: t }));
    }, [topics]);

    const getTopicStatus = (topic: Topic) => {
        if (topic.isJourneyPaused) {
            return 'Journey Paused';
        }

        const repetitionCount = topic.repetitions?.length || 0;
        const lastRepetition = topic.repetitions?.[repetitionCount - 1];

        if (repetitionCount === 0) {
            return 'New Topic';
        }

        const nextReviewDate = new Date(lastRepetition.nextReviewDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (nextReviewDate <= today) {
            return 'DUE NOW';
        }

        const timeDiff = nextReviewDate.getTime() - today.getTime();
        const diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

        return `Due in ${diffDays} days (Rep ${repetitionCount + 1})`;
    };

    const ITEM_HEIGHT = 82; // Height + Gap included in logic

    return (
        <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2 px-4">
                <button 
                    onClick={() => navigateTo('home')}
                    className={`p-2 text-${themeColor}-500 hover:text-${themeColor}-700 dark:text-${themeColor}-400 dark:hover:text-${themeColor}-300 rounded-full`}
                >
                    <ArrowLeft size={24} />
                </button>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{title}</h1>
            </div>

            <Card className="p-4">
                {listItems.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 dark:text-gray-400 italic">
                        <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                        <p>No topics found in this list.</p>
                    </div>
                ) : (
                    <VirtualList<ListItem>
                        items={listItems}
                        itemHeight={ITEM_HEIGHT}
                        renderItem={(item) => {
                            const topic = item.data;
                            const isRecentQuizzes = title === 'Recent Quizzes';
                            
                            return (
                                <button
                                    onClick={() => navigateTo('topicDetail', topic)}
                                    className={`w-full text-left p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-${themeColor}-50 dark:hover:bg-${themeColor}-900/30 transition flex justify-between items-center shadow-sm h-[70px] box-border`}
                                >
                                    <div className="min-w-0 pr-2 flex-1">
                                        <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">{topic.topicName}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{topic.subject}</p>
                                    </div>
                                    {isRecentQuizzes ? (
                                        <div className="flex items-center space-x-2 shrink-0">
                                            <div className="flex justify-between items-center relative px-1 w-24">
                                                {/* Connecting Line */}
                                                <div className="absolute left-1 right-1 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200 dark:bg-gray-700 rounded-full z-0"></div>
                                                
                                                {/* Nodes */}
                                                {Array.from({ length: 5 }).map((_, i) => {
                                                    const rep = topic.repetitions?.[i];
                                                    const isCompleted = !!rep;
                                                    const isNext = i === (topic.repetitions?.length || 0);
                                                    
                                                    let nodeColor = "bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600";
                                                    let icon = null;
                                                    
                                                    let percentageScore = 0;
                                                    
                                                    if (isCompleted) {
                                                        const totalQs = rep.totalQuestions || 10;
                                                        percentageScore = rep.score > totalQs ? rep.score : (rep.score / totalQs) * 100;
                                                        if (percentageScore > 100) percentageScore = 100;
                                                        
                                                        if (percentageScore >= 80) {
                                                            nodeColor = "bg-green-500 border-green-600 text-white shadow-sm";
                                                            icon = <Check size={8} strokeWidth={3} />;
                                                        } else if (percentageScore >= 50) {
                                                            nodeColor = "bg-yellow-500 border-yellow-600 text-white shadow-sm";
                                                            icon = <Check size={8} strokeWidth={3} />;
                                                        } else {
                                                            nodeColor = "bg-red-500 border-red-600 text-white shadow-sm";
                                                            icon = <XCircle size={8} strokeWidth={3} />;
                                                        }
                                                    } else if (isNext) {
                                                        nodeColor = `bg-white dark:bg-gray-800 border border-${themeColor}-500 shadow-[0_0_4px_rgba(0,0,0,0.1)]`;
                                                    }

                                                    return (
                                                        <div 
                                                            key={i} 
                                                            className={`relative z-10 w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all duration-200 ${nodeColor}`}
                                                            title={isCompleted ? `Review Repetition ${i + 1} (Score: ${Math.round(percentageScore)}%)` : isNext ? "Next Review" : "Upcoming"}
                                                        >
                                                            {icon}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <span className={`text-xs font-bold ${(() => {
                                                const lastRep = topic.repetitions?.[topic.repetitions.length - 1];
                                                if (!lastRep) return 'text-gray-500';
                                                const totalQs = lastRep.quizAttempt?.questions?.length || lastRep.totalQuestions || 10;
                                                let percentage = lastRep.score > totalQs ? lastRep.score : (lastRep.score / totalQs) * 100;
                                                if (percentage > 100) percentage = 100;
                                                return percentage >= 70 ? 'text-green-600' : 'text-orange-600';
                                            })()}`}>
                                                {(() => {
                                                    const lastRep = topic.repetitions?.[topic.repetitions.length - 1];
                                                    if (!lastRep) return '';
                                                    const totalQs = lastRep.quizAttempt?.questions?.length || lastRep.totalQuestions || 10;
                                                    return lastRep.score > totalQs ? `${lastRep.score}%` : `${lastRep.score}/${totalQs}`;
                                                })()}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                                            getTopicStatus(topic) === 'Journey Paused' ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400' :
                                            getTopicStatus(topic).includes('DUE NOW') ? 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200' : `bg-${themeColor}-100 dark:bg-${themeColor}-900 text-${themeColor}-800 dark:text-${themeColor}-200`
                                        }`}>
                                            {getTopicStatus(topic)}
                                        </span>
                                    )}
                                </button>
                            );
                        }}
                    />
                )}
            </Card>
        </div>
    );
};
