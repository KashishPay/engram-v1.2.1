
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { BookOpenText, RotateCw, ChevronDown, Clock, Edit2, Check, X } from 'lucide-react';
import { Card } from '../components/Card';
import { Topic, Subject } from '../types';
import { INITIAL_SUBJECTS } from '../constants';
import { VirtualList } from '../components/VirtualList';
import { AdManager } from '../services/admob';

interface SubjectsViewProps {
    allSubjects: Subject[];
    studyLog: Topic[];
    navigateTo: (view: string, data?: unknown) => void;
    onAddSubject: (subject: Subject) => void;
    onDeleteSubject: (id: string) => void;
    onUpdateSubject: (subject: Subject) => void;
    onAddTopic: (topic: Omit<Topic, 'id'>) => void;
    themeColor: string;
}

type SubjectListItem = { type: 'topic'; data: Topic };

// Memoized Subject Item Component
const SubjectItem = React.memo(({ 
    subject, 
    subjectTopics, 
    collapsed, 
    onToggle, 
    onUpdateSubject,
    navigateTo, 
    themeColor,
    layoutVersion
}: { 
    subject: Subject, 
    subjectTopics: Topic[], 
    collapsed: boolean, 
    onToggle: (id: string) => void, 
    onUpdateSubject: (subject: Subject) => void,
    onDeleteSubject: (id: string) => void,
    navigateTo: (view: string, data?: unknown) => void, 
    themeColor: string,
    layoutVersion?: number
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(subject.name);

    const listItems = useMemo(() => {
        const result: SubjectListItem[] = [];
        subjectTopics.forEach((topic) => {
            result.push({ type: 'topic', data: topic });
        });
        return result;
    }, [subjectTopics]);

    useEffect(() => {
        setEditName(subject.name);
    }, [subject.name]);

    useEffect(() => {
        if (!collapsed) {
            AdManager.showReviewBanner();
        }
    }, [collapsed]);

    const formatTime = (minutes: number) => {
        if (!minutes) return '0m';
        if (minutes < 60) return `${Math.round(minutes)}m`;
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h}h ${m}m`;
    };

    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (editName.trim() && editName !== subject.name) {
            onUpdateSubject({ ...subject, name: editName.trim() });
        }
        setIsEditing(false);
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditName(subject.name);
        setIsEditing(false);
    };

    const startEditing = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
    };

    // Height calculation:
    // P-3 padding (12px top + 12px bottom) + Content height (~24px) + Border (1px) + Gap (8px in container but handled via height here)
    // Approx 60px per item
    const ITEM_HEIGHT = 60;

    return (
        <Card id={`subject-card-${subject.id}`} className="hover:shadow-md">
            <div 
                className="flex justify-between items-center cursor-pointer select-none min-h-[44px]"
                onClick={() => !isEditing && onToggle(subject.id)}
            >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className={`p-1.5 rounded-full bg-${themeColor}-50 dark:bg-${themeColor}-900/20 text-${themeColor}-500 transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-0'}`}>
                        <ChevronDown size={20} />
                    </div>
                    
                    {isEditing ? (
                        <div className="relative flex-1 mr-2" onClick={e => e.stopPropagation()}>
                            <input 
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                className={`w-full p-2 pr-20 border-2 border-${themeColor}-500 rounded-xl focus:outline-none font-bold text-xl text-gray-800 dark:text-white bg-white dark:bg-gray-800 shadow-sm transition-all`}
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleSave(e as unknown as React.MouseEvent);
                                    if (e.key === 'Escape') handleCancel(e as unknown as React.MouseEvent);
                                }}
                                onClick={e => e.stopPropagation()}
                            />
                            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                                <button 
                                    onClick={handleCancel} 
                                    onPointerDown={(e) => e.preventDefault()}
                                    className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300 rounded-full transition"
                                >
                                    <X size={18} />
                                </button>
                                <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5"></div>
                                <button 
                                    onClick={handleSave} 
                                    onPointerDown={(e) => e.preventDefault()}
                                    className="p-1.5 bg-green-500 text-white hover:bg-green-600 rounded-full transition shadow-sm"
                                >
                                    <Check size={16} strokeWidth={3} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 min-w-0">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2 truncate">
                                <span className="truncate">{subject.name}</span>
                                <span className="text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full shrink-0">
                                    {subjectTopics.length}
                                </span>
                            </h3>
                        </div>
                    )}
                </div>

                {!isEditing && (
                    <button 
                        onClick={startEditing}
                        className="p-2 ml-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition shrink-0"
                        title="Edit Subject Name"
                    >
                        <Edit2 size={16} />
                    </button>
                )}
            </div>
            
            {!collapsed && (
                <div className="mt-4 animate-in fade-in slide-in-from-top-1 duration-200 origin-top">
                    {subjectTopics.length > 0 ? (
                        <VirtualList<SubjectListItem>
                            items={listItems}
                            itemHeight={ITEM_HEIGHT}
                            layoutVersion={layoutVersion}
                            renderItem={(item) => {
                                const topic = item.data;
                                return (
                                    <button
                                        onClick={() => navigateTo('topicDetail', topic)}
                                        className={`w-full text-left p-3 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-${themeColor}-50 dark:hover:bg-${themeColor}-900/30 transition flex justify-between items-center bg-white dark:bg-gray-800/50 box-border h-[52px]`}
                                    >
                                        <div className="min-w-0 flex-1 pr-2">
                                            <span className="font-medium text-gray-700 dark:text-gray-200 truncate block">{topic.topicName}</span>
                                        </div>
                                        <div className="flex items-center space-x-2 shrink-0">
                                            {topic.pomodoroTimeMinutes > 0 && (
                                                <span className="flex items-center text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">
                                                    <Clock size={10} className="mr-1" />
                                                    {formatTime(topic.pomodoroTimeMinutes)}
                                                </span>
                                            )}
                                            <span className={`text-xs text-${themeColor}-500 dark:text-${themeColor}-400 font-semibold bg-${themeColor}-50 dark:bg-${themeColor}-900/20 px-2 py-1 rounded`}>
                                                Reps: {topic.repetitions?.length || 0}
                                            </span>
                                        </div>
                                    </button>
                                );
                            }}
                        />
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 italic text-sm pl-2">No topics added yet.</p>
                    )}
                </div>
            )}
        </Card>
    );
});

export const SubjectsView: React.FC<SubjectsViewProps> = React.memo(({ allSubjects, studyLog, navigateTo, onAddSubject, onDeleteSubject, onUpdateSubject, onAddTopic, themeColor }) => {
    const [newTopicName, setNewTopicName] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState(allSubjects?.[0]?.id || '');
    const [isAddingTopic, setIsAddingTopic] = useState(false);
    const [collapsedSubjects, setCollapsedSubjects] = useState<Record<string, boolean>>({});
    const [manualSubjectName, setManualSubjectName] = useState('');
    const [isAddTopicExpanded, setIsAddTopicExpanded] = useState(false);
    
    // Ref to manage focus
    const topicInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (allSubjects.length > 0 && !allSubjects.some(s => s.id === selectedSubjectId)) {
            setSelectedSubjectId(allSubjects[0].id);
        }
    }, [allSubjects, selectedSubjectId]);

    const topicsBySubject = useMemo(() => {
        const map: Record<string, Topic[]> = {};
        studyLog.forEach(topic => {
            if (!map[topic.subjectId]) {
                map[topic.subjectId] = [];
            }
            map[topic.subjectId].push(topic);
        });
        
        // Sort descending (Newest first)
        Object.values(map).forEach(list => {
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        });

        return map;
    }, [studyLog]);

    const getSubjectId = (name: string) => {
        const normalizedName = name.trim().toLowerCase();
        const initial = INITIAL_SUBJECTS.find(s => s.name.toLowerCase() === normalizedName);
        if (initial) return initial.id;
        return normalizedName.replace(/[^a-z0-9]/g, '_');
    };

    const handleAddTopic = () => {
        if (!newTopicName.trim() || !selectedSubjectId) return;

        // Dismiss keyboard
        topicInputRef.current?.blur();

        setIsAddingTopic(true);
        const subjectName = allSubjects.find(s => s.id === selectedSubjectId)?.name || 'Unknown Subject';

        const newTopicData: Omit<Topic, 'id'> = {
            subjectId: selectedSubjectId,
            subject: subjectName,
            topicName: newTopicName.trim(),
            shortNotes: '',
            pomodoroTimeMinutes: 0,
            repetitions: [],
            createdAt: new Date().toISOString(),
        };

        onAddTopic(newTopicData);
        setNewTopicName('');
        setIsAddingTopic(false);
    };

    const handleCreateManualSubject = () => {
        if (!manualSubjectName.trim()) return;
        const newId = getSubjectId(manualSubjectName);
        onAddSubject({ id: newId, name: manualSubjectName.trim() });
        setManualSubjectName('');
        
        // Auto select the new subject and expand the topic creator
        setSelectedSubjectId(newId);
        setIsAddTopicExpanded(true);
    };

    const toggleSubject = useCallback((subjectId: string) => {
        setCollapsedSubjects(prev => {
            const isCollapsed = prev[subjectId] !== undefined ? prev[subjectId] : true; // Default true (collapsed)
            
            // If we are expanding, scroll to it after a short delay to allow for animation
            if (isCollapsed) {
                setTimeout(() => {
                    const element = document.getElementById(`subject-card-${subjectId}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 100);
            }

            return {
                ...prev,
                [subjectId]: !isCollapsed
            };
        });
    }, []);

    // Layout version tracks structural changes to force virtualization updates
    const layoutVersion = studyLog.length;

    return (
        <div className="py-4 space-y-6">
            <h1 className={`px-4 text-3xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200 flex items-center`}>
                <BookOpenText size={28} className="mr-2" /> All Subjects
            </h1>

            <div className="px-4">
                <Card className="bg-white dark:bg-gray-800 border-l-4 border-gray-500">
                    <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Create Custom Subject</h3>
                    <div className="relative">
                        <input
                            type="text"
                            value={manualSubjectName}
                            onChange={(e) => setManualSubjectName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateManualSubject()}
                            placeholder="e.g. Mechatronics, Art History"
                            className="w-full p-3 pr-24 border border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white text-gray-900 dark:bg-gray-800 dark:text-white dark:border-gray-600 outline-none transition-all shadow-sm"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                            {manualSubjectName.trim() && (
                                <>
                                    <button
                                        onClick={() => setManualSubjectName('')}
                                        className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300 rounded-full transition"
                                        aria-label="Clear input"
                                        type="button"
                                    >
                                        <X size={18} />
                                    </button>
                                    <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 mx-1"></div>
                                    <button
                                        onClick={handleCreateManualSubject}
                                        className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 shadow-md transition transform active:scale-95 flex items-center justify-center"
                                        aria-label="Create subject"
                                        type="button"
                                    >
                                        <Check size={18} strokeWidth={3} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </Card>
            </div>
            
            <div className="px-4">
                <Card className={`bg-${themeColor}-50 dark:bg-${themeColor}-900/20 border-l-4 border-${themeColor}-500 transition-all`}>
                    <div 
                        className="flex justify-between items-center cursor-pointer"
                        onClick={() => setIsAddTopicExpanded(!isAddTopicExpanded)}
                    >
                        <h3 className={`text-xl font-semibold text-${themeColor}-700 dark:text-${themeColor}-300`}>Add New Topic</h3>
                        <div className={`p-1 rounded-full hover:bg-${themeColor}-100 dark:hover:bg-${themeColor}-800 transition-transform ${isAddTopicExpanded ? 'rotate-180' : ''}`}>
                            <ChevronDown size={20} className={`text-${themeColor}-700 dark:text-${themeColor}-300`} />
                        </div>
                    </div>
                    
                    {isAddTopicExpanded && (
                        <div className="flex flex-col space-y-3 mt-3 animate-in fade-in slide-in-from-top-1">
                            <select
                                value={selectedSubjectId}
                                onChange={(e) => setSelectedSubjectId(e.target.value)}
                                className={`p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-${themeColor}-500 shadow-sm`}
                            >
                                {allSubjects.length === 0 && <option value="">Create a subject first</option>}
                                {allSubjects.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            
                            <div className="relative">
                                <input
                                    ref={topicInputRef}
                                    type="text"
                                    value={newTopicName}
                                    onChange={(e) => setNewTopicName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                                    placeholder="e.g., Root Locus, Nodal Analysis"
                                    className={`w-full p-3 pr-24 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-${themeColor}-500 focus:border-${themeColor}-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none transition-all shadow-sm`}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                                    {newTopicName.trim() && (
                                        <>
                                            <button
                                                onClick={() => setNewTopicName('')}
                                                onPointerDown={(e) => e.preventDefault()}
                                                className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300 rounded-full transition"
                                                aria-label="Clear input"
                                                type="button"
                                            >
                                                <X size={18} />
                                            </button>
                                            <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 mx-1"></div>
                                            <button
                                                onClick={handleAddTopic}
                                                disabled={isAddingTopic || !selectedSubjectId}
                                                className={`p-2 ${isAddingTopic ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'} text-white rounded-full shadow-md transition transform active:scale-95 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
                                                aria-label="Add Topic"
                                                type="button"
                                            >
                                                {isAddingTopic ? <RotateCw size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            <div className="space-y-6">
                {allSubjects.map(subject => (
                    <SubjectItem
                        key={subject.id}
                        subject={subject}
                        subjectTopics={topicsBySubject[subject.id] || []}
                        collapsed={collapsedSubjects[subject.id] !== undefined ? collapsedSubjects[subject.id] : true} // Default true
                        onToggle={toggleSubject}
                        onUpdateSubject={onUpdateSubject}
                        onDeleteSubject={onDeleteSubject}
                        navigateTo={navigateTo}
                        themeColor={themeColor}
                        layoutVersion={layoutVersion}
                    />
                ))}
            </div>
        </div>
    );
});
