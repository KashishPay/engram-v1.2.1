
import React from 'react';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { Card } from '../components/Card';
import { Topic } from '../types';
import { VirtualList } from '../components/VirtualList';

interface TopicListViewProps {
    title: string;
    topics: Topic[];
    navigateTo: (view: string, data?: unknown) => void;
    themeColor: string;
}

export const TopicListView: React.FC<TopicListViewProps> = ({ title, topics, navigateTo, themeColor }) => {
    
    const getTopicStatus = (topic: Topic) => {
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
                {topics.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 dark:text-gray-400 italic">
                        <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                        <p>No topics found in this list.</p>
                    </div>
                ) : (
                    <VirtualList<Topic>
                        items={topics}
                        itemHeight={ITEM_HEIGHT}
                        renderItem={(topic) => (
                            <button
                                onClick={() => navigateTo('topicDetail', topic)}
                                className={`w-full text-left p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-${themeColor}-50 dark:hover:bg-${themeColor}-900/30 transition flex justify-between items-center shadow-sm h-[70px] box-border`}
                            >
                                <div className="min-w-0 pr-2 flex-1">
                                    <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">{topic.topicName}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{topic.subject}</p>
                                </div>
                                <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                                    getTopicStatus(topic).includes('DUE NOW') ? 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200' : `bg-${themeColor}-100 dark:bg-${themeColor}-900 text-${themeColor}-800 dark:text-${themeColor}-200`
                                }`}>
                                    {getTopicStatus(topic)}
                                </span>
                            </button>
                        )}
                    />
                )}
            </Card>
        </div>
    );
};
