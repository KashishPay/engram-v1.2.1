import React, { useState, useMemo, useRef } from 'react';
import { Search, Check, X, Filter, Layers, BookOpenText } from 'lucide-react';
import { Topic, Subject } from '../types';
import { VirtualList } from './VirtualList';

interface TopicSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selectedTopicIds: string[]) => void;
    topics: Topic[];
    subjects: Subject[];
    initialSelection?: string[];
    themeColor: string;
}

export const TopicSelectorModal: React.FC<TopicSelectorModalProps> = ({
    isOpen, onClose, onConfirm, topics, subjects, initialSelection = [], themeColor
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelection));
    const [searchQuery, setSearchQuery] = useState('');
    const [filterSubject, setFilterSubject] = useState<string>('all');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Filter Logic
    const filteredTopics = useMemo(() => {
        let result = topics;
        
        // 1. Subject Filter
        if (filterSubject !== 'all') {
            result = result.filter(t => t.subjectId === filterSubject);
        }

        // 2. Search Query
        if (searchQuery.trim()) {
            const lowerQ = searchQuery.toLowerCase();
            result = result.filter(t => 
                t.topicName.toLowerCase().includes(lowerQ) || 
                t.subject.toLowerCase().includes(lowerQ)
            );
        }
        
        return result;
    }, [topics, filterSubject, searchQuery]);

    const isAllSelected = filteredTopics.length > 0 && filteredTopics.every(t => selectedIds.has(t.id));

    // Handlers
    const toggleTopic = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleAllVisible = () => {
        const next = new Set(selectedIds);
        if (isAllSelected) {
            // Deselect all visible
            filteredTopics.forEach(t => next.delete(t.id));
        } else {
            // Select all visible
            filteredTopics.forEach(t => next.add(t.id));
        }
        setSelectedIds(next);
    };

    const handleConfirm = () => {
        onConfirm(Array.from(selectedIds));
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4 animate-in fade-in duration-200">
            <div 
                className="bg-white dark:bg-gray-900 w-full md:max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh] md:max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom-10 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                            <Layers className={`mr-2 text-${themeColor}-600`} size={20} />
                            Select Topics
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {selectedIds.size} selected for review
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                        <X size={20} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* Filters */}
                <div className="p-4 space-y-3 shrink-0 bg-gray-50 dark:bg-gray-900/50">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search topics..."
                            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 dark:text-gray-100"
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <button
                            onClick={() => setFilterSubject('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition border ${filterSubject === 'all' ? `bg-${themeColor}-100 border-${themeColor}-200 text-${themeColor}-700 dark:bg-${themeColor}-900/30 dark:border-${themeColor}-800 dark:text-${themeColor}-300` : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}
                        >
                            All Subjects
                        </button>
                        {subjects.map(sub => (
                            <button
                                key={sub.id}
                                onClick={() => setFilterSubject(sub.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition border ${filterSubject === sub.id ? `bg-${themeColor}-100 border-${themeColor}-200 text-${themeColor}-700 dark:bg-${themeColor}-900/30 dark:border-${themeColor}-800 dark:text-${themeColor}-300` : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}
                            >
                                {sub.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex justify-between items-center px-1">
                        <button 
                            onClick={toggleAllVisible}
                            className={`text-xs font-bold flex items-center ${isAllSelected ? `text-${themeColor}-600` : 'text-gray-500'}`}
                        >
                            {isAllSelected ? 'Deselect All' : 'Select All Visible'}
                        </button>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                            {filteredTopics.length} Results
                        </span>
                    </div>
                </div>

                {/* List Content */}
                <div 
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto min-h-0 bg-white dark:bg-gray-900 relative"
                >
                    {filteredTopics.length > 0 ? (
                        <VirtualList
                            items={filteredTopics}
                            itemHeight={64} // 48px content + 16px padding/gap approx
                            scrollContainerRef={scrollContainerRef}
                            renderItem={(topic: Topic) => {
                                const isSelected = selectedIds.has(topic.id);
                                return (
                                    <div 
                                        onClick={() => toggleTopic(topic.id)}
                                        className={`mx-4 my-1 p-3 rounded-xl border flex items-center cursor-pointer transition active:scale-[0.99] select-none h-[56px] ${
                                            isSelected 
                                                ? `border-${themeColor}-200 bg-${themeColor}-50 dark:border-${themeColor}-800 dark:bg-${themeColor}-900/20` 
                                                : 'border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-800/50 hover:border-gray-200 dark:hover:border-gray-700'
                                        }`}
                                    >
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 transition ${
                                            isSelected 
                                                ? `border-${themeColor}-500 bg-${themeColor}-500 text-white` 
                                                : 'border-gray-300 dark:border-gray-600'
                                        }`}>
                                            {isSelected && <Check size={12} strokeWidth={3} />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-sm font-bold truncate ${isSelected ? `text-${themeColor}-900 dark:text-${themeColor}-100` : 'text-gray-700 dark:text-gray-200'}`}>
                                                {topic.topicName}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center">
                                                <BookOpenText size={10} className="mr-1 opacity-70"/> {topic.subject}
                                            </p>
                                        </div>
                                    </div>
                                );
                            }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <Filter size={32} className="mb-2 opacity-20" />
                            <p className="text-sm">No topics match filters</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 safe-area-bottom">
                    <button 
                        onClick={handleConfirm}
                        disabled={selectedIds.size === 0}
                        className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition transform active:scale-[0.98] flex items-center justify-center ${
                            selectedIds.size > 0 
                                ? `bg-${themeColor}-600 hover:bg-${themeColor}-700` 
                                : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                        }`}
                    >
                        Generate Deck ({selectedIds.size})
                    </button>
                </div>
            </div>
        </div>
    );
};