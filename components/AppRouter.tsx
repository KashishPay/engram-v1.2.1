
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// Force Sync Comment: 2026-04-02
import { NavStack } from '../utils/navStack';
import { SPACING_INTERVALS } from '../constants';
import { supabase } from '../services/supabase';
import { AppShell } from './AppShell';
import { Topic, Subject, UserProfile, Habit, DateTimeSettings, NotificationSettings } from '../types';
import { AnalyticsService } from '../services/analytics';
import { 
    getTopicBodyFromIDB, 
    getImageFromIDB, 
    batchSaveImages, 
    batchGetOriginalImages,
    getChatFromIDB,
    batchSaveChatHistories,
    batchGetAudio,
    batchSaveAudio
} from '../services/storage';
import { logGlobalSession, getPomodoroLogs, savePomodoroLogs, getLocalISODate } from '../utils/sessionLog';
import { ObservationsService } from '../services/observations';
import { ENABLE_PASSWORD_RECOVERY } from '../config/auth';
import { normalizeDoubleHashToQuery } from '../utils/urlSanitizer';
import { checkGuestStatus, getGuestStartTimestamp } from '../utils/guestLimit';
import { ErrorCard } from './ErrorCard';
import { downloadLargeJSONStream } from '../utils/download';
import { App as CapacitorApp, URLOpenListenerEvent } from '@capacitor/app'; 
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// Views
import { LoginView } from '../views/LoginView';
import { OnboardingView } from '../views/OnboardingView';
import { AuthCallbackView } from '../views/AuthCallbackView';
import { HomeView } from '../views/HomeView';
import { SubjectsView } from '../views/SubjectsView';
import { TopicDetailView } from '../views/TopicDetailView';
import { QuizView } from '../views/QuizView';
import { QuizReview } from '../views/QuizReview';
import { ChatView } from '../views/ChatView';
import { SettingsView } from '../views/SettingsView';
import { TopicListView } from '../views/TopicListView';
import { ResetPasswordView } from '../views/ResetPasswordView';
import { TabBarConfigView } from '../views/TabBarConfigView';
import { AppearanceView } from '../views/AppearanceView';
import { DateTimeSettingsView } from '../views/DateTimeSettingsView';
import { SoundsNotificationsView } from '../views/SoundsNotificationsView';
import { WidgetsView } from '../views/WidgetsView';
import { PodcastSettingsView, PodcastFullView } from '../views/PodcastView';
import { AboutView } from '../views/AboutView';
import { TermsView, PrivacyView, LicensesView } from '../views/LegalViews';
import { CalendarView, TaskView, EisenhowerMatrixView, PomodoroFullView, HabitTrackerView, SearchView } from '../views/ExtraViews';
import { ProfileView } from '../views/ProfileView';
import { AiFeaturesView } from '../views/AiFeaturesView';
import { StudyBreakdownView } from '../views/StudyBreakdownView';
import { ObservationsView } from '../views/ObservationsView';
import { PomoHistoryView } from '../views/PomoHistoryView';
import { CalculatorView } from '../views/CalculatorView';
import { FlashcardHubView } from '../views/FlashcardHubView';
import { TestSeriesView } from '../views/TestSeriesView';
import { DiaryView } from '../views/DiaryView';

import { useFocus } from '../context/FocusContext';

interface AppRouterProps {
    user: unknown;
    isGuest: boolean;
    userId: string;
    authLoading: boolean;
    userProfile: UserProfile;
    setUserProfile: (profile: UserProfile) => void;
    isOnboarded: boolean;
    setIsOnboarded: (isOnboarded: boolean) => void;
    checkingProfile: boolean;
    profiles: { id: string; name: string; avatar: string | null }[];
    onLoginComplete: (name: string, avatar: string | null) => void;
    onOnboardingComplete: (profile: unknown) => void;
    onSignOut: () => void;
    onSwitchProfile: (id: string) => void;
    onAddProfile: () => void;
    onDeleteProfile: (id: string) => void;

    studyLog: Topic[];
    userSubjects: Subject[];
    loadingData: boolean;
    habits: Habit[];
    setHabits: (habits: Habit[]) => void;
    handleUpdateTopic: (topic: Topic) => void;
    handleAddTopic: (topic: Omit<Topic, 'id'>) => void;
    handleDeleteTopic: (topicId: string) => void;
    handleAddSubject: (subject: Subject) => void;
    handleUpdateSubject: (subject: Subject) => void;
    handleDeleteSubject: (id: string) => void;
    importStudyLog: (data: Topic[], subjects?: Subject[]) => Promise<void>;

    earnedBadges: { id: string }[];
    currentStreak: number;

    dateTimeSettings: DateTimeSettings;
    setDateTimeSettings: (settings: DateTimeSettings) => void;
    notificationSettings: NotificationSettings;
    setNotificationSettings: (settings: NotificationSettings) => void;
    currentTheme: string;
    setCurrentTheme: (theme: string) => void;
    themeIntensity: string;
    setThemeIntensity: (intensity: string) => void;
    appMode: string;
    setAppMode: (mode: string) => void;
    enabledTabs: string[];
    setEnabledTabs: (tabs: string[]) => void;
    onManualSync: () => Promise<void>;
    isSyncing: boolean;
    permissionsGranted: boolean;
    handleAllowPermissions: () => void;

    podcastConfig: { language: 'English' | 'Hinglish' };
    setPodcastConfig: (config: { language: 'English' | 'Hinglish' }) => void;
    podcast: unknown;
}

// Helper for safe JSON reading
function safeReadJSON<T = unknown>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return (parsed ?? fallback) as T;
    } catch {
        return fallback;
    }
}

// --- Smart Merge Helpers ---

const mergeHabits = (local: Habit[], imported: Habit[]): Habit[] => {
    const mergedMap = new Map<string, Habit>();
    local.forEach(h => mergedMap.set(h.id, h));

    imported.forEach(imp => {
        // 1. Try match by ID
        if (mergedMap.has(imp.id)) {
            const existing = mergedMap.get(imp.id)!;
            // Merge dates (Union)
            const combinedDates = Array.from(new Set([...existing.completedDates, ...imp.completedDates])).sort();
            mergedMap.set(imp.id, { ...existing, completedDates: combinedDates });
        } else {
            // 2. Try match by Name (Case insensitive) to prevent duplicates
            const duplicateId = Array.from(mergedMap.values()).find(h => h.name.trim().toLowerCase() === imp.name.trim().toLowerCase())?.id;
            if (duplicateId) {
                const existing = mergedMap.get(duplicateId)!;
                const combinedDates = Array.from(new Set([...existing.completedDates, ...imp.completedDates])).sort();
                mergedMap.set(duplicateId, { ...existing, completedDates: combinedDates });
            } else {
                // 3. New Habit
                mergedMap.set(imp.id, imp);
            }
        }
    });
    return Array.from(mergedMap.values());
};

const mergeObservations = (local: unknown[], imported: unknown[]): unknown[] => {
    const map = new Map<string, Record<string, unknown>>();
    (local as Record<string, unknown>[]).forEach(o => map.set(o.dateISO as string, o));
    
    (imported as Record<string, unknown>[]).forEach(imp => {
        const existing = map.get(imp.dateISO as string);
        if (existing) {
            // Conflict: Use Last Write Wins based on updatedAt
            const impTime = (imp.updatedAt as number) || 0;
            const locTime = (existing.updatedAt as number) || 0;
            if (impTime >= locTime) {
                map.set(imp.dateISO as string, imp);
            }
        } else {
            map.set(imp.dateISO as string, imp);
        }
    });
    return Array.from(map.values());
};

const mergeTasksSmart = (local: unknown[], imported: unknown[], textKey: string = 'text'): unknown[] => {
    const map = new Map<string, Record<string, unknown>>();
    const texts = new Set<string>();
    
    (local as Record<string, unknown>[]).forEach(t => {
        map.set(t.id as string, t);
        if (t[textKey]) texts.add(t[textKey] as string);
    });
    
    (imported as Record<string, unknown>[]).forEach(t => {
        if (map.has(t.id as string)) {
            // ID Conflict: Backup wins (Overwrite)
            map.set(t.id as string, t);
        } else if (!texts.has(t[textKey] as string)) {
            // New Item (Append if text is unique)
            map.set(t.id as string, t);
            texts.add(t[textKey] as string);
        }
    });
    
    return Array.from(map.values());
};

const mergeFlashcards = (local: unknown[], imported: unknown[]): unknown[] => {
    const map = new Map<string, Record<string, unknown>>();
    (local as Record<string, unknown>[]).forEach(item => map.set(item.id as string, item));
    (imported as Record<string, unknown>[]).forEach(item => map.set(item.id as string, item));
    return Array.from(map.values());
};

// Blob Sandbox Detection
const isBlobSandbox = () => {
    return window.location.protocol === 'blob:' || 
           window.location.origin.includes('googleusercontent.com');
};

export const AppRouter: React.FC<AppRouterProps> = (props) => {
    const focusState = useFocus();
    
    // Router State
    const [currentView, setCurrentView] = useState<string>('home');
    
    // FIX: Store ID only, derive object from props to ensure Single Source of Truth
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    
    const [topicListData, setTopicListData] = useState<{ title: string; topics: Topic[] }>({ title: '', topics: [] });
    
    // Quiz Hydration State
    const [selectedQuizReviewData, setSelectedQuizReviewData] = useState<{ topic: Topic, quizAttempt: QuizAttempt, repetitionNumber: number } | null>(null);
    const [isHydratingQuizReview, setIsHydratingQuizReview] = useState(false);

    const [isPodcastOverlayOpen, setIsPodcastOverlayOpen] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [showImportSuccessModal, setShowImportSuccessModal] = useState(false);
    const [breakdownFilter, setBreakdownFilter] = useState<string>('all');
    const [routerError, setRouterError] = useState<Error | null>(null);
    const [isTestSeriesActive, setIsTestSeriesActive] = useState(false);
    const [isQuizActive, setIsQuizActive] = useState(false);

    // Derived Auth State
    const isLoggedIn = !!(props.user || props.isGuest);

    // Stable References for Event Listeners
    const processingHash = useRef<string | null>(null);
    const hasInitialized = useRef(false);
    const studyLogRef = useRef(props.studyLog);
    const currentViewRef = useRef(currentView);
    const lastHashRef = useRef<string>(window.location.hash);
    
    // Payload Stash for Navigation Transitions
    const pendingNavPayloadRef = useRef<unknown>(null);

    // Modal State Ref for Event Listener
    const modalsRef = useRef({
        feedback: false,
        importSuccess: false,
        podcast: false
    });

    // Sync Refs with Props/State
    useEffect(() => { studyLogRef.current = props.studyLog; }, [props.studyLog]);
    useEffect(() => { currentViewRef.current = currentView; }, [currentView]);
    
    // Sync Modal Refs
    useEffect(() => {
        modalsRef.current = {
            feedback: showFeedbackModal,
            importSuccess: showImportSuccessModal,
            podcast: isPodcastOverlayOpen
        };
    }, [showFeedbackModal, showImportSuccessModal, isPodcastOverlayOpen]);

    // Derived Selected Topic (Always fresh from props)
    const selectedTopic = useMemo(() => {
        if (!selectedTopicId) return null;
        return props.studyLog.find(t => t.id === selectedTopicId) || null;
    }, [props.studyLog, selectedTopicId]);

    // Helper: Parse Hash (Pure)
    const fromHash = useCallback((hash: string) => {
        if (!hash || hash === '#' || hash === '#/') return { view: 'home', params: {} };
        
        const cleanHash = hash.replace(/^#\/?/, '');
        const [pathPart, queryPart] = cleanHash.split('?');
        const params: Record<string, string> = {};
        
        if (queryPart) {
            new URLSearchParams(queryPart).forEach((value, key) => {
                params[key] = value;
            });
        }

        // Canonical TopicList Support: #/list/:type
        if (pathPart.startsWith('list/')) {
            const type = pathPart.split('/')[1];
            return { view: 'topicList', params: { ...params, type } };
        }

        const view = pathPart || 'home';
        return { view, params };
    }, []);

    // Core Hash Change Logic
    const handleHashChangeCore = useCallback((targetHash: string, source: string, directPayload?: unknown) => {
        // Sanitize first to fix double hashes
        normalizeDoubleHashToQuery();

        let rawHash = window.location.hash || targetHash;
        
        // CANONICALIZATION
        if (rawHash.includes('topicList') && rawHash.includes('type=')) {
             const match = rawHash.match(/[?&]type=([^&]+)/);
             if (match) {
                 const type = match[1];
                 const canonicalHash = `#/list/${type}`;
                 try {
                    window.history.replaceState(null, '', canonicalHash);
                 } catch { /* Safe fail in blob */ }
                 rawHash = canonicalHash;
             }
        }

        const isInternal = (processingHash.current === rawHash);
        console.debug("[ROUTER] handle", { rawHash, source, isInternal, hasPayload: !!directPayload });
        
        lastHashRef.current = rawHash;

        if (isInternal) {
            processingHash.current = null;
            NavStack.pushHash(rawHash);
        } else {
            if (NavStack.getStack().length === 0) {
                 NavStack.pushHash(rawHash);
            }
        }
        
        const route = fromHash(rawHash);
        if (!route) {
            if (!currentViewRef.current) setCurrentView('home');
            return; 
        }

        const studyLog = studyLogRef.current;

        // View-Specific Hydration Logic
        
        // 1. QUIZ REVIEW HYDRATION (Payload First)
        if (route.view === 'quizReview') {
            setIsHydratingQuizReview(true);
            
            // Priority 1: Direct Payload (from immediate navigation)
            // Priority 2: Stashed Payload (from ref)
            const payload = directPayload || pendingNavPayloadRef.current;
            
            if (payload && payload.topic && payload.quizAttempt) {
                console.debug("[ROUTER] Hydrating QuizReview from Payload");
                setSelectedQuizReviewData({
                    topic: payload.topic,
                    quizAttempt: payload.quizAttempt,
                    repetitionNumber: payload.repetitionNumber
                });
                // Sync main selection by ID
                setSelectedTopicId(payload.topic.id);
                setIsHydratingQuizReview(false);
                pendingNavPayloadRef.current = null; // consume
            } else if (route.params?.id) {
                // Priority 3: Fallback to ID lookup (e.g. refresh or back button)
                console.debug("[ROUTER] Hydrating QuizReview from ID lookup");
                const topic = studyLog.find(t => t.id === route.params.id) || null;
                if (topic) {
                    setSelectedTopicId(topic.id);
                    const totalReps = topic.repetitions?.length || 0;
                    let targetIndex = totalReps - 1;
                    if (route.params.repIndex) {
                        targetIndex = parseInt(route.params.repIndex);
                    }
                    
                    const targetRep = topic.repetitions?.[targetIndex];
                    
                    let quizAttempt = targetRep?.quizAttempt;
                    if (!quizAttempt && targetRep?.quizData && targetRep?.answers) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const questions = (targetRep.quizData as any[]).map((q, index) => ({
                            ...q,
                            userSelected: targetRep.answers![index] || '',
                            questionText: q.question,
                            correctAnswer: q.correct_answer_letter
                        }));
                        quizAttempt = {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            timeTakenSeconds: (targetRep as any).timeTaken || 0,
                            score: targetRep.score || 0,
                            isFallbackQuiz: false,
                            questions
                        };
                    }

                    if (quizAttempt) {
                        setSelectedQuizReviewData({ 
                            topic: topic,
                            quizAttempt: quizAttempt, 
                            repetitionNumber: targetIndex + 1 
                        });
                        setIsHydratingQuizReview(false);
                    } else {
                        // Failed to find specific attempt
                        setIsHydratingQuizReview(false);
                    }
                } else {
                    setIsHydratingQuizReview(false);
                }
            } else {
                setIsHydratingQuizReview(false);
            }
        } 
        
        // 2. STANDARD HYDRATION
        else if (['topicDetail', 'quiz', 'chat'].includes(route.view)) {
            if (route.params?.id) {
                // Use payload if available to set ID, else use param
                const payloadTopicId = (directPayload || pendingNavPayloadRef.current)?.topic?.id;
                const targetId = payloadTopicId || route.params.id;
                
                // Set ID directly. Derivation logic handles the rest.
                setSelectedTopicId(targetId);
                pendingNavPayloadRef.current = null;
            }
        } 
        else if (route.view === 'topicList') {
            const today = new Date().toISOString().split('T')[0];
            let filtered: Topic[] = [];
            let title = 'Topics';
            const type = route.params?.type;

            if (type === 'due') {
                title = 'Due for Review';
                filtered = studyLog.filter(t => {
                    if (t.isJourneyPaused) return false;
                    if ((t.repetitions?.length || 0) === 0) return true;
                    const lastRep = t.repetitions[t.repetitions.length - 1];
                    return lastRep && lastRep.nextReviewDate <= today;
                });
            } else if (type === 'active') {
                title = 'Active Topics';
                filtered = studyLog.filter(t => {
                    if (t.isJourneyPaused) return false;
                    if ((t.repetitions?.length || 0) === 0) return false;
                    const lastRep = t.repetitions[t.repetitions.length - 1];
                    return lastRep && lastRep.nextReviewDate > today && t.repetitions.length < SPACING_INTERVALS.length;
                });
            } else if (type === 'history') {
                title = 'Recent Quizzes';
                filtered = studyLog
                    .filter(t => (t.repetitions?.length || 0) > 0)
                    .sort((a, b) => {
                        const dateA = a.repetitions[a.repetitions.length-1].dateCompleted || '';
                        const dateB = b.repetitions[b.repetitions.length-1].dateCompleted || '';
                        return dateB.localeCompare(dateA);
                    });
            }
            setTopicListData({ title, topics: filtered });
        } else if (route.view === 'studyBreakdown') {
            setBreakdownFilter(route.params.id || 'all');
        }

        setCurrentView(route.view);
        setIsPodcastOverlayOpen(route.view === 'podcast');
    }, [fromHash]);

    // Navigation Handler (Updates Hash)
    const navigateTo = useCallback((view: string, data?: unknown, options?: { replace?: boolean }) => {
        let hash = `#/${view}`;
        const params = new URLSearchParams();

        if (view === 'topicList' && data?.type) {
            hash = `#/list/${data.type}`;
        } else {
            if (data) {
                if (data.id) params.set('id', data.id); // Topic ID, Subject ID
                if (data.type) params.set('type', data.type); 
                
                // Special case for quizReview to ensure we can load specific attempt
                if (view === 'quizReview' && data.repetitionNumber !== undefined) {
                    const repIndex = data.repetitionNumber - 1;
                    params.set('repIndex', repIndex.toString());
                    // Pass topic ID implicitly via data.topic if available
                    if (data.topic?.id) params.set('id', data.topic.id);
                }
            }

            const queryString = params.toString();
            if (queryString) hash += `?${queryString}`;
        }

        // Stash payload for next hydration cycle
        pendingNavPayloadRef.current = data;
        processingHash.current = hash;

        // Blob Sandbox / History API Handling
        if (isBlobSandbox()) {
            // Blob environments often block history API or behave erratically.
            // Direct hash assignment is safer.
            window.location.hash = hash;
            // Force handler call since hashchange might not fire synchronously or reliably in blob
            handleHashChangeCore(hash, 'internal', data);
        } else {
            try {
                if (options?.replace) {
                    window.history.replaceState(null, '', hash);
                } else {
                    window.history.pushState(null, '', hash);
                }
                // Manually trigger handler because pushState/replaceState don't fire hashchange
                handleHashChangeCore(hash, 'internal', data);
            } catch (e) {
                console.warn("[Router] History API failed, falling back to location.hash", e);
                window.location.hash = hash;
            }
        }
    }, [handleHashChangeCore]);

    const goBack = useCallback(() => {
        NavStack.goBackHash('#/home');
    }, []);

    // --- HARDWARE BACK BUTTON & DEEP LINKS (Capacitor) ---
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        let backListener: { remove: () => void } | null = null;
        let urlListener: { remove: () => void } | null = null;

        const setupListeners = async () => {
            // 1. Back Button
            backListener = await CapacitorApp.addListener('backButton', () => {
                if (modalsRef.current.importSuccess) { window.location.reload(); return; }
                if (modalsRef.current.feedback) { setShowFeedbackModal(false); return; }
                if (modalsRef.current.podcast) { goBack(); return; }

                if (currentViewRef.current === 'home' || currentViewRef.current === 'login') {
                    CapacitorApp.exitApp();
                } else {
                    goBack();
                }
            });

            // 2. Deep Links (OAuth Callback)
            urlListener = await CapacitorApp.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
                console.debug("[DEEP LINK] Received:", event.url);
                
                try {
                    const url = new URL(event.url);
                    // Match Auth Callback Patterns
                    // Support standard web path AND custom scheme (host=google-auth)
                    const isAuthCallback = 
                        url.pathname.includes('auth/callback') || 
                        url.host === 'google-auth' || // Catches com.engram.app://google-auth
                        url.searchParams.has('code') || 
                        url.searchParams.has('error') ||
                        url.hash.includes('access_token');

                    if (isAuthCallback) {
                        // Construct Internal Hash
                        let targetParams = url.search; // ?code=...
                        if (url.hash && url.hash.includes('access_token')) {
                            // Merge hash params if present
                            targetParams += (targetParams ? '&' : '?') + url.hash.replace(/^#/, '');
                        }
                        
                        const finalHash = `#/auth/callback${targetParams}`;
                        console.debug("[DEEP LINK] Routing to:", finalHash);
                        
                        // Force Router Update
                        window.location.hash = finalHash;
                    }
                } catch (e) {
                    console.error("[DEEP LINK] Parse error", e);
                }
            });
        };

        setupListeners();

        return () => {
            if (backListener) backListener.remove();
            if (urlListener) urlListener.remove();
        };
    }, [goBack, setShowFeedbackModal]); 

    // Attach Listeners with Polling Fallback
    useEffect(() => {
        console.debug("[ROUTER] mounted", { href: window.location.href, hash: window.location.hash });
        
        // Native Listener
        const onHashChange = () => handleHashChangeCore(window.location.hash, 'hashchange');
        window.addEventListener('hashchange', onHashChange);

        // SAFE Polling for Local Development only
        let pollInterval: ReturnType<typeof setInterval> | null = null;
        const isLocalhost = 
            window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1';

        if (isLocalhost) {
            pollInterval = setInterval(() => {
                const now = window.location.hash;
                if (now !== lastHashRef.current) {
                    handleHashChangeCore(now, 'poll');
                }
            }, 500); 
        }

        return () => {
            window.removeEventListener('hashchange', onHashChange);
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [handleHashChangeCore]);

    // Helper to detect if URL has Auth Parameters (Hash or Query)
    const hasMagicAuthPayload = useCallback(() => {
        const h = window.location.href;
        return (
            h.includes("access_token=") ||
            h.includes("refresh_token=") ||
            h.includes("code=") ||
            h.includes("type=magiclink") ||
            h.includes("type=recovery") ||
            h.includes("error=") ||
            h.includes("error_description=")
        );
    }, []);

    // Initial Boot & OAuth Detection
    useEffect(() => {
        if (!hasInitialized.current) {
            console.debug("[BOOT] href/hash/search", { href: window.location.href, hash: window.location.hash, search: window.location.search });

            // 1. Sanitize: Fix double-hash callbacks from OAuth providers immediately
            normalizeDoubleHashToQuery();

            // [ROUTER FIX] Handle path-based redirects from OAuth (e.g. /auth/callback)
            // Rewrite them to root (/) + hash so the SPA router takes over
            if (window.location.pathname === '/auth/callback') {
                const newUrl = window.location.origin + '/' + window.location.search + (window.location.hash || '#/auth/callback');
                try {
                    window.history.replaceState(null, '', newUrl);
                } catch(e) {
                    console.warn("[Router] replaceState failed", e);
                }
                console.debug("[ROUTER] Path rewrite: /auth/callback -> /");
            }

            // PHASE A: Magic Link & OAuth Token Detection
            // Check Payload after sanitization
            if (hasMagicAuthPayload()) {
                console.debug("[ROUTER] Auth payload detected → mounting callback view");
                // Force view to 'auth/callback' without overwriting the URL hash/query.
                setCurrentView('auth/callback');
                hasInitialized.current = true;
                return;
            }

            // Normal Boot Logic
            let initialHash = window.location.hash;
            if (!initialHash) {
                // Default route
                console.debug("[BOOT] deciding default route (empty hash)", { hash: window.location.hash });
                initialHash = '#/home';
                window.location.hash = initialHash;
            }
            
            handleHashChangeCore(initialHash, 'boot');
            hasInitialized.current = true;
        }
    }, [handleHashChangeCore, fromHash, hasMagicAuthPayload]);

    // Secondary Hydration for Deep Links
    useEffect(() => {
        if (!props.loadingData && hasInitialized.current) {
             // Only re-run if we are on a data-dependent view and topic is missing
             if (['topicDetail', 'quiz', 'chat', 'quizReview'].includes(currentViewRef.current) && !selectedTopic) {
                 console.debug("[ROUTER] Data loaded, re-evaluating deep link...");
                 handleHashChangeCore(window.location.hash, 'data-loaded');
             }
        }
    }, [props.loadingData, selectedTopic, handleHashChangeCore]);

    // Auth Redirects
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                if (ENABLE_PASSWORD_RECOVERY) {
                    navigateTo('resetPassword');
                } else {
                    console.warn("[AUTH] Password recovery event ignored (feature disabled).");
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [navigateTo]); 

    // Handle Auth Routing overrides
    useEffect(() => {
        if (props.authLoading) return;
        
        if (!props.user && !props.isGuest) {
            // Allow specific auth routes to persist
            const allowed = ['onboarding', 'auth/callback', 'resetPassword'];
            if (!allowed.some(v => window.location.hash.includes(v)) && currentView !== 'auth/callback') {
                // Otherwise let LoginView handle logic or do nothing
            }
        }
    }, [props.user, props.isGuest, props.authLoading, currentView]);

    // ROUTER GUARD: Logged in users should not be stuck on 'login' view
    useEffect(() => {
        // Prevent staying on '#/login' when authenticated
        if (isLoggedIn && currentView === 'login') {
            console.debug("[ROUTER] Authenticated on '/login' → redirect to 'home'");
            navigateTo('home');
        }
    }, [isLoggedIn, currentView, navigateTo]);

    // ROUTER GUARD: Redirect from onboarding if already onboarded (Fixes Blank Screen)
    useEffect(() => {
        if (currentView === 'onboarding' && props.isOnboarded) {
            console.debug("[ROUTER] Already onboarded, redirecting from #/onboarding to #/home");
            navigateTo('home');
        }
    }, [currentView, props.isOnboarded, navigateTo]);

    // Handle Floating Timer Log
    const handleFloatingLog = useCallback((minutes: number) => {
        const { topicId, topicName } = focusState;
        
        console.debug("[APP] handleFloatingLog", { topicId, minutes });

        // 1. Identify Topic
        const topic = topicId ? props.studyLog.find(t => t.id === topicId) : undefined;
        
        // 2. Always Log Global Session
        const displayTopic = topic?.topicName || topicName || "General Focus";
        const displaySubject = topic?.subject || "General";
        
        logGlobalSession(minutes, displayTopic, displaySubject);

        // 3. Update Topic Data (If matched)
        if (topic) {
            const currentTotal = topic.pomodoroTimeMinutes || 0;
            const newTime = currentTotal + minutes;
            // FIX: Use local ISO date instead of UTC
            const today = getLocalISODate();
            const newSession = { date: today, minutes: minutes };
            
            AnalyticsService.trackSession(props.userId, topic.id, topic.subjectId, today, minutes);

            const updatedTopic = {
                ...topic,
                pomodoroTimeMinutes: newTime,
                focusLogs: [...(topic.focusLogs || []), newSession]
            };
            props.handleUpdateTopic(updatedTopic);
        }
    }, [props.studyLog, focusState.topicId, focusState.topicName, props.userId, props.handleUpdateTopic]);

    // Import/Export Handlers
    const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (props.isGuest) {
            setRouterError(new Error("Restoring backups is reserved for registered accounts. Please sign up to import your data and sync across devices."));
            e.target.value = '';
            return;
        }
        const file = e.target.files?.[0];
        if (!file) return;

        // Peak at the first few bytes to detect format
        const peakSlice = file.slice(0, 500);
        const peakText = await peakSlice.text();
        const isV2Format = peakText.includes('"schemaVersion":"2.0.0"') || peakText.includes('"schemaVersion": "2.0.0"');
        const isLegacyJSON = !isV2Format;

        if (isLegacyJSON) {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const jsonStr = ev.target?.result as string;
                    const data = JSON.parse(jsonStr);
                    
                    if (data.schemaVersion && data.schemaVersion !== "1.0.0" && data.schemaVersion !== "1.1.0" && data.schemaVersion !== "1.2.0") {
                        console.warn("Legacy backup with unknown schema:", data.schemaVersion);
                    }
                    if (!Array.isArray(data.studyLog)) throw new Error("Invalid backup format.");
                    
                    // 1. Hydrate Notes: Merge separated notes back into topic objects for reliable import
                    const hydratedLog = data.studyLog.map((t: Topic) => ({
                        ...t,
                        shortNotes: data.notesByTopicId?.[t.id] || t.shortNotes || ""
                    }));

                    // 2. Restore Cropped Images (for Inline Rendering)
                    if (data.images) await batchSaveImages(data.images);
                    
                    // 3. Restore Original Source Images (for "View Original")
                    if (data.originalImages) await batchSaveImages(data.originalImages);

                    // 3.1 Restore Audio
                    if (data.audioByTopicId) await batchSaveAudio(data.audioByTopicId);

                    // 4. Restore Preferences (Overwrites)
                    if (data.preferences) {
                        if (data.preferences.ai) localStorage.setItem(`engram_ai_preferences_${props.userId}`, JSON.stringify(data.preferences.ai));
                        if (data.preferences.appMode) {
                            localStorage.setItem(`engramAppMode_${props.userId}`, data.preferences.appMode);
                            props.setAppMode(data.preferences.appMode);
                        }
                        if (data.preferences.themeColor) props.setCurrentTheme(data.preferences.themeColor);
                        if (data.preferences.themeIntensity) props.setThemeIntensity(data.preferences.themeIntensity);
                        if (data.preferences.dateTimeSettings) props.setDateTimeSettings(data.preferences.dateTimeSettings);
                        if (data.preferences.notificationSettings) props.setNotificationSettings(data.preferences.notificationSettings);
                        if (data.preferences.enabledTabs && Array.isArray(data.preferences.enabledTabs)) props.setEnabledTabs(data.preferences.enabledTabs);
                        if (data.preferences.fcFont) localStorage.setItem(`engram_fc_font_${props.userId}`, data.preferences.fcFont);
                        if (data.preferences.celebrated21Days) localStorage.setItem(`engram_21_day_celebrated_${props.userId}`, data.preferences.celebrated21Days);
                        if (data.preferences.podcastConfig) props.setPodcastConfig(data.preferences.podcastConfig);
                    }
                    
                    // 5. Restore Tasks, Matrix, Habits (SMART MERGE)
                    if (data.tasks) {
                        const localTasks = safeReadJSON(`engramTasks_${props.userId}`, []);
                        const mergedTasks = mergeTasksSmart(localTasks, data.tasks, 'text');
                        localStorage.setItem(`engramTasks_${props.userId}`, JSON.stringify(mergedTasks));
                    }

                    if (data.matrix) {
                        const localMatrix = safeReadJSON(`engramMatrix_${props.userId}`, []);
                        const mergedMatrix = mergeTasksSmart(localMatrix, data.matrix, 'text');
                        localStorage.setItem(`engramMatrix_${props.userId}`, JSON.stringify(mergedMatrix));
                    }

                    if (data.habits && Array.isArray(data.habits)) {
                        const mergedHabits = mergeHabits(props.habits, data.habits);
                        props.setHabits(mergedHabits);
                    }
                    
                    // 6. Restore Profile (Overwrites as per original spec)
                    if (data.userProfile && data.userProfile.name) props.setUserProfile(data.userProfile);
                    
                    // 7. Restore Observations (SMART MERGE)
                    if (data.observations && Array.isArray(data.observations)) {
                        const localObs = ObservationsService.getAll(props.userId);
                        const mergedObs = mergeObservations(localObs, data.observations);
                        ObservationsService.saveAll(props.userId, mergedObs);
                    }

                    // 8. Restore Global Pomodoro Logs
                    if (data.globalPomodoroLogs && Array.isArray(data.globalPomodoroLogs)) {
                        savePomodoroLogs(data.globalPomodoroLogs);
                    }

                    // 9. Restore Chat History
                    if (data.chatHistoryByTopicId) {
                        await batchSaveChatHistories(props.userId, data.chatHistoryByTopicId);
                    }

                    // 10. Restore Study Log (Smart Merge handled by hook)
                    await props.importStudyLog(hydratedLog, data.userSubjects);

                    // 11. Restore Flashcard History
                    if (data.flashcardHistory && Array.isArray(data.flashcardHistory)) {
                        const key = `engram-flashcard-history_${props.userId}`;
                        const localHistory = safeReadJSON(key, []);
                        const mergedHistory = mergeFlashcards(localHistory, data.flashcardHistory);
                        localStorage.setItem(key, JSON.stringify(mergedHistory));
                    }

                    // 12. Restore Test Series History
                    if (data.testSeriesHistory && Array.isArray(data.testSeriesHistory)) {
                        const key = `engram_test_series_history_${props.userId}`;
                        const localHistory = safeReadJSON(key, []);
                        const mergedHistory = [...localHistory, ...data.testSeriesHistory].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
                        localStorage.setItem(key, JSON.stringify(mergedHistory));
                    }

                    // 13. Restore Test Series Past Questions
                    if (data.testSeriesPastQuestions && Array.isArray(data.testSeriesPastQuestions)) {
                        const key = `engram_test_series_past_questions_${props.userId}`;
                        const localQuestions = safeReadJSON(key, []);
                        const mergedQuestions = [...new Set([...localQuestions, ...data.testSeriesPastQuestions])].slice(-100);
                        localStorage.setItem(key, JSON.stringify(mergedQuestions));
                    }
                    
                    // 14. Restore Diary
                    if (data.diary && Array.isArray(data.diary)) {
                        const key = `engram_diary_${props.userId}`;
                        const localDiary = safeReadJSON(key, []);
                        const mergedDiary = [...localDiary, ...data.diary].filter((v, i, a) => a.findIndex(D => D.id === v.id) === i);
                        localStorage.setItem(key, JSON.stringify(mergedDiary));
                    }

                    // 15. Restore Recent Exams
                    if (data.recentExams && Array.isArray(data.recentExams)) {
                        const key = `engram_recent_exams_${props.userId}`;
                        const localExams = safeReadJSON(key, []);
                        const mergedExams = [...localExams, ...data.recentExams].filter((v, i, a) => a.findIndex(e => e.id === v.id) === i);
                        localStorage.setItem(key, JSON.stringify(mergedExams));
                    }

                    // 16. Restore Analytics
                    if (data.analytics) {
                        const key = `engramCalendarAgg_${props.userId}`;
                        localStorage.setItem(key, JSON.stringify(data.analytics));
                    }
                    
                    // 17. Restore Test Series Language
                    if (data.preferences?.testSeriesLanguage) {
                         localStorage.setItem(`engram_test_series_language_${props.userId}`, data.preferences.testSeriesLanguage);
                    }
                    
                    setShowImportSuccessModal(true);
                } catch (err: unknown) {
                    console.error("Legacy Import failed:", err);
                    const message = err instanceof Error ? err.message : "Failed to parse legacy backup file.";
                    setRouterError(new Error(message));
                }
                e.target.value = '';
            };
            reader.readAsText(file);
            return;
        }

        // New V2 Streaming JSONL Import (Handles >2GB)
        try {
            const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB limit per read
            let offset = 0;
            let buffer = '';

            let studyLog: Topic[] = [];
            let userSubjects: Subject[] = [];
            const notesByTopicId: Record<string, string> = {};
            const chatHistoryByTopicId: Record<string, any[]> = {};
            const images: Record<string, string> = {};
            const originalImages: Record<string, string> = {};
            const audioByTopicId: Record<string, any> = {};

            const processLine = async (line: string) => {
                if (!line.trim()) return;
                const obj = JSON.parse(line);
                if (obj.type === "metadata") {
                    if (obj.schemaVersion !== "2.0.0") throw new Error("Unsupported chunked backup version.");
                } else if (obj.type === "studyLog") {
                    studyLog = obj.data || [];
                } else if (obj.type === "userSubjects") {
                    userSubjects = obj.data || [];
                } else if (obj.type === "note") {
                    notesByTopicId[obj.id] = obj.data;
                } else if (obj.type === "chatHistory") {
                    chatHistoryByTopicId[obj.id] = obj.data;
                } else if (obj.type === "image") {
                    images[obj.id] = obj.data;
                } else if (obj.type === "originalImage") {
                    originalImages[obj.id] = obj.data;
                } else if (obj.type === "audio") {
                    audioByTopicId[obj.id] = obj.data;
                } else if (obj.type === "preferences") {
                    const p = obj.data;
                    if (p.ai) localStorage.setItem(`engram_ai_preferences_${props.userId}`, JSON.stringify(p.ai));
                    if (p.appMode) { localStorage.setItem(`engramAppMode_${props.userId}`, p.appMode); props.setAppMode(p.appMode); }
                    if (p.themeColor) props.setCurrentTheme(p.themeColor);
                    if (p.themeIntensity) props.setThemeIntensity(p.themeIntensity);
                    if (p.dateTimeSettings) props.setDateTimeSettings(p.dateTimeSettings);
                    if (p.notificationSettings) props.setNotificationSettings(p.notificationSettings);
                    if (p.enabledTabs && Array.isArray(p.enabledTabs)) props.setEnabledTabs(p.enabledTabs);
                    if (p.fcFont) localStorage.setItem(`engram_fc_font_${props.userId}`, p.fcFont);
                    if (p.celebrated21Days) localStorage.setItem(`engram_21_day_celebrated_${props.userId}`, p.celebrated21Days);
                    if (p.testSeriesLanguage) localStorage.setItem(`engram_test_series_language_${props.userId}`, p.testSeriesLanguage);
                    if (p.podcastConfig) props.setPodcastConfig(p.podcastConfig);
                } else if (obj.type === "tasks") {
                    const localTasks = safeReadJSON(`engramTasks_${props.userId}`, []);
                    localStorage.setItem(`engramTasks_${props.userId}`, JSON.stringify(mergeTasksSmart(localTasks, obj.data, 'text')));
                } else if (obj.type === "matrix") {
                    const localMatrix = safeReadJSON(`engramMatrix_${props.userId}`, []);
                    localStorage.setItem(`engramMatrix_${props.userId}`, JSON.stringify(mergeTasksSmart(localMatrix, obj.data, 'text')));
                } else if (obj.type === "habits") {
                    if (Array.isArray(obj.data)) props.setHabits(mergeHabits(props.habits, obj.data));
                } else if (obj.type === "userProfile") {
                    if (obj.data && obj.data.name) props.setUserProfile(obj.data);
                } else if (obj.type === "observations") {
                    if (Array.isArray(obj.data)) ObservationsService.saveAll(props.userId, mergeObservations(ObservationsService.getAll(props.userId), obj.data));
                } else if (obj.type === "globalPomodoroLogs") {
                    if (Array.isArray(obj.data)) savePomodoroLogs(obj.data);
                } else if (obj.type === "flashcardHistory") {
                    if (Array.isArray(obj.data)) {
                        const key = `engram-flashcard-history_${props.userId}`;
                        localStorage.setItem(key, JSON.stringify(mergeFlashcards(safeReadJSON(key, []), obj.data)));
                    }
                } else if (obj.type === "testSeriesHistory") {
                    if (Array.isArray(obj.data)) {
                        const key = `engram_test_series_history_${props.userId}`;
                        const mergedHistory = [...safeReadJSON(key, []), ...obj.data].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
                        localStorage.setItem(key, JSON.stringify(mergedHistory));
                    }
                } else if (obj.type === "testSeriesPastQuestions") {
                    if (Array.isArray(obj.data)) {
                        const key = `engram_test_series_past_questions_${props.userId}`;
                        localStorage.setItem(key, JSON.stringify([...new Set([...safeReadJSON(key, []), ...obj.data])].slice(-100)));
                    }
                } else if (obj.type === "diary") {
                    if (Array.isArray(obj.data)) {
                        const key = `engram_diary_${props.userId}`;
                        const mergedDiary = [...safeReadJSON(key, []), ...obj.data].filter((v, i, a) => a.findIndex(D => D.id === v.id) === i);
                        localStorage.setItem(key, JSON.stringify(mergedDiary));
                    }
                } else if (obj.type === "recentExams") {
                    if (Array.isArray(obj.data)) {
                        const key = `engram_recent_exams_${props.userId}`;
                        const mergedExams = [...safeReadJSON(key, []), ...obj.data].filter((v, i, a) => a.findIndex(e => e.id === v.id) === i);
                        localStorage.setItem(key, JSON.stringify(mergedExams));
                    }
                } else if (obj.type === "analytics") {
                    if (obj.data) localStorage.setItem(`engramCalendarAgg_${props.userId}`, JSON.stringify(obj.data));
                }
                
                // Flush Images/Audio buffers if they get larger than threshold to free memory
                if (Object.keys(images).length > 20) {
                    await batchSaveImages(images);
                    for (const k in images) delete images[k];
                }
                if (Object.keys(originalImages).length > 20) {
                    await batchSaveImages(originalImages);
                    for (const k in originalImages) delete originalImages[k];
                }
                if (Object.keys(chatHistoryByTopicId).length > 20) {
                    await batchSaveChatHistories(props.userId, chatHistoryByTopicId);
                    for (const k in chatHistoryByTopicId) delete chatHistoryByTopicId[k];
                }
                if (Object.keys(audioByTopicId).length > 10) {
                    await batchSaveAudio(audioByTopicId);
                    for (const k in audioByTopicId) delete audioByTopicId[k];
                }
            };

            while (offset < file.size) {
                const slice = file.slice(offset, offset + CHUNK_SIZE);
                const textChunk = await slice.text();
                buffer += textChunk;
                
                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);
                    if (line) await processLine(line);
                }
                offset += CHUNK_SIZE;
            }
            
            if (buffer.trim()) {
                await processLine(buffer.trim());
            }

            // Flush remaining data
            if (Object.keys(images).length > 0) await batchSaveImages(images);
            if (Object.keys(originalImages).length > 0) await batchSaveImages(originalImages);
            if (Object.keys(chatHistoryByTopicId).length > 0) await batchSaveChatHistories(props.userId, chatHistoryByTopicId);
            if (Object.keys(audioByTopicId).length > 0) await batchSaveAudio(audioByTopicId);

            // Reconstruct notes inside studyLog
            const hydratedLog = studyLog.map((t: Topic) => ({
                ...t,
                shortNotes: notesByTopicId[t.id] || t.shortNotes || ""
            }));
            await props.importStudyLog(hydratedLog, userSubjects);

            setShowImportSuccessModal(true);
        } catch (err: any) {
            console.error("V2 Streaming Import failed:", err);
            setRouterError(new Error(err.message || "Failed to process backup stream."));
        }
        e.target.value = '';
    };

    const handleExportData = async () => {
        try {
            const sanitizedLog = props.studyLog.map(item => ({ ...item }));
            const topicIds = sanitizedLog.map(t => t.id);

            const generateBackupStream = async function* (): AsyncGenerator<string, void, unknown> {
                // V2 Chunked Format (JSON Lines) - No arbitrary size limit
                yield JSON.stringify({ type: 'metadata', schemaVersion: '2.0.0', appVersion: '1.4', timestamp: new Date().toISOString(), userId: props.userId, userProfile: props.userProfile, guestStartTs: props.isGuest ? getGuestStartTimestamp() : null }) + '\n';
                
                yield JSON.stringify({ type: 'userSubjects', data: props.userSubjects || [] }) + '\n';
                yield JSON.stringify({ type: 'studyLog', data: sanitizedLog || [] }) + '\n';
                
                // Fetch Bodies Incrementally
                const imageIds = new Set<string>();
                const captureRegex = /\[FIG_CAPTURE: (.*?) \|/g; 
                for (const id of topicIds) {
                    const note = await getTopicBodyFromIDB(props.userId, id);
                    if (note) {
                        const matches = [...note.matchAll(captureRegex)];
                        matches.forEach(m => imageIds.add(m[1]));
                        yield JSON.stringify({ type: 'note', id, data: note }) + '\n';
                    }
                }

                // Fetch Cropped Images (parsed from notes) incrementally
                for (const imgId of Array.from(imageIds)) {
                    const imgBase64 = await getImageFromIDB(imgId);
                    if (imgBase64) yield JSON.stringify({ type: 'image', id: imgId, data: imgBase64 }) + '\n';
                }

                // Fetch Original Source Images incrementally
                for (const id of topicIds) {
                    const origImages = await batchGetOriginalImages([id]);
                    for (const [k, v] of Object.entries(origImages)) {
                        yield JSON.stringify({ type: 'originalImage', id: k, data: v }) + '\n';
                    }
                }

                // Fetch Audio Data incrementally
                for (const id of topicIds) {
                    const audio = await batchGetAudio([id]);
                    if (audio[id]) yield JSON.stringify({ type: 'audio', id, data: audio[id] }) + '\n';
                }

                yield JSON.stringify({ type: 'observations', data: ObservationsService.getAll(props.userId) || [] }) + '\n';
                yield JSON.stringify({ type: 'globalPomodoroLogs', data: getPomodoroLogs() || [] }) + '\n';

                // Chat History Incrementally
                for (const id of topicIds) {
                    const chatLog = await getChatFromIDB(props.userId, id);
                    if (chatLog) yield JSON.stringify({ type: 'chatHistory', id, data: chatLog }) + '\n';
                }

                yield JSON.stringify({ type: 'flashcardHistory', data: safeReadJSON(`engram-flashcard-history_${props.userId}`, []) }) + '\n';
                yield JSON.stringify({ type: 'testSeriesHistory', data: safeReadJSON(`engram_test_series_history_${props.userId}`, safeReadJSON('engram_test_series_history', [])) }) + '\n';
                yield JSON.stringify({ type: 'testSeriesPastQuestions', data: safeReadJSON(`engram_test_series_past_questions_${props.userId}`, safeReadJSON('engram_test_series_past_questions', [])) }) + '\n';
                yield JSON.stringify({ type: 'diary', data: safeReadJSON(`engram_diary_${props.userId}`, []) }) + '\n';
                yield JSON.stringify({ type: 'recentExams', data: safeReadJSON(`engram_recent_exams_${props.userId}`, []) }) + '\n';
                yield JSON.stringify({ type: 'analytics', data: safeReadJSON(`engramCalendarAgg_${props.userId}`, null) }) + '\n';
                yield JSON.stringify({ type: 'habits', data: props.habits || [] }) + '\n';
                yield JSON.stringify({ type: 'tasks', data: safeReadJSON(`engramTasks_${props.userId}`, []) }) + '\n';
                yield JSON.stringify({ type: 'matrix', data: safeReadJSON(`engramMatrix_${props.userId}`, []) }) + '\n';

                let aiPrefs = {};
                try {
                    const raw = localStorage.getItem(`engram_ai_preferences_${props.userId}`);
                    if (raw) aiPrefs = JSON.parse(raw);
                } catch { /* ignore */ }

                yield JSON.stringify({
                    type: 'preferences',
                    data: {
                        ai: aiPrefs,
                        appMode: localStorage.getItem(`engramAppMode_${props.userId}`) || 'system',
                        themeColor: props.currentTheme,
                        themeIntensity: props.themeIntensity,
                        dateTimeSettings: props.dateTimeSettings,
                        notificationSettings: props.notificationSettings,
                        enabledTabs: props.enabledTabs,
                        fcFont: localStorage.getItem(`engram_fc_font_${props.userId}`),
                        celebrated21Days: localStorage.getItem(`engram_21_day_celebrated_${props.userId}`),
                        testSeriesLanguage: localStorage.getItem(`engram_test_series_language_${props.userId}`),
                        podcastConfig: props.podcastConfig,
                    }
                }) + '\n';
            };

            const fileName = `engram_backup_${new Date().toISOString().split('T')[0]}.jsonl`;
            await downloadLargeJSONStream(generateBackupStream(), fileName);
            
        } catch (e) {
            console.error("Export failed:", e);
            setRouterError(new Error("Export failed. Please check console for details."));
        }
    };

    // Render Logic
    if (props.authLoading) return null;
    if (routerError) return <ErrorCard error={routerError} resetErrorBoundary={() => setRouterError(null)} />;

    const { expired: guestExpired } = checkGuestStatus();
    if (props.isGuest && guestExpired) {
        return <ErrorCard error={new Error('Your 15-day guest preview has expired. Please sign in to continue.')} resetErrorBoundary={() => props.onSignOut()} />;
    }

    if (currentView === 'auth/callback') return <AuthCallbackView navigateTo={navigateTo} setUserProfile={props.setUserProfile} setIsOnboarded={props.setIsOnboarded} themeColor={props.currentTheme} />;
    if (currentView === 'resetPassword') return ENABLE_PASSWORD_RECOVERY ? <ResetPasswordView navigateTo={navigateTo} themeColor={props.currentTheme} /> : <LoginView onComplete={props.onLoginComplete} />;
    if (!isLoggedIn) return <LoginView onComplete={props.onLoginComplete} onSignInSuccess={() => navigateTo('home')} />;
    
    if (props.checkingProfile) {
        return (
            <div className="flex items-center justify-center min-h-[100dvh] bg-background">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }
    
    if (props.user && !props.isGuest && !props.isOnboarded) return <OnboardingView onComplete={props.onOnboardingComplete} />;

    return (
        <AppShell
            user={props.user}
            isGuest={props.isGuest}
            currentView={currentView}
            themeColor={props.currentTheme}
            themeIntensity={props.themeIntensity}
            appMode={props.appMode}
            userProfile={props.userProfile}
            navigateTo={navigateTo}
            enabledTabs={props.enabledTabs}
            showFeedbackModal={showFeedbackModal}
            setShowFeedbackModal={setShowFeedbackModal}
            showImportSuccessModal={showImportSuccessModal}
            permissionsGranted={props.permissionsGranted}
            handleAllowPermissions={props.handleAllowPermissions}
            podcast={props.podcast}
            focusState={focusState}
            handleFloatingLog={handleFloatingLog}
            selectedTopic={selectedTopic}
            isPodcastOpen={isPodcastOverlayOpen}
            setIsPodcastOpen={(open) => { if(open) navigateTo('podcast'); else goBack(); }}
            podcastOverlay={<PodcastFullView studyLog={props.studyLog} onUpdateTopic={props.handleUpdateTopic} themeColor={props.currentTheme} onMinimize={goBack} state={props.podcast.state} controls={props.podcast.controls} defaultLanguage={props.podcastConfig.language} />}
            hideTabBar={false}
        >
            <div style={{ display: currentView === 'home' ? 'flex' : 'none' }} className="flex-col flex-1 w-full relative">
                <HomeView studyLog={props.studyLog} allSubjects={props.userSubjects} navigateTo={navigateTo} userId={props.userId} themeColor={props.currentTheme} userProfile={props.userProfile} loading={props.loadingData} />
            </div>
            {currentView === 'subjects' && <SubjectsView allSubjects={props.userSubjects} studyLog={props.studyLog} navigateTo={navigateTo} onAddSubject={props.handleAddSubject} onUpdateSubject={props.handleUpdateSubject} onDeleteSubject={props.handleDeleteSubject} onDeleteTopic={props.handleDeleteTopic} onAddTopic={props.handleAddTopic} themeColor={props.currentTheme} />}
            {currentView === 'topicDetail' && <TopicDetailView topic={selectedTopic} userId={props.userId} navigateTo={navigateTo} onUpdateTopic={props.handleUpdateTopic} onDeleteTopic={props.handleDeleteTopic} themeColor={props.currentTheme} defaultLanguage={props.podcastConfig.language} />}
            {currentView === 'quiz' && <QuizView topic={selectedTopic} userId={props.userId} navigateTo={navigateTo} onUpdateTopic={props.handleUpdateTopic} themeColor={props.currentTheme} onLockTabs={setIsQuizActive} />}
            {currentView === 'quizReview' && (
                isHydratingQuizReview 
                ? <div className="p-10 text-center text-gray-500 animate-pulse">Analyzing Results...</div>
                : selectedQuizReviewData 
                    ? (() => {
                        console.debug("[ROUTER] Rendering QuizReview", {
                            topic: selectedQuizReviewData.topic?.topicName,
                            questionsCount: selectedQuizReviewData.quizAttempt?.questions?.length,
                            repetitionNumber: selectedQuizReviewData.repetitionNumber
                        });
                        return <QuizReview 
                            topic={selectedQuizReviewData.topic} 
                            quizData={Array.isArray(selectedQuizReviewData.quizAttempt?.questions) ? selectedQuizReviewData.quizAttempt.questions : []} 
                            answers={(Array.isArray(selectedQuizReviewData.quizAttempt?.questions) ? selectedQuizReviewData.quizAttempt.questions : []).map((q, i) => ({ 
                                qIndex: i, 
                                selected: q?.userSelected, 
                                correct: q?.correct_answer_letter || q?.correctAnswer || '' 
                            }))} 
                            timeTaken={selectedQuizReviewData.quizAttempt?.timeTakenSeconds || 0} 
                            navigateTo={navigateTo} 
                            repetitionNumber={selectedQuizReviewData.repetitionNumber} 
                            themeColor={props.currentTheme} 
                        />;
                    })()
                    : <ErrorCard error={new Error("Failed to load quiz results.")} resetErrorBoundary={() => navigateTo('home')} />
            )}
            {currentView === 'chat' && <ChatView topic={selectedTopic} userId={props.userId} navigateTo={navigateTo} themeColor={props.currentTheme} />}
            {currentView === 'settings' && <SettingsView userProfile={props.userProfile} userId={props.userId} userEmail={props.user?.email} isGuest={props.isGuest} currentTheme={props.currentTheme} navigateTo={navigateTo} setShowFeedbackModal={setShowFeedbackModal} handleExportData={handleExportData} handleImportData={handleImportData} appMode={props.appMode} setAppMode={props.setAppMode} onSignOut={props.onSignOut} onDeleteProfile={props.onDeleteProfile} level={Math.floor((props.earnedBadges?.length || 0) / 3) + 1} badgeCount={props.earnedBadges?.length || 0} streak={props.currentStreak} onManualSync={props.onManualSync} isSyncing={props.isSyncing} />}
            {currentView === 'profile' && <ProfileView userId={props.userId} studyLog={props.studyLog} userProfile={props.userProfile} onUpdateProfile={props.setUserProfile} habits={props.habits} onUpdateHabits={props.setHabits} navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} availableProfiles={props.profiles} onSwitchProfile={props.onSwitchProfile} onAddProfile={props.onAddProfile} onSignOut={props.onSignOut} />}
            {currentView === 'topicList' && <TopicListView title={topicListData.title} topics={topicListData.topics} navigateTo={navigateTo} themeColor={props.currentTheme} />}
            {currentView === 'studyBreakdown' && <StudyBreakdownView studyLog={props.studyLog} initialFilter={breakdownFilter} navigateTo={navigateTo} themeColor={props.currentTheme} />}
            {currentView === 'aiFeatures' && <AiFeaturesView navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} />}
            {currentView === 'tabBarSettings' && <TabBarConfigView enabledTabIds={props.enabledTabs} onToggleTab={(id) => { if (props.enabledTabs.includes(id)) { props.setEnabledTabs(props.enabledTabs.filter(t => t !== id)); } else { props.setEnabledTabs([...props.enabledTabs, id]); } }} onReorderTabs={props.setEnabledTabs} navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} />}
            {currentView === 'appearance' && <AppearanceView currentTheme={props.currentTheme} setCurrentTheme={props.setCurrentTheme} themeIntensity={props.themeIntensity} setThemeIntensity={props.setThemeIntensity} goBack={goBack} />}
            {currentView === 'dateTimeSettings' && <DateTimeSettingsView settings={props.dateTimeSettings} onUpdateSettings={props.setDateTimeSettings} navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} />}
            {currentView === 'soundsNotifications' && <SoundsNotificationsView settings={props.notificationSettings} onUpdateSettings={props.setNotificationSettings} navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} />}
            {currentView === 'widgets' && <WidgetsView studyLog={props.studyLog} habits={props.habits} navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} />}
            {currentView === 'podcastSettings' && <PodcastSettingsView config={props.podcastConfig} onUpdate={props.setPodcastConfig} navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} studyLog={props.studyLog} onPlayTopic={(t) => { props.podcast.controls.playTopic(t); navigateTo('podcast'); }} onUpdateTopic={props.handleUpdateTopic} />}
            {currentView === 'flashcardHub' && <FlashcardHubView studyLog={props.studyLog} userId={props.userId} navigateTo={navigateTo} themeColor={props.currentTheme} goBack={goBack} />}
            {currentView === 'testSeries' && <TestSeriesView userId={props.userId} navigateTo={navigateTo} themeColor={props.currentTheme} onLockTabs={setIsTestSeriesActive} />}
            {currentView === 'diary' && <DiaryView userId={props.userId} themeColor={props.currentTheme} />}
            {currentView === 'about' && <AboutView navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} />}
            {currentView === 'terms' && <TermsView navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} />}
            {currentView === 'privacy' && <PrivacyView navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} />}
            {currentView === 'licenses' && <LicensesView navigateTo={navigateTo} goBack={goBack} themeColor={props.currentTheme} />}
            {currentView === 'calendar' && <CalendarView themeColor={props.currentTheme} settings={props.dateTimeSettings} studyLog={props.studyLog} userId={props.userId} />}
            {currentView === 'task' && <TaskView themeColor={props.currentTheme} settings={props.dateTimeSettings} userId={props.userId} />}
            {currentView === 'matrix' && <EisenhowerMatrixView themeColor={props.currentTheme} userId={props.userId} />}
            {currentView === 'pomodoro' && <PomodoroFullView themeColor={props.currentTheme} navigateTo={navigateTo} />}
            {currentView === 'pomoCalendar' && <PomoHistoryView themeColor={props.currentTheme} navigateTo={navigateTo} />}
            {currentView === 'habit' && <HabitTrackerView themeColor={props.currentTheme} habits={props.habits} onUpdateHabits={props.setHabits} />}
            {currentView === 'observations' && <ObservationsView userId={props.userId} themeColor={props.currentTheme} navigateTo={navigateTo} />}
            {currentView === 'search' && <SearchView themeColor={props.currentTheme} studyLog={props.studyLog} navigateTo={navigateTo} />}
            {currentView === 'calculator' && <CalculatorView themeColor={props.currentTheme} themeIntensity={props.themeIntensity} />}
        </AppShell>
    );
};
