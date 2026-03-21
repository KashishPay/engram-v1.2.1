import { useEffect, useCallback, useRef } from 'react';
import { Topic, NotificationSettings } from '../types';
import { requestNotificationPermission, showLocalNotification, scheduleDailyReminders, cancelDailyReminder } from '../utils/notifications';
import { Capacitor } from '@capacitor/core';

export const useNotifications = (
    studyLog: Topic[],
    settings: NotificationSettings
) => {
    // Track sent notifications for the current day to avoid spamming every 5 seconds
    // Map: "YYYY-MM-DD-HH:MM" -> boolean
    const sentHistory = useRef<Set<string>>(new Set());

    // Permission Wrapper re-exported for UI
    const requestPermission = useCallback(async (): Promise<boolean> => {
        return await requestNotificationPermission();
    }, []);

    // --- NATIVE MOBILE SCHEDULER (Option 1: Stability) ---
    // Only reschedule when settings actually change, NOT when study data updates.
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        if (!settings.enabled || !settings.reminders || settings.reminders.length === 0) {
            cancelDailyReminder();
            return;
        }

        const timeObjects = settings.reminders.map(r => {
            const [h, m] = r.time.split(':').map(Number);
            return { hour: h, minute: m, label: r.label || "Time to Study!" };
        });
        
        scheduleDailyReminders(timeObjects);
    }, [settings.enabled, JSON.stringify(settings.reminders)]);

    // --- WEB & POLLING LOGIC ---
    useEffect(() => {
        // Prerequisites: Enabled in settings
        if (!settings.enabled || Capacitor.isNativePlatform()) {
            return;
        }
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const checkAndNotify = () => {
            const now = new Date();
            // Get current time string HH:MM
            const currentHm = now.toLocaleTimeString('en-GB', { 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: false 
            }).slice(0, 5);

            // Find matching reminder
            const activeReminder = settings.reminders.find(r => r.time === currentHm);

            if (activeReminder) {
                
                // Check idempotency key
                const todayStr = now.toISOString().split('T')[0];
                const key = `${todayStr}-${currentHm}`;
                
                if (sentHistory.current.has(key)) return;

                // For web, we still check due count to decide whether to show generic vs specific
                const dueCount = studyLog.filter(t => {
                    if (!t.shortNotes) return false;
                    if ((t.repetitions?.length || 0) === 0) return true;
                    
                    const lastRep = t.repetitions[t.repetitions.length - 1];
                    const nextDate = new Date(lastRep.nextReviewDate);
                    const todayDate = new Date();
                    nextDate.setHours(0,0,0,0);
                    todayDate.setHours(0,0,0,0);
                    
                    return nextDate <= todayDate;
                }).length;

                // Always show if user set a custom label, OR if topics are due
                if (activeReminder.label || dueCount > 0) {
                    const title = activeReminder.label || "Time to Study!";
                    const body = dueCount > 0 
                        ? `You have ${dueCount} topic${dueCount > 1 ? 's' : ''} due for review.` 
                        : "Time for your scheduled session.";
                    
                    showLocalNotification(title, {
                        body: body,
                        icon: 'https://cdn-icons-png.flaticon.com/512/3062/3062634.png',
                        badge: 'https://cdn-icons-png.flaticon.com/512/3062/3062634.png',
                        tag: 'engram-reminder'
                    });

                    // Mark as sent for this specific minute slot
                    sentHistory.current.add(key);
                    
                    // Cleanup old keys (memory mgmt)
                    if (sentHistory.current.size > 50) {
                        sentHistory.current.clear();
                        sentHistory.current.add(key);
                    }
                }
            }
        };

        // Poll every 5 seconds to ensure we catch the minute change "Bang on time"
        const intervalId = setInterval(checkAndNotify, 5000);
        checkAndNotify(); // Check immediately on mount

        return () => clearInterval(intervalId);
    }, [studyLog, settings]);

    return { requestPermission };
};