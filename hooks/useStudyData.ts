
import { useState, useEffect, useCallback } from 'react';
import { Topic, Subject } from '../types';
import { saveAudioToIDB, saveTopicBodyToIDB, getAllAudioKeys, getAllTopicBodyKeys } from '../services/storage';

export const useStudyData = (userId: string) => {
    const [studyLog, setStudyLog] = useState<Topic[]>([]);
    const [userSubjects, setUserSubjects] = useState<Subject[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

    // Initial Load & Migration Logic
    useEffect(() => {
        setLoadingData(true);
        setStudyLog([]);
        setUserSubjects([]);
        setLoadedUserId(null);
        performance.mark('boot_start');

        // Async hydration wrapped in a timeout to yield to main thread immediately
        const timerId = setTimeout(async () => {
            try {
                // Scoped Keys
                const dataKey = `engramData_${userId}`;
                const subjectsKey = `engramSubjects_${userId}`;
                const migrationKey = `engram_migration_v2_complete_${userId}`;

                const storedData = localStorage.getItem(dataKey);
                const storedSubjects = localStorage.getItem(subjectsKey);
                const isMigrated = localStorage.getItem(migrationKey) === 'true';

                let finalSubjects: Subject[] = [];
                let finalTopics: Topic[] = [];

                if (storedSubjects) {
                    const parsedSubjects = JSON.parse(storedSubjects);
                    finalSubjects = Array.isArray(parsedSubjects) ? parsedSubjects : [];
                }

                if (storedData) {
                    let parsedData = JSON.parse(storedData);
                    if (!Array.isArray(parsedData)) parsedData = [];

                    // --- MIGRATION: V1 (Fat JSON) -> V2 (Index + IDB) ---
                    if (!isMigrated && parsedData.length > 0) {
                        console.log("%c [Migration] Starting V2 Storage Migration...", 'color: orange');
                        localStorage.setItem(`${dataKey}_backup_v1`, storedData);
                        const migrationPromises = parsedData.map(async (topic: Topic) => {
                            if (topic.shortNotes && topic.shortNotes.length > 0) {
                                await saveTopicBodyToIDB(userId, topic.id, topic.shortNotes);
                            }
                            return { ...topic, shortNotes: "" };
                        });
                        const cleanData = await Promise.all(migrationPromises);
                        parsedData = cleanData;
                        localStorage.setItem(dataKey, JSON.stringify(cleanData));
                        localStorage.setItem(migrationKey, 'true');
                        console.log("%c [Migration] V2 Migration Complete.", 'color: green');
                    }

                    // --- RECONCILE STATE (Audio & Notes) ---
                    try {
                        const [audioKeys, noteKeys] = await Promise.all([
                            getAllAudioKeys(),
                            getAllTopicBodyKeys(userId)
                        ]);
                        const audioSet = new Set(audioKeys);
                        const noteSet = new Set(noteKeys);
                        
                        parsedData = parsedData.map((t: Topic) => ({
                            ...t,
                            hasSavedAudio: audioSet.has(t.id) || t.hasSavedAudio,
                            hasNotes: noteSet.has(t.id) || (t.shortNotes && t.shortNotes.length > 50)
                        }));
                    } catch (e) {
                        console.warn("[Boot] State reconciliation failed", e);
                    }

                    finalTopics = parsedData.map((t: Topic) => ({
                        ...t,
                        id: t.id || `topic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        repetitions: Array.isArray(t.repetitions) ? t.repetitions : [],
                        focusLogs: Array.isArray(t.focusLogs) ? t.focusLogs : [],
                        pomodoroTimeMinutes: typeof t.pomodoroTimeMinutes === 'number' ? t.pomodoroTimeMinutes : 0,
                        topicName: t.topicName || 'Untitled Topic',
                        subject: t.subject || 'Uncategorized',
                        shortNotes: t.shortNotes || '',
                        createdAt: t.createdAt || new Date().toISOString()
                    }));
                }

                // --- PROACTIVE MERGE: Combine duplicate subject names on boot ---
                if (finalSubjects.length > 0) {
                    const nameMap = new Map<string, Subject>(); // Lowercase Name -> Master Subject
                    const idMapping = new Map<string, string>(); // Duplicate ID -> Master ID
                    const idToName = new Map<string, string>();   // Master ID -> Master Name
                    
                    const uniqueSubjects: Subject[] = [];

                    finalSubjects.forEach(sub => {
                        const normName = sub.name.trim().toLowerCase();
                        if (nameMap.has(normName)) {
                            const master = nameMap.get(normName)!;
                            idMapping.set(sub.id, master.id);
                        } else {
                            nameMap.set(normName, sub);
                            uniqueSubjects.push(sub);
                            idToName.set(sub.id, sub.name);
                        }
                    });

                    if (idMapping.size > 0) {
                        console.log(`%c [Boot] Merging ${idMapping.size} duplicate subjects...`, 'color: blue');
                        finalSubjects = uniqueSubjects;
                        finalTopics = finalTopics.map(topic => {
                            if (idMapping.has(topic.subjectId)) {
                                const masterId = idMapping.get(topic.subjectId)!;
                                return { ...topic, subjectId: masterId, subject: idToName.get(masterId) || topic.subject };
                            }
                            return topic;
                        });
                    }
                }

                setStudyLog(finalTopics);
                setUserSubjects(finalSubjects);
            } catch (e) {
                console.error("Failed to load local data", e);
                setStudyLog([]); 
                setUserSubjects([]);
            } finally {
                setLoadingData(false);
                setLoadedUserId(userId);
                performance.mark('boot_end');
            }
        }, 0);

        return () => clearTimeout(timerId);
    }, [userId]);

    // Save Logic (Effects) with scoped keys
    useEffect(() => {
        if (!loadingData && userId && loadedUserId === userId) {
            // Strip heavy audio AND body text before saving to localStorage index
            const indexLog = studyLog.map(topic => {
                const rest = { ...topic };
                delete rest.podcastAudio;
                delete rest.shortNotes;
                // We keep shortNotes field but empty to satisfy type, 
                // actual content is in IDB (handled by handleUpdateTopic or TopicDetailView)
                return { ...rest, shortNotes: "" };
            });
            try {
                localStorage.setItem(`engramData_${userId}`, JSON.stringify(indexLog));
            } catch (e) {
                console.error("Failed to save to localStorage", e);
            }
        }
    }, [studyLog, loadingData, userId, loadedUserId]);

    useEffect(() => {
        if (!loadingData && userId && loadedUserId === userId) {
            localStorage.setItem(`engramSubjects_${userId}`, JSON.stringify(userSubjects));
        }
    }, [userSubjects, loadingData, userId, loadedUserId]);

    // Handlers
    const handleUpdateTopic = useCallback(async (updatedTopic: Topic) => {
        const topicToState = { ...updatedTopic, updatedAt: new Date().toISOString() };

        // 1. Offload Audio
        if (updatedTopic.podcastAudio) {
            try {
                await saveAudioToIDB(updatedTopic.id, updatedTopic.podcastAudio);
                topicToState.podcastAudio = undefined;
                topicToState.hasSavedAudio = true;
            } catch (err) {
                console.error("Failed to save audio to IDB", err);
            }
        }

        // 2. Offload Body Text (Async Save with userId)
        // We do this optimistically. The state updates immediately with the content 
        // so UI is snappy, but the Effect above will strip it before saving to localStorage.
        if (updatedTopic.shortNotes && updatedTopic.shortNotes.length > 0) {
            topicToState.hasNotes = true;
            saveTopicBodyToIDB(userId, updatedTopic.id, updatedTopic.shortNotes).catch(err => {
                console.error("Failed to save body to IDB", err);
            });
        }

        setStudyLog(prevLog => prevLog.map(t => (t.id === updatedTopic.id ? topicToState : t)));
        return topicToState; 
    }, [userId]);

    const handleAddTopic = useCallback((newTopicData: Omit<Topic, 'id'>) => {
        const newTopic: Topic = {
            ...newTopicData,
            id: 'topic-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            repetitions: [],
            focusLogs: [],
            pomodoroTimeMinutes: 0,
            hasNotes: !!(newTopicData.shortNotes && newTopicData.shortNotes.length > 0),
            updatedAt: new Date().toISOString()
        };
        // Save initial empty body if needed, mostly for consistency
        saveTopicBodyToIDB(userId, newTopic.id, newTopic.shortNotes || "");
        
        setStudyLog(prev => [...prev, newTopic]);
        return newTopic;
    }, [userId]);

    const handleDeleteTopic = useCallback(async (topicId: string) => {
        // Delete from IDB
        try {
            await deleteTopicBodyFromIDB(userId, topicId);
            await deleteAudioFromIDB(topicId);
        } catch (e) {
            console.error("Failed to delete topic data from IDB", e);
        }
        
        // Remove from state
        setStudyLog(prev => prev.filter(t => t.id !== topicId));
    }, [userId]);

    const handleAddSubject = useCallback((newSubject: Subject) => {
        setUserSubjects(prev => {
            // Proactive Merge: If name exists, don't add duplicate
            const exists = prev.find(s => s.name.trim().toLowerCase() === newSubject.name.trim().toLowerCase());
            if (exists) return prev;
            
            if (prev.some(s => s.id === newSubject.id)) return prev;
            return [...prev, { ...newSubject, updatedAt: new Date().toISOString() }];
        });
    }, []);

    const handleUpdateSubject = useCallback((updatedSubject: Subject) => {
        const newName = updatedSubject.name.trim();
        
        setUserSubjects(prevSubjects => {
            // Check if another subject already has this name (Case-insensitive)
            const mergeTarget = prevSubjects.find(s => 
                s.id !== updatedSubject.id && 
                s.name.trim().toLowerCase() === newName.toLowerCase()
            );

            if (mergeTarget) {
                // OPTION 2: Smart Merge
                // Move all topics to the existing subject and update their names
                setStudyLog(prevLog => prevLog.map(topic => {
                    if (topic.subjectId === updatedSubject.id) {
                        return { 
                            ...topic, 
                            subjectId: mergeTarget.id, 
                            subject: mergeTarget.name 
                        };
                    }
                    return topic;
                }));
                // Remove the renamed subject as it's now merged into the target
                return prevSubjects.filter(s => s.id !== updatedSubject.id);
            } else {
                // OPTION 1: Cascade Update
                // Update the subject name in the subjects list
                const nextSubjects = prevSubjects.map(s => 
                    s.id === updatedSubject.id ? { ...s, name: newName, updatedAt: new Date().toISOString() } : s
                );
                
                // Update the subject name string inside every associated topic
                setStudyLog(prevLog => prevLog.map(topic => {
                    if (topic.subjectId === updatedSubject.id) {
                        return { ...topic, subject: newName, updatedAt: new Date().toISOString() };
                    }
                    return topic;
                }));
                
                return nextSubjects;
            }
        });
    }, []);

    const handleDeleteSubject = useCallback((id: string) => {
        setUserSubjects(prev => prev.filter(s => s.id !== id));
    }, []);

    // OPTION 2: Name-Based Subject Merge
    const importStudyLog = useCallback(async (importedTopics: Topic[], importedSubjects?: Subject[]) => {
        // 1. Restore Notes to IDB (Awaited for safety)
        const idbWrites = importedTopics
            .filter(t => t.shortNotes && t.shortNotes.length > 0)
            .map(t => saveTopicBodyToIDB(userId, t.id, t.shortNotes));
        
        await Promise.all(idbWrites);

        // 2. Reconstruct Imported Subjects List if missing from backup
        let finalImportedSubjects: Subject[] = [];
        if (importedSubjects && Array.isArray(importedSubjects) && importedSubjects.length > 0) {
            finalImportedSubjects = importedSubjects;
        } else {
            const subjectMap = new Map<string, Subject>();
            importedTopics.forEach(t => {
                if (t.subjectId) {
                    if (!subjectMap.has(t.subjectId)) {
                        subjectMap.set(t.subjectId, {
                            id: t.subjectId,
                            name: t.subject || "Restored Subject"
                        });
                    }
                }
            });
            finalImportedSubjects = Array.from(subjectMap.values());
        }

        // 3. Merge Logic
        // We use functional updates to ensure we are merging into the current state
        setUserSubjects(currentSubjects => {
            const subjectIdMap = new Map<string, string>(); // Map: ImportedID -> LocalID
            const nextSubjects = [...currentSubjects];

            finalImportedSubjects.forEach(impSub => {
                // Find if a local subject has the same name (case-insensitive)
                const existing = currentSubjects.find(s => 
                    s.name.trim().toLowerCase() === impSub.name.trim().toLowerCase()
                );

                if (existing) {
                    // Match found: Map imported subject ID to existing local ID
                    subjectIdMap.set(impSub.id, existing.id);
                } else {
                    // No match by name. Check for ID collision.
                    const idCollision = currentSubjects.some(s => s.id === impSub.id);
                    
                    if (idCollision) {
                        // ID exists but name is different. Generate new ID for imported subject.
                        const newId = `${impSub.id}_${Date.now()}`;
                        subjectIdMap.set(impSub.id, newId);
                        nextSubjects.push({ ...impSub, id: newId });
                    } else {
                        // Totally new subject. Keep ID.
                        subjectIdMap.set(impSub.id, impSub.id);
                        nextSubjects.push(impSub);
                    }
                }
            });

            // 4. Update Topics with Remapped IDs
            setStudyLog(currentTopics => {
                const nextTopics = [...currentTopics];
                const existingTopicIds = new Set(currentTopics.map(t => t.id));

                importedTopics.forEach(topic => {
                    const originalSubId = topic.subjectId;
                    const mappedSubId = subjectIdMap.get(originalSubId) || originalSubId;
                    
                    // Resolve correct subject name based on the mapping
                    const targetSubject = nextSubjects.find(s => s.id === mappedSubId);
                    const mappedSubjectName = targetSubject ? targetSubject.name : topic.subject;

                    const updatedTopic = {
                        ...topic,
                        subjectId: mappedSubId,
                        subject: mappedSubjectName
                    };

                    if (existingTopicIds.has(updatedTopic.id)) {
                        // Conflict: Topic ID exists. Use Last Write Wins based on updatedAt
                        const idx = nextTopics.findIndex(t => t.id === updatedTopic.id);
                        if (idx !== -1) {
                            const existingTopic = nextTopics[idx];
                            const existingTime = new Date(existingTopic.updatedAt || existingTopic.createdAt || 0).getTime();
                            const importedTime = new Date(updatedTopic.updatedAt || updatedTopic.createdAt || 0).getTime();
                            
                            if (importedTime > existingTime) {
                                nextTopics[idx] = updatedTopic;
                            }
                        }
                    } else {
                        // New Topic: Append
                        nextTopics.push(updatedTopic);
                        existingTopicIds.add(updatedTopic.id);
                    }
                });

                return nextTopics;
            });

            return nextSubjects;
        });
    }, [userId]);

    const clearStudyData = useCallback(() => {
        setStudyLog([]);
        setUserSubjects([]);
    }, []);

    return {
        studyLog,
        userSubjects,
        loadingData,
        handleUpdateTopic,
        handleAddTopic,
        handleDeleteTopic,
        handleAddSubject,
        handleUpdateSubject,
        handleDeleteSubject,
        importStudyLog,
        clearStudyData
    };
};
