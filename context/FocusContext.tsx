
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AMBIENT_SOUNDS } from '../constants';
import { scheduleFinishNotification, cancelFinishNotification } from '../utils/notifications';

interface FocusState {
    mode: 'stopwatch' | 'pomodoro';
    duration: number; // in minutes (target for pomodoro)
    elapsed: number; // seconds accumulated
    isRunning: boolean;
    topicId: string | null;
    topicName: string | null;
    activeSoundId: string | null;
}

interface FocusContextType extends FocusState {
    startSession: (topicId: string, topicName: string) => void;
    pauseSession: () => void;
    resumeSession: () => void;
    resetSession: () => void;
    setMode: (mode: 'stopwatch' | 'pomodoro') => void;
    setSessionDuration: (minutes: number) => void;
    setActiveSoundId: (id: string | null) => void;
    logAndReset: () => number; // Returns minutes
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

export const FocusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Initial state from localStorage or defaults
    const [mode, setModeState] = useState<'stopwatch' | 'pomodoro'>(() => 
        (localStorage.getItem('focus_mode') as any) || 'stopwatch');
    const [duration, setDurationState] = useState<number>(() => 
        parseInt(localStorage.getItem('focus_duration') || '25'));
    const [elapsed, setElapsed] = useState<number>(() => 
        parseFloat(localStorage.getItem('focus_elapsed') || '0'));
    const [isRunning, setIsRunning] = useState<boolean>(() => 
        localStorage.getItem('focus_running') === 'true');
    const [topicId, setTopicId] = useState<string | null>(() => 
        localStorage.getItem('focus_topicId') || null);
    const [topicName, setTopicName] = useState<string | null>(() => 
        localStorage.getItem('focus_topicName') || null);
    const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
    
    // We store the timestamp of the last "tick" or start to calculate real time
    const lastTickRef = useRef<number>(parseFloat(localStorage.getItem('focus_lastTick') || '0'));
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Persist helpers
    useEffect(() => localStorage.setItem('focus_mode', mode), [mode]);
    useEffect(() => localStorage.setItem('focus_duration', duration.toString()), [duration]);
    useEffect(() => localStorage.setItem('focus_elapsed', elapsed.toString()), [elapsed]);
    useEffect(() => localStorage.setItem('focus_running', String(isRunning)), [isRunning]);
    useEffect(() => {
        if(topicId) localStorage.setItem('focus_topicId', topicId);
        else localStorage.removeItem('focus_topicId');
    }, [topicId]);
    useEffect(() => {
        if(topicName) localStorage.setItem('focus_topicName', topicName);
        else localStorage.removeItem('focus_topicName');
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
                        localStorage.setItem('focus_running', 'false');
                        cancelFinishNotification(); // Clear any pending schedule
                        // Return exactly the duration to avoid overshoot visual
                        return duration * 60;
                    }
                    return next;
                });
                
                // Save tick timestamp for resilience (page reload)
                localStorage.setItem('focus_lastTick', now.toString());
            };

            worker.postMessage('start');
        } else {
            // Not running, reset tick reference
            lastTickRef.current = 0;
            localStorage.setItem('focus_lastTick', '0');
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
        const savedTick = parseFloat(localStorage.getItem('focus_lastTick') || '0');
        const wasRunning = localStorage.getItem('focus_running') === 'true';
        
        if (wasRunning && savedTick > 0) {
            const now = Date.now();
            const delta = (now - savedTick) / 1000;
            if (delta > 0 && delta < 86400) { // If delta < 1 day, assume valid catch-up
                setElapsed(prev => prev + delta); // Catch up the time missed while app was unloaded/frozen
            }
        }
    }, []);

    const startSession = (id: string, name: string) => {
        // If switching topics, reset first
        if (id !== topicId) {
            setElapsed(0);
        }
        setTopicId(id);
        setTopicName(name);
        setIsRunning(true);
        lastTickRef.current = Date.now();

        // Schedule notification for background completion
        if (mode === 'pomodoro') {
            const secondsRemaining = (duration * 60) - (id !== topicId ? 0 : elapsed);
            scheduleFinishNotification(secondsRemaining);
        }
    };

    const pauseSession = () => {
        setIsRunning(false);
        cancelFinishNotification();
    };
    
    const resumeSession = () => {
        setIsRunning(true);
        lastTickRef.current = Date.now();
        
        // Reschedule based on current elapsed time
        if (mode === 'pomodoro') {
            const secondsRemaining = (duration * 60) - elapsed;
            scheduleFinishNotification(secondsRemaining);
        }
    };

    const resetSession = () => {
        setIsRunning(false);
        setElapsed(0);
        setTopicId(null);
        setTopicName(null);
        lastTickRef.current = 0;
        localStorage.setItem('focus_lastTick', '0');
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
        resetSession();
        return mins;
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

    return (
        <FocusContext.Provider value={{
            mode, duration, elapsed, isRunning, topicId, topicName, activeSoundId,
            startSession, pauseSession, resumeSession, resetSession, setMode, setSessionDuration, setActiveSoundId, logAndReset, formatTime
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
