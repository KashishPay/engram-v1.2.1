
import { PomodoroSession, TopicSession, SessionLog } from '../types';

const KEY_POMODORO = 'engram_pomodoro_logs';
const KEY_TOPIC = 'engram_topic_logs';
const KEY_LEGACY = 'engramGlobalFocusLogs';

// Helper: Get Local Date as ISO String (YYYY-MM-DD)
// This ensures "today" aligns with the user's wall clock, not UTC midnight.
export const getLocalISODate = (d: Date = new Date()): string => {
    const offsetMs = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offsetMs).toISOString().split('T')[0];
};

// One-time migration to split legacy mixed logs into strict categories
const migrateLegacyLogs = () => {
    try {
        const legacyRaw = localStorage.getItem(KEY_LEGACY);
        if (!legacyRaw) return;

        const legacyLogs = JSON.parse(legacyRaw);
        if (!Array.isArray(legacyLogs)) return;

        const pomodoroLogs: PomodoroSession[] = [];
        const topicLogs: TopicSession[] = [];

        legacyLogs.forEach((log: any) => {
            const isGeneral = log.subject === 'General' || !log.subject;
            const base = {
                minutes: log.minutes,
                date: log.date,
                time: log.time,
                createdAt: Date.now() // Approximation for legacy data
            };

            if (isGeneral) {
                pomodoroLogs.push({
                    ...base,
                    type: 'POMODORO',
                    topicName: 'General Focus',
                    subject: 'General'
                });
            } else {
                topicLogs.push({
                    ...base,
                    type: 'TOPIC',
                    topicName: log.topicName || 'Unknown Topic',
                    subject: log.subject || 'Uncategorized'
                });
            }
        });

        // Merge with any existing new logs (safety check)
        const existingPomo = getPomodoroLogs();
        const existingTopic = getTopicLogs();

        if (pomodoroLogs.length > 0) {
            localStorage.setItem(KEY_POMODORO, JSON.stringify([...existingPomo, ...pomodoroLogs]));
        }
        if (topicLogs.length > 0) {
            localStorage.setItem(KEY_TOPIC, JSON.stringify([...existingTopic, ...topicLogs]));
        }
        
        // Remove legacy key to complete migration
        localStorage.removeItem(KEY_LEGACY);
        console.debug("[Migration] Session logs split successfully.");
    } catch (e) {
        console.error("[Migration] Failed to migrate session logs", e);
    }
};

// Execute migration on module load
migrateLegacyLogs();

export const getPomodoroLogs = (): PomodoroSession[] => {
    try {
        const raw = localStorage.getItem(KEY_POMODORO);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
};

export const savePomodoroLogs = (logs: PomodoroSession[]) => {
    localStorage.setItem(KEY_POMODORO, JSON.stringify(logs));
    window.dispatchEvent(new Event('focus-log-updated'));
};

export const getTopicLogs = (): TopicSession[] => {
    try {
        const raw = localStorage.getItem(KEY_TOPIC);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
};

// NEW: Unified getter for all logs
export const getAllLogs = (): SessionLog[] => {
    const pomo = getPomodoroLogs();
    const topic = getTopicLogs();
    // Merge and sort by createdAt descending (newest first)
    return [...pomo, ...topic].sort((a, b) => b.createdAt - a.createdAt);
};

export type PomodoroDailySummary = {
    count: number;
    minutes: number;
    sessions: SessionLog[];
};

export function groupLogsByDate(
    logs: SessionLog[]
): Record<string, PomodoroDailySummary> {
    return logs.reduce((acc, log) => {
        const key = log.date; // already local YYYY-MM-DD from getLocalISODate at write time
        if (!acc[key]) acc[key] = { count: 0, minutes: 0, sessions: [] };
        acc[key].count += 1;
        acc[key].minutes += Math.max(0, log.minutes || 0);
        acc[key].sessions.push(log);
        return acc;
    }, {} as Record<string, PomodoroDailySummary>);
}

// Deprecated alias kept for compatibility if needed, but implementation updated to generic
export const groupPomodoroLogsByDate = groupLogsByDate;

// Check for recent duplicate logs (within 2 seconds) to prevent double logging race conditions
const isDuplicate = (logs: any[], topicName: string, type: string) => {
    if (logs.length === 0) return false;
    const latest = logs[0];
    const now = Date.now();
    // Use a 2 second window to catch race conditions between components
    const isRecent = (now - (latest.createdAt || 0)) < 2000; 
    return isRecent && latest.type === type && latest.topicName === topicName;
};

export const logPomodoroSession = (minutes: number) => {
    const logs = getPomodoroLogs();
    
    // Idempotency check
    if (isDuplicate(logs, 'General Focus', 'POMODORO')) {
        console.warn("[LOG] Duplicate Pomodoro session prevented.");
        return;
    }

    const now = new Date();
    const session: PomodoroSession = {
        type: 'POMODORO',
        minutes,
        date: getLocalISODate(now),
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase(),
        createdAt: Date.now(),
        topicName: 'General Focus',
        subject: 'General'
    };
    
    localStorage.setItem(KEY_POMODORO, JSON.stringify([session, ...logs]));
    
    // Dispatch event specifically for Pomodoro UI
    window.dispatchEvent(new Event('focus-log-updated'));
    console.debug("[LOG] Pomodoro session saved");
};

export const updatePomodoroLog = (createdAt: number, updates: Partial<PomodoroSession>) => {
    const logs = getPomodoroLogs();
    const index = logs.findIndex(l => l.createdAt === createdAt);
    if (index !== -1) {
        logs[index] = { ...logs[index], ...updates };
        localStorage.setItem(KEY_POMODORO, JSON.stringify(logs));
        window.dispatchEvent(new Event('focus-log-updated'));
    }
};

export const logTopicSession = (minutes: number, topicName: string, subject: string) => {
    const logs = getTopicLogs();

    // Idempotency check
    if (isDuplicate(logs, topicName, 'TOPIC')) {
        console.warn("[LOG] Duplicate Topic session prevented.");
        return;
    }

    const now = new Date();
    const session: TopicSession = {
        type: 'TOPIC',
        minutes,
        date: getLocalISODate(now),
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase(),
        createdAt: Date.now(),
        topicName,
        subject
    };

    localStorage.setItem(KEY_TOPIC, JSON.stringify([session, ...logs]));
    
    // Optional: Event if we build a global history view later
    window.dispatchEvent(new Event('focus-log-updated')); // Fire global focus update so PomoHistoryView sees it
    console.debug("[LOG] Topic session saved", { topicName });
};

// Facade for backward compatibility with AppRouter/FloatingTimer
export const logGlobalSession = (minutes: number, topicName: string = 'General Focus', subject: string = 'General') => {
    // Smart routing based on content
    if (subject === 'General' || topicName === 'General Focus') {
        logPomodoroSession(minutes);
    } else {
        logTopicSession(minutes, topicName, subject);
    }
};
