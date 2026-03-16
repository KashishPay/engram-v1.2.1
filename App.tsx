
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RotateCw } from 'lucide-react'; 

import { Topic, DateTimeSettings, UserProfile, Habit, NotificationSettings } from './types';
import { AppRouter } from './components/AppRouter';

import { useAuth } from './context/AuthContext';
import { useStudyData } from './hooks/useStudyData';
import { usePodcast } from './hooks/usePodcast';
import { useFocus } from './context/FocusContext';
import { ProcessingProvider } from './context/ProcessingContext';
import { useNotifications } from './hooks/useNotifications';
import { 
    deleteTopicBodyFromIDB, 
    deleteAudioFromIDB,
    batchGetTopicBodies,
    batchGetImages,
    batchGetOriginalImages,
    batchGetChatHistories,
    batchSaveTopicBodies,
    batchSaveImages,
    batchSaveChatHistories
} from './services/storage';
import { ObservationsService } from './services/observations';
import { getPomodoroLogs, savePomodoroLogs } from './utils/sessionLog';
import { attachDevTools } from './utils/devTools';
import { AnalyticsService } from './services/analytics';
import { ProfileService } from './services/profile';
import { getFeatureConfig } from './services/gemini';
import { SyncService, SyncPayload } from './services/sync';

export const App: React.FC = () => {
    // [AUTH DIAGNOSIS] Boot Logs & Upload Diagnostics
    useEffect(() => {
        const url = new URL(window.location.href);
        const searchParams = Object.fromEntries(url.searchParams.entries());
        console.debug("================ AUTH DIAGNOSIS START ================");
        console.debug("[AUTH] boot location.href", window.location.href);
        console.debug("[AUTH] boot search params", searchParams);
        console.debug("[AUTH] boot hash", window.location.hash);
        if (searchParams.code) console.debug("[AUTH] OAuth Code detected!");
        if (searchParams.error) console.error("[AUTH] OAuth Error detected:", searchParams.error, searchParams.error_description);
        console.debug("======================================================");

        // DEV: Upload Refresh Diagnosis
        window.addEventListener("beforeunload", () => console.debug("[UPLOAD] beforeunload fired"));
        window.addEventListener("pageshow", e => console.debug("[UPLOAD] pageshow", { persisted: e.persisted }));
        document.addEventListener("visibilitychange", () => console.debug("[UPLOAD] visibilitychange", document.visibilityState));
    }, []);

    // App State
    const { user, isGuest, loading: authLoading, logout: authLogout, continueAsGuest } = useAuth();
    
    // Derived userId: Use Supabase UID if logged in, otherwise local fallback
    const [userId, setUserId] = useState<string>(() => {
        return localStorage.getItem('engramCurrentUserId') || 'local-user-' + Math.floor(Math.random() * 100000);
    });

    // Profile Management State (Local)
    const [profiles, setProfiles] = useState<{id: string, name: string, avatar: string | null}[]>(() => {
        try {
            const stored = localStorage.getItem('engramProfiles');
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    });

    // User Specific Data (Habits & Profile)
    const [userProfile, setUserProfile] = useState<UserProfile>({ 
        name: user?.displayName || user?.email?.split('@')[0] || 'Guest User', 
        avatar: user?.photoURL || null 
    });

    // Profile Gate State
    const [isOnboarded, setIsOnboarded] = useState(false);
    const [checkingProfile, setCheckingProfile] = useState(false);

    // Global Sync State
    const [globalSyncEnabled, setGlobalSyncEnabled] = useState<boolean>(() => {
        return localStorage.getItem('engramGlobalSyncEnabled') === 'true';
    });
    const [pendingSyncData, setPendingSyncData] = useState<SyncPayload | null>(null);
    const [showSyncPrompt, setShowSyncPrompt] = useState(false);

    // Sync User ID and Check Profile (Onboarding Gate) - Optimized for Offline
    useEffect(() => {
        if (authLoading) return;

        if (user && !isGuest) {
            const currentUid = user.uid;
            
            // 1. Sync User ID if changed
            if (currentUid !== userId) {
                console.debug("[APP] User ID changed. Syncing...", { old: userId, new: currentUid });
                setUserId(currentUid);
            }

            // 2. Check Cache Immediately (Prioritize Offline Access)
            const cachedProfileStr = localStorage.getItem(`engramProfile_${currentUid}`);
            let hasCachedProfile = false;
            
            if (cachedProfileStr) {
                try {
                    const cachedProfile = JSON.parse(cachedProfileStr);
                    if (cachedProfile && cachedProfile.username) {
                        hasCachedProfile = true;
                        // Update state from cache if not already set or if ID changed
                        if (!isOnboarded || userProfile.username !== cachedProfile.username) {
                            setUserProfile(cachedProfile);
                            setIsOnboarded(true);
                            console.debug("[APP] Profile restored from cache.");
                        }
                    }
                } catch (e) {
                    console.warn("[APP] Profile cache corrupt", e);
                }
            }

            // 3. Background Sync (Remote Check)
            // If we have no cache, we MUST block to fetch (to ensure valid profile).
            // If we have cache, we sync silently in background.
            if (!hasCachedProfile) {
                setCheckingProfile(true);
            }

            ProfileService.getCurrentProfile().then(profile => {
                console.debug("[APP] Fetched profile from Supabase:", profile);
                if (profile) {
                    const mappedProfile = {
                        name: profile.full_name,
                        avatar: profile.avatar_url || user.photoURL,
                        username: profile.username,
                        can_use_global_sync: profile.can_use_global_sync
                    };
                    console.debug("[APP] Mapped profile:", mappedProfile);
                    setUserProfile(mappedProfile);
                    setIsOnboarded(true);
                    localStorage.setItem(`engramProfile_${currentUid}`, JSON.stringify(mappedProfile));
                } else if (!hasCachedProfile) {
                    // Only force onboarding view if we truly have no profile (neither remote nor local)
                    setIsOnboarded(false);
                }
                setCheckingProfile(false);
            }).catch(err => {
                console.warn("[APP] Profile sync failed (Offline?)", err);
                setCheckingProfile(false);
                // If hasCachedProfile was true, user remains onboarded (Offline Mode works)
            });

        } else if (isGuest) {
            // Guest mode logic
            const storedId = localStorage.getItem('engramCurrentUserId');
            if (!storedId || !storedId.startsWith('local-')) {
                const newId = 'local-user-' + Math.floor(Math.random() * 100000);
                setUserId(newId);
            }
            setIsOnboarded(true); // Guests bypass Supabase onboarding
            setCheckingProfile(false);
        } else {
            // Logged out
            setIsOnboarded(false);
            setCheckingProfile(false);
        }
    }, [user, isGuest, authLoading]);

    // Core Data Hooks - Pass userId to scope data
    const { 
        studyLog, 
        userSubjects, 
        loadingData, 
        handleUpdateTopic, 
        handleAddTopic: addTopicLogic, 
        handleDeleteTopic,
        handleAddSubject, 
        handleUpdateSubject, 
        handleDeleteSubject,
        importStudyLog,
        clearStudyData
    } = useStudyData(userId);
    
    // Attach Dev Tools & Analytics Migration
    useEffect(() => {
        const enableDevtools = 
            window.location.protocol === 'blob:' ||
            window.location.hostname === 'localhost' ||
            localStorage.getItem('ENGRAM_DEVTOOLS') === '1';

        if (enableDevtools && userId) {
            attachDevTools(userId, () => window.location.reload());
        }

        if (!loadingData && userId && studyLog.length > 0) {
            const agg = AnalyticsService.getAggregates(userId);
            if (!agg || agg.version !== 1) {
                AnalyticsService.rebuild(userId, studyLog);
            }
        }
    }, [userId, loadingData, studyLog]);
    
    // Focus Context
    const focusState = useFocus();

    // Global UI Settings
    const [currentTheme, setCurrentTheme] = useState<string>('amber'); 
    const [themeIntensity, setThemeIntensity] = useState<string>('50');
    
    // Theme Management
    const [appMode, setAppMode] = useState<string>(() => {
        return localStorage.getItem('engramAppMode') || 'light';
    });

    useEffect(() => {
        const root = document.documentElement;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');

        const applyTheme = () => {
            const isDark = appMode === 'dark' || (appMode === 'system' && mq.matches);
            root.classList.toggle('dark', isDark);
        };

        // Apply theme immediately
        applyTheme();
        localStorage.setItem('engramAppMode', appMode);

        // Listen for OS changes only if system mode is selected
        if (appMode === 'system') {
            mq.addEventListener('change', applyTheme);
            return () => mq.removeEventListener('change', applyTheme);
        }
    }, [appMode]);
    
    const [podcastConfig, setPodcastConfig] = useState<{ language: 'English' | 'Hinglish' }>({ language: 'Hinglish' });
    
    // Global Podcast State
    const podcast = usePodcast(userId, podcastConfig.language);

    // AUTO-GENERATE PODCAST WATCHER
    const autoHandledIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!loadingData && studyLog.length > 0 && autoHandledIdsRef.current.size === 0) {
            studyLog.forEach(t => autoHandledIdsRef.current.add(t.id));
        }
    }, [loadingData]);

    useEffect(() => {
        if (loadingData) return;
        const podcastPrefs = getFeatureConfig('podcast');
        if (!podcastPrefs?.autoGenerateOnNewTopic) return;

        const candidates = studyLog.filter(t => {
            if (autoHandledIdsRef.current.has(t.id)) return false;
            const hasContent = t.shortNotes && t.shortNotes.length > 100;
            const hasAudio = t.hasSavedAudio || !!t.podcastAudio;
            return hasContent && !hasAudio;
        });

        if (candidates.length === 0) return;

        candidates.forEach(topic => {
            autoHandledIdsRef.current.add(topic.id);
            const context = `Topic: ${topic.topicName}\n${topic.shortNotes}`;
            podcast.controls.downloadTopic(
                topic, 
                context, 
                5, 
                podcastConfig.language, 
                (audioData, script) => {
                    handleUpdateTopic({
                        ...topic,
                        podcastScript: script,
                        hasSavedAudio: true
                    });
                }
            );
        });

    }, [studyLog, loadingData, podcastConfig.language, podcast.controls, handleUpdateTopic]);

    const [permissionsGranted, setPermissionsGranted] = useState<boolean>(() => {
        try {
            return localStorage.getItem('engramPermissionsGranted') === 'true';
        } catch { return false; }
    });

    const [enabledTabs, setEnabledTabs] = useState<string[]>(['home', 'subjects']);
    const [dateTimeSettings, setDateTimeSettings] = useState<DateTimeSettings>({
        timeFormat: 'system',
        startDayOfWeek: 'sunday',
        additionalCalendar: 'none',
        showWeekNumbers: false,
        week1Definition: 'default',
        countdownMode: false,
    });
    
    // Initialize with safe default, migration handled in useEffect
    const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
        enabled: true,
        reminders: [{ time: '09:00', label: 'Time to Study!' }]
    });
    const [habits, setHabits] = useState<Habit[]>([]);
    
    // Helper to process incoming sync data (heavy + light)
    const handleIncomingSyncPayload = async (payload: SyncPayload) => {
        if (payload.settings?._heavyData) {
            const heavy = payload.settings._heavyData;
            
            if (heavy.notesByTopicId) await batchSaveTopicBodies(userId, heavy.notesByTopicId);
            if (heavy.images) await batchSaveImages(heavy.images);
            if (heavy.originalImages) await batchSaveImages(heavy.originalImages);
            if (heavy.chatHistoryByTopicId) await batchSaveChatHistories(userId, heavy.chatHistoryByTopicId);
            
            if (heavy.observations) {
                const localObs = ObservationsService.getAll(userId);
                const mergedObs = SyncService.mergeCollections(localObs, heavy.observations);
                ObservationsService.saveAll(userId, mergedObs);
            }
            
            if (heavy.globalPomodoroLogs) {
                savePomodoroLogs(heavy.globalPomodoroLogs);
            }
            
            if (heavy.flashcardHistory) {
                localStorage.setItem(`engram-flashcard-history_${userId}`, JSON.stringify(heavy.flashcardHistory));
            }
            if (heavy.tasks) {
                localStorage.setItem('engramTasks', JSON.stringify(heavy.tasks));
            }
            if (heavy.matrix) {
                localStorage.setItem('engramMatrix', JSON.stringify(heavy.matrix));
            }
        }
        
        if (payload.study_logs && payload.subjects) {
            importStudyLog(payload.study_logs, payload.subjects);
        }
        if (payload.habits) {
            setHabits(prevHabits => SyncService.mergeCollections(prevHabits, payload.habits!));
        }
    };

    // Pull Data on Load
    useEffect(() => {
        if (authLoading || loadingData || !user || isGuest || !globalSyncEnabled) return;

        // Only pull once per session to avoid infinite loops
        const hasPulled = sessionStorage.getItem(`engram_sync_pulled_${userId}`);
        if (hasPulled) return;

        SyncService.pullData(userId).then(remoteData => {
            sessionStorage.setItem(`engram_sync_pulled_${userId}`, 'true');
            if (remoteData && remoteData.study_logs && remoteData.study_logs.length > 0) {
                if (studyLog.length === 0) {
                    // Auto-download if local is empty
                    console.debug("[APP] Local empty, auto-downloading remote data.");
                    handleIncomingSyncPayload(remoteData);
                } else {
                    // Prompt to merge
                    console.debug("[APP] Local and remote data found. Prompting user.");
                    setPendingSyncData(remoteData);
                    setShowSyncPrompt(true);
                }
            }
        }).catch(err => console.error("[APP] Sync pull failed", err));
    }, [authLoading, loadingData, user, isGuest, globalSyncEnabled, userId, studyLog.length, importStudyLog]);

    const lastPushTimestamp = useRef<number>(0);
    const syncDirty = useRef<boolean>(false);

    // Push Data on Change
    useEffect(() => {
        if (authLoading || loadingData || !user || isGuest || !globalSyncEnabled) return;

        const push = async () => {
            if (!navigator.onLine) {
                console.debug("[APP] Offline, queuing push.");
                syncDirty.current = true;
                return;
            }

            console.debug("[APP] Pushing data to Supabase...");
            
            // Gather heavy data
            const topicIds = studyLog.map(t => t.id);
            const notesByTopicId = await batchGetTopicBodies(userId, topicIds);
            
            const imageIds = new Set<string>();
            const captureRegex = /\[FIG_CAPTURE: (.*?) \|/g; 
            Object.values(notesByTopicId).forEach(note => {
                if (!note) return;
                const matches = [...note.matchAll(captureRegex)];
                matches.forEach(m => imageIds.add(m[1]));
            });
            const images = await batchGetImages(Array.from(imageIds));
            const originalImages = await batchGetOriginalImages(topicIds);
            const chatHistoryByTopicId = await batchGetChatHistories(userId, topicIds);
            const observations = ObservationsService.getAll(userId);
            const globalPomodoroLogs = getPomodoroLogs();
            
            let flashcardHistory = [];
            try {
                const raw = localStorage.getItem(`engram-flashcard-history_${userId}`);
                if (raw) flashcardHistory = JSON.parse(raw);
            } catch (e) {}

            let tasks = [];
            try {
                const raw = localStorage.getItem('engramTasks');
                if (raw) tasks = JSON.parse(raw);
            } catch (e) {}

            let matrix = [];
            try {
                const raw = localStorage.getItem('engramMatrix');
                if (raw) matrix = JSON.parse(raw);
            } catch (e) {}

            const heavyData = {
                notesByTopicId,
                images,
                originalImages,
                chatHistoryByTopicId,
                observations,
                globalPomodoroLogs,
                flashcardHistory,
                tasks,
                matrix
            };

            const success = await SyncService.pushData(userId, {
                subjects: userSubjects,
                study_logs: studyLog,
                habits: habits,
                settings: {
                    theme: currentTheme,
                    appMode: appMode,
                    dateTimeSettings,
                    notificationSettings,
                    enabledTabs,
                    _heavyData: heavyData
                }
            });

            if (success) {
                lastPushTimestamp.current = Date.now();
                syncDirty.current = false;
            } else {
                syncDirty.current = true;
            }
        };

        const timeout = setTimeout(push, 5000); // 5s debounce

        return () => clearTimeout(timeout);
    }, [studyLog, userSubjects, habits, currentTheme, appMode, dateTimeSettings, notificationSettings, enabledTabs, globalSyncEnabled, user, isGuest, userId, loadingData, authLoading]);

    // Offline Retry
    useEffect(() => {
        const handleOnline = () => {
            if (syncDirty.current && globalSyncEnabled && user && !isGuest) {
                console.debug("[APP] Back online, retrying push...");
                // Force a state update to trigger the push effect
                setHabits(prev => [...prev]);
            }
        };

        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [globalSyncEnabled, user, isGuest]);

    // Realtime Subscription
    useEffect(() => {
        if (authLoading || loadingData || !user || isGuest || !globalSyncEnabled) return;

        const unsubscribe = SyncService.subscribeToSyncState(userId, (payload) => {
            // Ignore updates that are likely our own recent pushes (within 10 seconds)
            const timeSinceLastPush = Date.now() - lastPushTimestamp.current;
            if (timeSinceLastPush < 10000) {
                console.debug("[APP] Ignoring realtime update (likely our own push).");
                return;
            }

            console.debug("[APP] Realtime update applied.");
            handleIncomingSyncPayload(payload);
        });

        return () => unsubscribe();
    }, [authLoading, loadingData, user, isGuest, globalSyncEnabled, userId, importStudyLog]);

    useNotifications(studyLog, notificationSettings);
    
    // Stats & Badges
    const currentStreak = useMemo(() => {
        const activityDates = new Set<string>();
        studyLog.forEach(topic => {
            if (topic.createdAt) activityDates.add(topic.createdAt.split('T')[0]);
            topic.repetitions?.forEach(rep => activityDates.add(rep.dateCompleted));
            topic.focusLogs?.forEach(log => activityDates.add(log.date));
        });

        const sortedDates = Array.from(activityDates).sort();
        if (sortedDates.length === 0) return 0;

        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        const lastActive = sortedDates[sortedDates.length - 1];
        if (lastActive !== today && lastActive !== yesterday) return 0;

        let streak = 1;
        let currentDateStr = lastActive;

        for (let i = sortedDates.length - 2; i >= 0; i--) {
            const prevDateStr = sortedDates[i];
            const d = new Date(currentDateStr);
            d.setDate(d.getDate() - 1);
            const expectedPrevStr = d.toISOString().split('T')[0];

            if (prevDateStr === expectedPrevStr) {
                streak++;
                currentDateStr = prevDateStr;
            } else {
                break;
            }
        }
        return streak;
    }, [studyLog]);

    const earnedBadges = useMemo(() => {
        const allBadges = [];
        if (currentStreak >= 3) allBadges.push({ id: 's1' });
        if (currentStreak >= 7) allBadges.push({ id: 's2' });
        if (currentStreak >= 21) allBadges.push({ id: 's3' });
        if (currentStreak >= 100) allBadges.push({ id: 's4' });

        const topicCount = studyLog.length;
        if (topicCount >= 1) allBadges.push({ id: 't1' });
        if (topicCount >= 10) allBadges.push({ id: 't2' });
        if (topicCount >= 50) allBadges.push({ id: 't3' });

        const totalMinutes = studyLog.reduce((acc, t) => acc + (t.pomodoroTimeMinutes || 0), 0);
        if (totalMinutes >= 60) allBadges.push({ id: 'f1' });
        if (totalMinutes >= 300) allBadges.push({ id: 'f2' });
        if (totalMinutes >= 1000) allBadges.push({ id: 'f3' });

        let perfectScores = 0;
        let totalReps = 0;
        studyLog.forEach(t => {
            t.repetitions?.forEach(r => {
                totalReps++;
                if (r.score === 10) perfectScores++;
            });
        });

        if (perfectScores >= 1) allBadges.push({ id: 'm1' });
        if (perfectScores >= 5) allBadges.push({ id: 'm2' });
        if (perfectScores >= 25) allBadges.push({ id: 'm3' });

        if (totalReps >= 10) allBadges.push({ id: 'r1' });
        if (totalReps >= 50) allBadges.push({ id: 'r2' });
        if (totalReps >= 200) allBadges.push({ id: 'r3' });

        return allBadges;
    }, [studyLog, currentStreak]);

    // Save active user ID whenever it changes
    useEffect(() => {
        localStorage.setItem('engramCurrentUserId', userId);
    }, [userId]);

    useEffect(() => {
        localStorage.setItem('engramProfiles', JSON.stringify(profiles));
    }, [profiles]);

    const handleLoginComplete = (guestName: string, guestAvatar: string | null) => {
        continueAsGuest();
        const trimmedName = guestName.trim();
        if (!trimmedName) return;

        if (userProfile && userProfile.name && userProfile.name.toLowerCase() === trimmedName.toLowerCase()) {
            const updatedProfile = { ...userProfile, avatar: guestAvatar || userProfile.avatar };
            setUserProfile(updatedProfile);
            setProfiles(prev => {
                const exists = prev.some(p => p.id === userId);
                if (exists) {
                    return prev.map(p => p.id === userId ? { ...p, avatar: guestAvatar || p.avatar } : p);
                }
                return [...prev, { id: userId, name: trimmedName, avatar: guestAvatar || userProfile.avatar }];
            });
            setIsOnboarded(true);
            return;
        }

        const existingProfile = profiles.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
        if (existingProfile) {
            setUserId(existingProfile.id);
            setIsOnboarded(true);
            return;
        }

        const newId = 'local-user-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        setUserId(newId);
        setUserProfile({ name: trimmedName, avatar: guestAvatar });
        setHabits([]); 
        setProfiles(prev => [...prev, { id: newId, name: trimmedName, avatar: guestAvatar }]);
        setIsOnboarded(true);
    };

    const handleOnboardingComplete = (profile: unknown) => {
        const p = profile as { full_name: string; avatar_url?: string; username: string; can_use_global_sync?: boolean };
        setUserProfile({
            name: p.full_name,
            avatar: p.avatar_url || user?.photoURL,
            username: p.username,
            can_use_global_sync: p.can_use_global_sync
        });
        setIsOnboarded(true);
        window.location.hash = '#/home';
    };

    const handleSwitchProfile = (id: string) => {
        const target = profiles.find(p => p.id === id);
        if (target) {
            setUserId(target.id);
        }
    };

    const handleAddProfile = () => {
        handleSignOut();
    };

    const handleAllowPermissions = async () => {
        if (navigator.storage && navigator.storage.persist) {
            try { await navigator.storage.persist(); } catch (e) {
                console.warn('Storage persistence request failed', e);
            }
        }
        
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment' } 
                });
                stream.getTracks().forEach(track => track.stop());
            } catch (e) {
                console.warn("Camera permission denied", e);
            }
        }

        localStorage.setItem('engramPermissionsGranted', 'true');
        setPermissionsGranted(true);
    };
    
    useEffect(() => {
        if (!user && !isGuest) {
            podcast.controls.reset();
        }
    }, [user, isGuest]);

    // Initial Load Settings
    useEffect(() => {
        try {
            const storedTheme = localStorage.getItem('engramTheme');
            const storedIntensity = localStorage.getItem('engramThemeIntensity');
            const storedTabs = localStorage.getItem('engramTabs');
            const storedDateTime = localStorage.getItem('engramDateTime');
            const storedNotifications = localStorage.getItem('engramNotifications');
            
            const storedProfile = localStorage.getItem(`engramProfile_${userId}`);
            const storedHabits = localStorage.getItem(`engramHabits_${userId}`);
            
            if (storedTheme) setCurrentTheme(storedTheme);
            if (storedIntensity) setThemeIntensity(storedIntensity);
            if (storedTabs) setEnabledTabs(JSON.parse(storedTabs).filter((t: string) => t !== 'settings'));
            if (storedDateTime) setDateTimeSettings(JSON.parse(storedDateTime));
            
            if (storedNotifications) {
                const parsed = JSON.parse(storedNotifications);
                
                // MIGRATION START
                // 1. Single time string -> Array of strings
                if (parsed.reminderTime && !parsed.reminderTimes) {
                    parsed.reminderTimes = [parsed.reminderTime];
                    delete parsed.reminderTime;
                }

                // 2. Array of strings -> Array of ReminderConfig objects
                if (parsed.reminderTimes && !parsed.reminders) {
                    const globalLabel = parsed.customLabel || "Time to Study!";
                    parsed.reminders = parsed.reminderTimes.map((t: string) => ({
                        time: t,
                        label: globalLabel
                    }));
                    delete parsed.reminderTimes;
                    delete parsed.customLabel;
                }
                
                // 3. Fallback if still empty
                if (!parsed.reminders || !Array.isArray(parsed.reminders)) {
                    parsed.reminders = [{ time: '09:00', label: 'Time to Study!' }];
                }
                // MIGRATION END

                setNotificationSettings(parsed);
            }
            
            if (!user && storedProfile) {
                const parsedProfile = JSON.parse(storedProfile);
                setUserProfile(parsedProfile);
            } else if (!user && !storedProfile) {
                const existing = profiles.find(p => p.id === userId);
                if (existing) setUserProfile({ name: existing.name, avatar: existing.avatar });
            }

            if (storedHabits) {
                setHabits(JSON.parse(storedHabits));
            } else {
                setHabits([]);
            }

        } catch (e) {
            console.error("Failed to load settings", e);
        }
    }, [userId, user]); 

    // Persistence Effects
    useEffect(() => { localStorage.setItem('engramTheme', currentTheme); }, [currentTheme]);
    useEffect(() => { localStorage.setItem('engramThemeIntensity', themeIntensity); }, [themeIntensity]);
    useEffect(() => { localStorage.setItem('engramTabs', JSON.stringify(enabledTabs)); }, [enabledTabs]);
    useEffect(() => { localStorage.setItem('engramDateTime', JSON.stringify(dateTimeSettings)); }, [dateTimeSettings]);
    useEffect(() => { localStorage.setItem('engramNotifications', JSON.stringify(notificationSettings)); }, [notificationSettings]);
    
    useEffect(() => { if(!loadingData) localStorage.setItem(`engramProfile_${userId}`, JSON.stringify(userProfile)); }, [userProfile, loadingData, userId]);
    useEffect(() => { if(!loadingData) localStorage.setItem(`engramHabits_${userId}`, JSON.stringify(habits)); }, [habits, loadingData, userId]);

    const handleSignOut = async () => {
        if (isGuest && userId.startsWith('local-user-')) {
            try {
                const dataKey = `engramData_${userId}`;
                const storedData = localStorage.getItem(dataKey);
                if (storedData) {
                    const topics: Topic[] = JSON.parse(storedData);
                    for (const t of topics) {
                        await deleteTopicBodyFromIDB(userId, t.id);
                        if (t.hasSavedAudio) {
                            await deleteAudioFromIDB(t.id);
                        }
                    }
                }

                const keysToRemove = [
                    `engramData_${userId}`,
                    `engramSubjects_${userId}`,
                    `engramProfile_${userId}`,
                    `engramHabits_${userId}`,
                    `engramCalendarAgg_${userId}`,
                    `engram-flashcard-history_${userId}`,
                    `engram_migration_v2_complete_${userId}`
                ];
                keysToRemove.forEach(k => localStorage.removeItem(k));

                const updatedProfiles = profiles.filter(p => p.id !== userId);
                setProfiles(updatedProfiles); 
                localStorage.setItem('engramProfiles', JSON.stringify(updatedProfiles));
            
            } catch (e) {
                console.error("Guest cleanup failed", e);
            }
        }

        localStorage.removeItem('engramHasLoggedIn');
        if (user) await authLogout();
        if (isGuest) await authLogout(); 
        
        setIsOnboarded(false);
        setCheckingProfile(false);
        podcast.controls.reset();
        
        setUserId('local-user-' + Math.floor(Math.random() * 100000));
    };

    const handleSyncChoice = (choice: 'merge' | 'keep_local' | 'download_cloud') => {
        if (!pendingSyncData) return;
        
        if (choice === 'download_cloud') {
            // Clear local data first
            localStorage.removeItem(`engramData_${userId}`);
            localStorage.removeItem(`engramSubjects_${userId}`);
            localStorage.removeItem(`engramHabits_${userId}`);
            localStorage.removeItem(`engram-flashcard-history_${userId}`);
            localStorage.removeItem('engramTasks');
            localStorage.removeItem('engramMatrix');
            
            // We can't easily clear IDB here synchronously, but handleIncomingSyncPayload will overwrite keys.
            // For a true overwrite, we should set state to empty first.
            clearStudyData();
            setHabits([]);
            
            setTimeout(() => {
                handleIncomingSyncPayload(pendingSyncData);
            }, 100);
        } else if (choice === 'merge') {
            // Simple merge: append remote to local (deduplicated by ID in importStudyLog)
            handleIncomingSyncPayload(pendingSyncData);
        }
        
        setShowSyncPrompt(false);
        setPendingSyncData(null);
    };

    if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900"><RotateCw size={32} className={`animate-spin text-${currentTheme}-600`} /></div>;

    return (
        <ProcessingProvider>
            {showSyncPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Cloud Data Found</h2>
                        <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
                            We found existing study data in your cloud account. How would you like to proceed?
                        </p>
                        <div className="space-y-3">
                            <button onClick={() => handleSyncChoice('merge')} className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition">
                                Merge Local & Cloud Data
                            </button>
                            <button onClick={() => handleSyncChoice('download_cloud')} className="w-full py-3 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-medium transition">
                                Download Cloud Data (Overwrite Local)
                            </button>
                            <button onClick={() => handleSyncChoice('keep_local')} className="w-full py-3 px-4 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl font-medium transition">
                                Keep Local Data (Overwrite Cloud)
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <AppRouter 
                user={user}
                isGuest={isGuest}
                userId={userId}
                authLoading={authLoading}
                userProfile={userProfile}
                setUserProfile={setUserProfile}
                isOnboarded={isOnboarded}
                setIsOnboarded={setIsOnboarded}
                checkingProfile={checkingProfile}
                profiles={profiles}
                onLoginComplete={handleLoginComplete}
                onOnboardingComplete={handleOnboardingComplete}
                onSignOut={handleSignOut}
                onSwitchProfile={handleSwitchProfile}
                onAddProfile={handleAddProfile}

                studyLog={studyLog}
                userSubjects={userSubjects}
                loadingData={loadingData}
                habits={habits}
                setHabits={setHabits}
                handleUpdateTopic={handleUpdateTopic}
                handleAddTopic={addTopicLogic}
                handleDeleteTopic={handleDeleteTopic}
                handleAddSubject={handleAddSubject}
                handleUpdateSubject={handleUpdateSubject}
                handleDeleteSubject={handleDeleteSubject}
                importStudyLog={importStudyLog}
                
                earnedBadges={earnedBadges}
                currentStreak={currentStreak}

                dateTimeSettings={dateTimeSettings}
                setDateTimeSettings={setDateTimeSettings}
                notificationSettings={notificationSettings}
                setNotificationSettings={setNotificationSettings}
                currentTheme={currentTheme}
                setCurrentTheme={setCurrentTheme}
                themeIntensity={themeIntensity}
                setThemeIntensity={setThemeIntensity}
                appMode={appMode}
                setAppMode={setAppMode}
                enabledTabs={enabledTabs}
                setEnabledTabs={setEnabledTabs}
                globalSyncEnabled={globalSyncEnabled}
                setGlobalSyncEnabled={setGlobalSyncEnabled}
                permissionsGranted={permissionsGranted}
                handleAllowPermissions={handleAllowPermissions}

                podcastConfig={podcastConfig}
                setPodcastConfig={setPodcastConfig}
                podcast={podcast}
                focusState={focusState}
            />
        </ProcessingProvider>
    );
};
