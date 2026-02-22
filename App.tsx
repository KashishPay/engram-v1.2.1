
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
import { deleteTopicBodyFromIDB, deleteAudioFromIDB } from './services/storage';
import { attachDevTools } from './utils/devTools';
import { AnalyticsService } from './services/analytics';
import { ProfileService } from './services/profile';
import { getFeatureConfig } from './services/gemini';

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
        window.addEventListener("beforeunload", e => console.debug("[UPLOAD] beforeunload fired"));
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
                if (profile) {
                    const mappedProfile = {
                        name: profile.full_name,
                        avatar: profile.avatar_url || user.photoURL,
                        username: profile.username
                    };
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
        handleAddSubject, 
        handleUpdateSubject, 
        handleDeleteSubject,
        importStudyLog
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

    const handleOnboardingComplete = (profile: any) => {
        setUserProfile({
            name: profile.full_name,
            avatar: profile.avatar_url || user?.photoURL,
            username: profile.username
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
            try { await navigator.storage.persist(); } catch (e) {}
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

    if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900"><RotateCw size={32} className={`animate-spin text-${currentTheme}-600`} /></div>;

    return (
        <ProcessingProvider>
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
