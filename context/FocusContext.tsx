
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AMBIENT_SOUNDS } from '../constants';
import { scheduleFinishNotification, cancelFinishNotification } from '../utils/notifications';
import { Preferences } from '@capacitor/preferences';
import OverlayTimer from '../plugins/OverlayTimer';
import { Capacitor } from '@capacitor/core';
import { logPomodoroSession, logTopicSession } from '../utils/sessionLog';

export type TimerType = 'pomodoro' | 'subject';

interface FocusState {
    type: TimerType;
    mode: 'stopwatch' | 'pomodoro'; // Keep for backwards compatibility within Pomodoro UI
    duration: number; // in minutes (target for pomodoro)
    elapsed: number; // seconds accumulated
    isRunning: boolean;
    sessionTitle: string | null; // For pomodoro
    subjectId: string | null;    // For subject
    topicId: string | null;      // For subject
    topicName: string | null;    // UI convenience
    activeSoundId: string | null;
}

interface FocusContextType extends FocusState {
    startPomodoro: (title: string, durationMinutes: number) => void;
    startSubjectTimer: (subjectId: string, topicId: string, topicName: string) => void;
    pauseSession: () => void;
    resumeSession: () => void;
    resetSession: () => void;
    restartCurrentSession: () => void;
    setMode: (mode: 'stopwatch' | 'pomodoro') => void;
    setSessionDuration: (minutes: number) => void;
    setActiveSoundId: (id: string | null) => void;
    logAndReset: () => void; // Unify logging inside Context
    formatTime: (seconds: number) => string;
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

// Worker script to run timer in background thread without throttling
const workerBlob = new Blob([`
    let timer = null;
    self.onmessage = function(e) {
        if (e.data === 'start') {
            if (timer) clearInterval(timer);
            timer = setInterval(() => {
                self.postMessage('tick');
            }, 1000);
        } else if (e.data === 'stop') {
            if (timer) clearInterval(timer);
            timer = null;
        }
    };
`], { type: 'application/javascript' });

const workerUrl = URL.createObjectURL(workerBlob);

export const FocusProvider: React.FC<{ children: React.ReactNode, userId: string }> = ({ children, userId }) => {
    const getFocusKey = useCallback((key: string) => `focus_${key}_${userId}`, [userId]);

    // Initial state from localStorage or defaults
    const [timerType, setTimerType] = useState<TimerType>(() => 
        (localStorage.getItem(`focus_timerType_${userId}`) as TimerType | null) || 'pomodoro');
    const [mode, setModeState] = useState<'stopwatch' | 'pomodoro'>(() => 
        (localStorage.getItem(`focus_mode_${userId}`) as 'stopwatch' | 'pomodoro' | null) || 'stopwatch');
    const [duration, setDurationState] = useState<number>(() => 
        parseInt(localStorage.getItem(`focus_duration_${userId}`) || '25'));
    const [elapsed, setElapsed] = useState<number>(() => 
        parseFloat(localStorage.getItem(`focus_elapsed_${userId}`) || '0'));
    const [isRunning, setIsRunning] = useState<boolean>(() => 
        localStorage.getItem(`focus_running_${userId}`) === 'true');
    const [sessionTitle, setSessionTitle] = useState<string | null>(() => 
        localStorage.getItem(`focus_sessionTitle_${userId}`) || null);
    const [subjectId, setSubjectId] = useState<string | null>(() => 
        localStorage.getItem(`focus_subjectId_${userId}`) || null);
    const [topicId, setTopicId] = useState<string | null>(() => 
        localStorage.getItem(`focus_topicId_${userId}`) || null);
    const [topicName, setTopicName] = useState<string | null>(() => 
        localStorage.getItem(`focus_topicName_${userId}`) || null);
    const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
    
    // We store the timestamp of the last "tick" or start to calculate real time
    const lastTickRef = useRef<number>(parseFloat(localStorage.getItem(`focus_lastTick_${userId}`) || '0'));
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Persist helpers
    useEffect(() => localStorage.setItem(getFocusKey('timerType'), timerType), [timerType]);
    useEffect(() => localStorage.setItem(getFocusKey('mode'), mode), [mode]);
    useEffect(() => localStorage.setItem(getFocusKey('duration'), duration.toString()), [duration]);
    useEffect(() => localStorage.setItem(getFocusKey('elapsed'), elapsed.toString()), [elapsed]);
    useEffect(() => localStorage.setItem(getFocusKey('running'), String(isRunning)), [isRunning]);
    useEffect(() => {
        if(sessionTitle) localStorage.setItem(getFocusKey('sessionTitle'), sessionTitle);
        else localStorage.removeItem(getFocusKey('sessionTitle'));
    }, [sessionTitle]);
    useEffect(() => {
        if(subjectId) localStorage.setItem(getFocusKey('subjectId'), subjectId);
        else localStorage.removeItem(getFocusKey('subjectId'));
    }, [subjectId]);
    useEffect(() => {
        if(topicId) localStorage.setItem(getFocusKey('topicId'), topicId);
        else localStorage.removeItem(getFocusKey('topicId'));
    }, [topicId]);
    useEffect(() => {
        if(topicName) localStorage.setItem(getFocusKey('topicName'), topicName);
        else localStorage.removeItem(getFocusKey('topicName'));
    }, [topicName]);

    // Audio Logic
    useEffect(() => {
        if (!activeSoundId) {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            return;
        }

        const sound = AMBIENT_SOUNDS.find(s => s.id === activeSoundId);
        if (sound) {
            const setupAudio = async () => {
                let src = sound.url;
                // Try cache
                if ('caches' in window) {
                    try {
                        const cache = await caches.open('engram-sound-cache');
                        const response = await cache.match(sound.url);
                        if (response) {
                            const blob = await response.blob();
                            src = URL.createObjectURL(blob);
                        }
                    } catch(e) { console.warn("Cache play failed", e); }
                }

                if (audioRef.current) {
                    audioRef.current.pause();
                }
                
                audioRef.current = new Audio(src);
                audioRef.current.loop = true;

                if (isRunning) {
                    audioRef.current.play().catch(console.error);
                }
            };
            setupAudio();
        }
    }, [activeSoundId]);

    // Sync Audio Play/Pause with Timer State
    useEffect(() => {
        if (audioRef.current) {
            if (isRunning) {
                audioRef.current.play().catch(console.error);
            } else {
                audioRef.current.pause();
            }
        }
    }, [isRunning]);

    // Timer Logic with Web Worker
    useEffect(() => {
        let worker: Worker | null = null;

        if (isRunning) {
            // Create worker instance
            worker = new Worker(workerUrl);

            // If we just loaded/started, ensure lastTick is now
            if (lastTickRef.current === 0) {
                lastTickRef.current = Date.now();
            }

            worker.onmessage = () => {
                const now = Date.now();
                // Calculate accurate delta using wall clock time
                let delta = (now - lastTickRef.current) / 1000;
                
                // Safety: prevent negative delta if system clock changes backwards
                if (delta < 0) delta = 0;
                
                lastTickRef.current = now;
                
                // Update elapsed
                setElapsed(prev => {
                    const next = prev + delta;
                    // If pomodoro and time is up
                    if (mode === 'pomodoro' && next >= duration * 60) {
                        setIsRunning(false);
                        localStorage.setItem(getFocusKey('running'), 'false');
                        cancelFinishNotification(); // Clear any pending schedule
                        // Return exactly the duration to avoid overshoot visual
                        return duration * 60;
                    }
                    
                    let secondsToShow = next;
                    if (mode === 'pomodoro') {
                        secondsToShow = Math.max(0, (duration * 60) - next);
                    }
                    
                    if (Capacitor.isNativePlatform()) {
                        OverlayTimer.updateTimer({ time: Math.floor(secondsToShow) }).catch(console.error);
                    }
                    
                    return next;
                });
                
                // Save tick timestamp for resilience (page reload)
                localStorage.setItem(getFocusKey('lastTick'), now.toString());
            };

            worker.postMessage('start');
            if (Capacitor.isNativePlatform()) {
                let secondsToShow = elapsed;
                if (mode === 'pomodoro') {
                    secondsToShow = Math.max(0, (duration * 60) - elapsed);
                }
                const m = Math.floor(secondsToShow / 60);
                const s = Math.floor(secondsToShow % 60);
                const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                Preferences.set({ key: 'pomodoroTime', value: formatted }).catch(console.error);
                OverlayTimer.startTimer({ 
                    type: timerType, 
                    title: sessionTitle || topicName || 'Focus Timer' 
                }).catch(console.error);
            }
        } else {
            // Not running, reset tick reference
            lastTickRef.current = 0;
            localStorage.setItem(getFocusKey('lastTick'), '0');
            if (Capacitor.isNativePlatform()) {
                OverlayTimer.stopTimer().catch(console.error);
                Preferences.remove({ key: 'pomodoroTime' }).catch(console.error);
            }
        }

        return () => {
            if (worker) {
                worker.postMessage('stop');
                worker.terminate();
            }
        };
    }, [isRunning, mode, duration]);

    // Recover from background throttling/tab closes (Resume logic)
    useEffect(() => {
        const savedTick = parseFloat(localStorage.getItem(getFocusKey('lastTick')) || '0');
        const wasRunning = localStorage.getItem(getFocusKey('running')) === 'true';
        
        if (wasRunning && savedTick > 0) {
            const now = Date.now();
            const delta = (now - savedTick) / 1000;
            if (delta > 0 && delta < 86400) { // If delta < 1 day, assume valid catch-up
                setElapsed(prev => prev + delta); // Catch up the time missed while app was unloaded/frozen
            }
        }
    }, [getFocusKey]);

    const startPomodoro = (title: string, durationMinutes: number) => {
        setTimerType('pomodoro');
        setMode('pomodoro'); // Sync mode
        if (title !== sessionTitle) {
            setElapsed(0);
        }
        setSessionTitle(title);
        setDurationState(durationMinutes);
        setSubjectId(null);
        setTopicId(null);
        setTopicName(null);
        setIsRunning(true);
        lastTickRef.current = Date.now();

        const secondsRemaining = (durationMinutes * 60) - (title !== sessionTitle ? 0 : elapsed);
        scheduleFinishNotification(secondsRemaining);
        
        if (Capacitor.isNativePlatform()) {
             console.log("[FocusContext] Calling OverlayTimer.startTimer for pomodoro");
             OverlayTimer.startTimer({ 
                 type: 'pomodoro', 
                 title: title || 'Focus Timer' 
             }).catch(console.error);
        }
    };

    const startSubjectTimer = (sId: string, tId: string, tName: string) => {
        setTimerType('subject');
        setMode('stopwatch'); // Subject timers act as stopwatches by default
        if (tId !== topicId) {
            setElapsed(0);
        }
        setSubjectId(sId);
        setTopicId(tId);
        setTopicName(tName);
        setSessionTitle(null);
        setIsRunning(true);
        lastTickRef.current = Date.now();
        
        if (Capacitor.isNativePlatform()) {
             console.log("[FocusContext] Calling OverlayTimer.startTimer for subject");
             OverlayTimer.startTimer({ 
                 type: 'subject', 
                 title: tName || 'Subject Timer' 
             }).catch(console.error);
        }
        cancelFinishNotification();
    };

    const pauseSession = () => {
        setIsRunning(false);
        cancelFinishNotification();
    };
    
    const resumeSession = () => {
        setIsRunning(true);
        lastTickRef.current = Date.now();
        
        // Reschedule based on current elapsed time
        if (timerType === 'pomodoro' || mode === 'pomodoro') {
            const secondsRemaining = (duration * 60) - elapsed;
            scheduleFinishNotification(secondsRemaining);
        }
    };

    const restartCurrentSession = () => {
        setIsRunning(false);
        setElapsed(0);
        lastTickRef.current = 0;
        localStorage.setItem(getFocusKey('lastTick'), '0');
        cancelFinishNotification();
    };

    const resetSession = () => {
        setIsRunning(false);
        setElapsed(0);
        setTopicId(null);
        setTopicName(null);
        setSubjectId(null);
        setSessionTitle(null);
        lastTickRef.current = 0;
        localStorage.setItem(getFocusKey('lastTick'), '0');
        cancelFinishNotification();
    };

    const logAndReset = () => {
        let currentElapsed = elapsed;
        // Capture fractional seconds if running, so logging is instantaneous
        if (isRunning && lastTickRef.current > 0) {
            const now = Date.now();
            const delta = (now - lastTickRef.current) / 1000;
            if (delta > 0 && delta < 86400) {
                currentElapsed += delta;
            }
        }

        const mins = currentElapsed / 60;
        
        // Actually log to the correct subsystem based on timerType
        if (timerType === 'pomodoro') {
            logPomodoroSession(mins, sessionTitle || 'General Focus');
        } else if (timerType === 'subject' && topicName) {
            // Need subject name, for now fallback to ID if we don't have it easily or use generic 'Subject'
            // To be precise we might want the subject name, but logGlobalSession accepts 'subject'.
            logTopicSession(mins, topicName, subjectId || 'Unknown');
        }
        
        resetSession();
    };

    const setMode = (m: 'stopwatch' | 'pomodoro') => {
        setModeState(m);
        // If mode changes, cancel any pending pomodoro alerts
        cancelFinishNotification();
    };
    
    const setSessionDuration = (min: number) => {
        setDurationState(min);
        // If duration changes while running, we should technically reschedule, 
        // but for simplicity we rely on the user pausing/restarting to pick up the new duration cleanly.
    };

    const formatTime = (totalSeconds: number) => {
        let secondsToShow = totalSeconds;
        if (mode === 'pomodoro') {
            secondsToShow = Math.max(0, (duration * 60) - totalSeconds);
        }

        const m = Math.floor(secondsToShow / 60);
        const s = Math.floor(secondsToShow % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    useEffect(() => {
        const handleWidgetStart = () => {
            // Check if already running so we don't restart unnecessarily
            if (!isRunning) {
                startPomodoro('Focus Timer', 25);
            }
        };
        window.addEventListener('start_widget_timer', handleWidgetStart);
        return () => window.removeEventListener('start_widget_timer', handleWidgetStart);
    }, [isRunning]);

    useEffect(() => {
        let listener: any = null;
        if (Capacitor.isNativePlatform()) {
            OverlayTimer.addListener('timerStateChanged', (info: any) => {
                const state = info.state;
                console.log("[FocusContext] Received sync from Overlay:", state);
                if (state === 'paused') {
                    setIsRunning(false);
                    cancelFinishNotification();
                } else if (state === 'resumed') {
                    setIsRunning(true);
                    lastTickRef.current = Date.now();
                } else if (state === 'reset') {
                    restartCurrentSession();
                } else if (state === 'stopped') {
                    logAndReset();
                }
            }).then((l: any) => listener = l);
        }
        
        return () => {
            if (listener) listener.remove();
        }
    }, [restartCurrentSession, logAndReset]);

    return (
        <FocusContext.Provider value={{
            type: timerType,
            mode, duration, elapsed, isRunning, 
            sessionTitle, subjectId, topicId, topicName, activeSoundId,
            startPomodoro, startSubjectTimer, pauseSession, resumeSession, resetSession, restartCurrentSession, setMode, setSessionDuration, setActiveSoundId, logAndReset, formatTime
        }}>
            {children}
        </FocusContext.Provider>
    );
};

export const useFocus = () => {
    const context = useContext(FocusContext);
    if (context === undefined) throw new Error("useFocus must be used within FocusProvider");
    return context;
};
