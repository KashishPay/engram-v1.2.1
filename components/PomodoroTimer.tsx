
import React, { useState, useEffect, useRef } from 'react';
import { RotateCw, Play, Pause, Coffee, Timer as TimerIcon, Settings2, X, Music, CheckCircle2, Bell } from 'lucide-react';
import { Card } from './Card';
import { useFocus } from '../context/FocusContext';
import { AMBIENT_SOUNDS } from '../constants';
import { ensureAudioContext, playCompletionCue } from '../utils/audioCue';
import { requestNotificationPermission, showLocalNotification } from '../utils/notifications';
import { requestWakeLock, releaseWakeLock } from '../utils/wakeLock';
import { triggerHaptic } from '../utils/haptics';

interface PomodoroTimerProps {
  topicId: string;
  topicName: string;
  onTimeLogged: (minutes: number) => void;
  themeColor: string;
}

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ topicId, topicName, onTimeLogged, themeColor }) => {
    const { 
        mode, duration, elapsed, isRunning, topicId: activeTopicId, activeSoundId,
        startSession, pauseSession, resumeSession, resetSession, 
        setMode, setSessionDuration, setActiveSoundId, logAndReset, formatTime 
    } = useFocus();

    const [showSettings, setShowSettings] = useState(false);
    const [showSoundMenu, setShowSoundMenu] = useState(false);
    const [showCompletionFeedback, setShowCompletionFeedback] = useState(false);
    
    // Guard to prevent double logging/cueing
    const completionHandled = useRef(false);

    // Is this specific timer active for the current topic?
    const isActiveTimer = activeTopicId === topicId;
    
    // Derived state for display
    const displayTime = isActiveTimer ? formatTime(elapsed) : (mode === 'pomodoro' ? `${duration}:00` : '00:00');
    const displayIsRunning = isActiveTimer && isRunning;
    const hasStarted = isActiveTimer && elapsed > 0;

    // --- AUTO-LOG & CUE LOGIC ---
    useEffect(() => {
        // If currently running, reset guard
        if (isRunning) {
            completionHandled.current = false;
            return;
        }

        // Check if finished just now: Mode is Pomodoro, Not Running, Time matches Duration, Started (>0)
        const isFinished = mode === 'pomodoro' && elapsed > 0 && elapsed >= duration * 60;

        if (isActiveTimer && isFinished && !completionHandled.current) {
            console.debug("[TIMER] Finished. Visibility:", document.hidden ? 'Hidden' : 'Visible');
            completionHandled.current = true;
            
            // 1. Release Screen Wake Lock
            releaseWakeLock();

            // 2. Audio/Vibration Cue (Always fire cue)
            playCompletionCue();
            triggerHaptic.notification('Success');
            
            // 3. Log Session
            handleLogTime();

            // 4. Visual/System Alert based on Visibility
            if (document.hidden) {
                // Background: System Notification
                showLocalNotification("Session Complete", {
                    body: `${topicName || 'Focus Session'} complete! Time logged.`,
                    icon: 'https://cdn-icons-png.flaticon.com/512/3062/3062634.png',
                    tag: 'engram-session-end',
                    renotify: true,
                    requireInteraction: true // Keeps notification until user interacts
                } as any);
            } else {
                // Foreground: In-App Feedback
                setShowCompletionFeedback(true);
                setTimeout(() => setShowCompletionFeedback(false), 4000);
            }
        }
    }, [isRunning, elapsed, duration, mode, isActiveTimer, topicName]);

    // Cleanup Wake Lock on unmount/reset
    useEffect(() => {
        return () => { releaseWakeLock(); };
    }, []);

    const handleStartPause = async () => {
        triggerHaptic.impact('Heavy'); // Satisfying thud for play/pause
        
        // Initialize AudioContext on user gesture (Mobile Requirement)
        ensureAudioContext();

        // Request Permissions & Wake Lock if starting
        if (!isActiveTimer || !isRunning) {
             // Non-blocking permission request
             requestNotificationPermission(); 
             requestWakeLock();
        } else {
             // Pausing
             releaseWakeLock();
        }

        if (!isActiveTimer) {
            startSession(topicId, topicName);
        } else {
            if (isRunning) pauseSession();
            else resumeSession();
        }
    };

    const handleReset = () => {
        triggerHaptic.impact('Medium');
        if (isActiveTimer) resetSession();
        releaseWakeLock();
        completionHandled.current = false;
    };

    const handleLogTime = () => {
        if (isActiveTimer && elapsed > 5) { // Minimum 5 seconds to count
            triggerHaptic.notification('Success');
            const minutes = logAndReset();
            console.debug("[TIMER] Logging minutes:", minutes);
            onTimeLogged(minutes);
        }
    };

    return (
        <Card className="flex flex-col items-center w-full relative overflow-hidden p-6">
            <div className="flex justify-between items-center w-full mb-6 relative z-10">
                 <div className="flex items-center space-x-2">
                     <h3 className={`text-xl font-semibold text-${themeColor}-700`}>
                        {mode === 'stopwatch' ? 'Stopwatch' : 'Pomodoro'}
                     </h3>
                     
                     <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-full p-0.5">
                        <button 
                            onClick={() => { triggerHaptic.selection(); setShowSoundMenu(!showSoundMenu); setShowSettings(false); }} 
                            className={`p-1.5 rounded-full transition ${showSoundMenu ? `bg-white dark:bg-gray-600 text-${themeColor}-600 shadow-sm` : `text-gray-400 hover:text-${themeColor}-600`}`}
                            title="Ambience"
                        >
                            <Music size={16} />
                        </button>
                        <button 
                            onClick={() => { triggerHaptic.selection(); setShowSettings(!showSettings); setShowSoundMenu(false); }} 
                            className={`p-1.5 rounded-full transition ${showSettings ? `bg-white dark:bg-gray-600 text-${themeColor}-600 shadow-sm` : `text-gray-400 hover:text-${themeColor}-600`}`}
                            title="Timer Settings"
                        >
                            <Settings2 size={16} />
                        </button>
                     </div>
                 </div>
                 
                 {!showSettings && !showSoundMenu && (
                     <button 
                        onClick={() => { triggerHaptic.selection(); setMode(mode === 'stopwatch' ? 'pomodoro' : 'stopwatch'); }}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-bold transition ${mode === 'pomodoro' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                        {mode === 'stopwatch' ? <TimerIcon size={12} className="mr-1"/> : <Coffee size={12} className="mr-1"/>}
                        {mode === 'stopwatch' ? 'Switch to Pomo' : 'Switch to Timer'}
                    </button>
                 )}
            </div>

            {/* In-App Completion Toast Overlay */}
            {showCompletionFeedback && (
                <div className="absolute inset-0 z-30 bg-white/95 dark:bg-gray-800/95 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-500 mb-3 animate-bounce">
                        <CheckCircle2 size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">Session Complete!</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Time logged successfully.</p>
                </div>
            )}

            {/* Sound Menu Overlay */}
            {showSoundMenu && (
                <div className="absolute inset-0 bg-white/95 dark:bg-gray-800/95 z-20 flex flex-col p-4 animate-in fade-in zoom-in-95 duration-200">
                    <div className="w-full flex justify-between items-center mb-4">
                        <h4 className="text-md font-bold text-gray-800 dark:text-white flex items-center">
                            <Music size={16} className="mr-2"/> Ambience
                        </h4>
                        <button onClick={() => setShowSoundMenu(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                    </div>
                    
                    <div className="space-y-2 overflow-y-auto max-h-[220px] custom-scrollbar pb-2">
                        {AMBIENT_SOUNDS.map(sound => (
                            <button
                                key={sound.id}
                                onClick={() => { triggerHaptic.selection(); setActiveSoundId(activeSoundId === sound.id ? null : sound.id); }}
                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                                    activeSoundId === sound.id 
                                        ? `bg-${themeColor}-50 border-${themeColor}-200 dark:bg-${themeColor}-900/30 dark:border-${themeColor}-800` 
                                        : 'bg-gray-50 border-transparent hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600'
                                }`}
                            >
                                <div className="flex items-center space-x-3">
                                    <div className={`p-2 rounded-full ${activeSoundId === sound.id ? `bg-${themeColor}-100 text-${themeColor}-600` : 'bg-white dark:bg-gray-600 text-gray-400'}`}>
                                        <sound.icon size={16} />
                                    </div>
                                    <div className="text-left">
                                        <p className={`text-xs font-bold ${activeSoundId === sound.id ? `text-${themeColor}-700 dark:text-${themeColor}-300` : 'text-gray-700 dark:text-gray-200'}`}>{sound.name}</p>
                                        <p className="text-[10px] text-gray-400">{sound.description}</p>
                                    </div>
                                </div>
                                {activeSoundId === sound.id && <CheckCircle2 size={16} className={`text-${themeColor}-500`} />}
                            </button>
                        ))}
                    </div>
                    
                    <p className="text-[10px] text-center text-gray-400 mt-2 italic">
                        Sound plays automatically when timer starts.
                    </p>
                </div>
            )}

            {/* Settings Overlay - Optimized for In-Card Layout */}
            {showSettings && (
                <div className="absolute inset-0 z-20">
                    <div className="h-full w-full">
                        <div className="h-full w-full p-4 md:p-6 overflow-y-auto bg-white/95 dark:bg-gray-800/95 max-h-[calc(100%)] animate-in fade-in zoom-in-95 duration-200">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3 md:mb-4 shrink-0">
                                <h4 className="text-sm md:text-base font-bold text-gray-800 dark:text-white leading-tight">Timer Settings</h4>
                                <button 
                                    onClick={() => setShowSettings(false)} 
                                    className="inline-flex items-center p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-300 transition"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            
                            {/* Mode Toggle */}
                            <div className="mb-3 md:mb-4">
                                <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-2 block tracking-wider">Mode</label>
                                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                                    <button 
                                        onClick={() => { triggerHaptic.selection(); setMode('stopwatch'); }} 
                                        className={`flex-1 py-2 text-xs md:text-sm font-bold rounded-lg transition-all ${mode === 'stopwatch' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                                    >
                                        Stopwatch
                                    </button>
                                    <button 
                                        onClick={() => { triggerHaptic.selection(); setMode('pomodoro'); }} 
                                        className={`flex-1 py-2 text-xs md:text-sm font-bold rounded-lg transition-all ${mode === 'pomodoro' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                                    >
                                        Pomodoro
                                    </button>
                                </div>
                            </div>

                            {/* Duration Config */}
                            {mode === 'pomodoro' && (
                                <div className="mb-3 md:mb-4">
                                    <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-2 block tracking-wider">Duration (min)</label>
                                    <div className="flex items-center space-x-2 mb-2">
                                        {[25, 45, 60].map(val => (
                                            <button 
                                                key={val}
                                                onClick={() => { triggerHaptic.selection(); setSessionDuration(val); }}
                                                className={`flex-1 py-1.5 rounded-lg text-xs md:text-sm font-bold transition border ${duration === val ? `border-${themeColor}-500 bg-${themeColor}-50 text-${themeColor}-700 dark:bg-${themeColor}-900/30` : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                                            >
                                                {val}m
                                            </button>
                                        ))}
                                    </div>
                                    <div>
                                        <input 
                                            type="range" 
                                            min="5" 
                                            max="120" 
                                            step="5"
                                            value={duration} 
                                            onChange={(e) => { triggerHaptic.selection(); setSessionDuration(parseInt(e.target.value)); }}
                                            className={`w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-${themeColor}-600`}
                                        />
                                        <div className="text-center mt-1 font-mono text-[10px] md:text-xs font-bold text-gray-700 dark:text-gray-300">{duration} minutes</div>
                                    </div>
                                </div>
                            )}

                            {/* Apply Button */}
                            <div className="mt-auto pb-3">
                                <button 
                                    onClick={() => setShowSettings(false)}
                                    className={`w-full py-3 bg-${themeColor}-600 text-white rounded-xl font-bold shadow-lg hover:bg-${themeColor}-700 transition transform active:scale-95 text-sm md:text-base`}
                                >
                                    Apply Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!isActiveTimer && activeTopicId && (
                <div className="absolute top-12 bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full z-10 animate-pulse">
                    Timer active for: {localStorage.getItem('focus_topicName') || 'Another Topic'}
                </div>
            )}

            <div className={`text-7xl font-extrabold text-${themeColor}-900 dark:text-${themeColor}-100 my-6 tracking-tight font-mono tabular-nums transition-opacity ${(showSettings || showSoundMenu) ? 'opacity-20' : 'opacity-100'}`}>
                {displayTime}
            </div>
            
            <div className={`flex items-center space-x-4 mb-6 w-full transition-opacity ${(showSettings || showSoundMenu) ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
                <button
                    onClick={handleStartPause}
                    className={`flex-1 py-3 rounded-xl font-bold text-white shadow-md transform transition active:scale-95 flex items-center justify-center text-lg ${
                        displayIsRunning 
                        ? 'bg-amber-500 hover:bg-amber-600' 
                        : `bg-${themeColor}-600 hover:bg-${themeColor}-700`
                    }`}
                >
                    {displayIsRunning ? <Pause className="mr-2" fill="currentColor" /> : <Play className="mr-2" fill="currentColor" />}
                    {displayIsRunning ? 'Pause' : (hasStarted ? 'Resume' : 'Start')}
                </button>
                
                <button
                    onClick={handleReset}
                    className="w-14 h-14 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition flex items-center justify-center shadow-sm"
                    title="Reset"
                >
                    <RotateCw size={22} className={displayIsRunning ? 'opacity-50' : ''} />
                </button>
            </div>

            <button
                onClick={handleLogTime}
                disabled={!hasStarted}
                className={`w-full py-3 rounded-xl font-bold transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center leading-tight shadow-sm ${
                    hasStarted 
                    ? 'bg-green-500 text-white hover:bg-green-600' 
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                } ${(showSettings || showSoundMenu) ? 'opacity-20 pointer-events-none' : ''}`}
            >
                <span>Log Session Time</span>
            </button>
        </Card>
    );
};
