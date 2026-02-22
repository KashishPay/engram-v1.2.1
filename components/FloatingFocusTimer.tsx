
import React, { useState, useRef, useEffect } from 'react';
import { Clock, Pause, Play, CheckSquare, Minimize2 } from 'lucide-react';
import { useFocus } from '../context/FocusContext';
import { playCompletionCue } from '../utils/audioCue';
import { showLocalNotification } from '../utils/notifications';
import { releaseWakeLock } from '../utils/wakeLock';

interface FloatingFocusTimerProps {
    activeTopicId: string;
    activeTopicName: string;
    currentView: string;
    selectedTopicId: string | undefined;
    themeColor: string;
    onLogTime: (minutes: number) => void;
}

export const FloatingFocusTimer: React.FC<FloatingFocusTimerProps> = ({ 
    activeTopicId, 
    activeTopicName,
    currentView, 
    selectedTopicId, 
    themeColor,
    onLogTime
}) => {
    const { elapsed, isRunning, pauseSession, resumeSession, logAndReset, formatTime, mode, duration } = useFocus();
    const [isMinimized, setIsMinimized] = useState(false);
    const completionHandled = useRef(false);
    
    // Drag state
    const [pos, setPos] = useState({ x: 20, y: window.innerHeight - 160 }); // Initial bottom-left
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    // Completion Detection Logic (Mirrors PomodoroTimer.tsx)
    useEffect(() => {
        // If timer is running, reset the completion guard
        if (isRunning) {
            completionHandled.current = false;
            return;
        }

        // Check if finished: Mode is Pomodoro, Not Running (stopped by Context), Time matches Target
        const isFinished = mode === 'pomodoro' && elapsed > 0 && elapsed >= duration * 60;

        if (isFinished && !completionHandled.current) {
            // Guard: If we are theoretically on the detail view for this topic, do not log here.
            // AppShell unmounts this component in that case, but this protects against race conditions
            // if unmounting happens slightly after this effect fires during a view transition.
            if (currentView === 'topicDetail' && selectedTopicId === activeTopicId) {
                return;
            }

            console.debug("[FLOATING TIMER] Finished", { activeTopicId, hidden: document.hidden });
            completionHandled.current = true;

            // 1. Release Screen Wake Lock
            releaseWakeLock();

            // 2. Audio/Vibration Cue
            playCompletionCue();

            // 3. Background Notification
            if (document.hidden) {
                showLocalNotification("Session Complete", {
                    body: `${activeTopicName || 'Focus Session'} complete! Time logged.`,
                    icon: 'https://cdn-icons-png.flaticon.com/512/3062/3062634.png',
                    tag: 'engram-session-end',
                    renotify: true,
                    requireInteraction: true
                } as any);
            }

            // 4. Auto-Log Session
            const mins = logAndReset();
            if (mins > 0) onLogTime(mins);
        }
    }, [isRunning, elapsed, duration, mode, activeTopicId, activeTopicName, onLogTime, logAndReset, currentView, selectedTopicId]);

    const handlePointerDown = (e: React.PointerEvent) => {
        isDragging.current = true;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.preventDefault();
        
        const newX = e.clientX - dragOffset.current.x;
        const newY = e.clientY - dragOffset.current.y;

        const maxX = window.innerWidth - 60;
        const maxY = window.innerHeight - 60;
        
        setPos({
            x: Math.max(0, Math.min(newX, maxX)),
            y: Math.max(0, Math.min(newY, maxY))
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        isDragging.current = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    };

    // Double-check exclusions in render phase
    if (currentView === 'topicDetail' && selectedTopicId === activeTopicId) return null;
    if (currentView === 'pomodoro') return null;

    const handleLog = (e: React.MouseEvent) => {
        e.stopPropagation();
        const mins = logAndReset();
        console.debug("[OVERLAY] handleLog triggered", { minutes: mins });
        if (mins > 0) onLogTime(mins);
    };

    const toggleMinimize = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMinimized(!isMinimized);
    };

    // Style variations based on state
    const bgStyle = isRunning 
        ? `bg-${themeColor}-600/40 border-${themeColor}-400/50`
        : `bg-gray-800/40 border-gray-600/50`;

    // Minimized View (Ball)
    if (isMinimized) {
        return (
            <div 
                className={`fixed z-50 rounded-full w-14 h-14 flex items-center justify-center backdrop-blur-md shadow-lg border cursor-grab active:cursor-grabbing transition-all duration-300 ${bgStyle} text-white`}
                style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={toggleMinimize}
            >
                <div className="flex flex-col items-center justify-center pointer-events-none select-none">
                    {isRunning ? (
                       <span className="text-[10px] font-mono font-bold animate-pulse">{formatTime(elapsed)}</span>
                    ) : (
                       <Clock size={20} />
                    )}
                </div>
            </div>
        );
    }

    // Expanded View (Floating Bar)
    return (
        <div
            className={`fixed z-50 rounded-full backdrop-blur-md shadow-xl border flex items-center justify-between p-2 pl-3 gap-3 cursor-grab active:cursor-grabbing transition-all duration-300 text-white ${bgStyle}`}
            style={{ left: pos.x, top: pos.y, touchAction: 'none', maxWidth: '280px' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
             <div className="flex items-center gap-2 overflow-hidden pointer-events-none select-none">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isRunning ? 'animate-pulse bg-white/20' : 'bg-black/20'}`}>
                    <Clock size={14} />
                </div>
                <div className="min-w-0 flex flex-col">
                    <span className="text-[9px] uppercase opacity-70 tracking-wider leading-none">Focusing</span>
                    <span className="text-xs font-bold truncate max-w-[90px]">{activeTopicName}</span>
                </div>
             </div>

             <div className="flex items-center gap-2 shrink-0">
                 <span className="font-mono font-bold text-lg tabular-nums pointer-events-none select-none mr-1">
                     {formatTime(elapsed)}
                 </span>
                 
                 <div className="flex items-center gap-1 bg-white/10 rounded-full p-0.5" onPointerDown={(e) => e.stopPropagation()}>
                     <button 
                        onClick={isRunning ? pauseSession : resumeSession}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition"
                     >
                         {isRunning ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                     </button>
                     <button 
                        onClick={handleLog}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition text-green-300"
                        title="Log & Finish"
                     >
                        <CheckSquare size={14} />
                     </button>
                     <button 
                        onClick={toggleMinimize}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition opacity-80"
                        title="Minimize"
                     >
                        <Minimize2 size={14} />
                     </button>
                 </div>
             </div>
        </div>
    );
};
