import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Request notification permission from the user.
 * Supports both Web API and Capacitor Native API.
 * Should be called triggered by a user gesture.
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
    // 1. Native Mobile (Capacitor)
    if (Capacitor.isNativePlatform()) {
        try {
            const result = await LocalNotifications.requestPermissions();
            return result.display === 'granted';
        } catch (e) {
            console.warn("[NOTIF] Native permission request error", e);
            return false;
        }
    }

    // 2. Web API
    if (!("Notification" in window)) return false;
    
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;

    try {
        const result = await Notification.requestPermission();
        return result === "granted";
    } catch (e) {
        console.warn("[NOTIF] Permission request error", e);
        return false;
    }
};

/**
 * Extended options interface to support Capacitor specific features
 */
export interface LocalNotificationOptions extends NotificationOptions {
    id?: number;
    ongoing?: boolean;
}

/**
 * Show or schedule a notification.
 * - On Mobile (Capacitor): Schedules a notification immediately. Supports sticky/ongoing and ID updates.
 * - On Web: Uses Service Worker if available, else standard API.
 */
export const showLocalNotification = async (title: string, options: LocalNotificationOptions = {}) => {
    // 1. Native Mobile (Capacitor)
    if (Capacitor.isNativePlatform()) {
        try {
            // Use provided ID or generate a random integer
            const id = options.id || Math.floor(Date.now() / 1000);
            
            await LocalNotifications.schedule({
                notifications: [{
                    title,
                    body: options.body || '',
                    id: id,
                    schedule: { at: new Date(Date.now() + 100) }, // Fire almost immediately
                    sound: 'beep.wav', // Default to system sound if file not found
                    smallIcon: 'ic_stat_icon_config_sample', // Default resource name
                    actionTypeId: '',
                    extra: null,
                    ongoing: options.ongoing || false // True = Sticky (cannot swipe away)
                }]
            });
            return;
        } catch (e) {
            console.error("[NOTIF] Native notification failed", e);
            return;
        }
    }

    // 2. Web API
    if (!("Notification" in window)) return;
    
    if (Notification.permission !== "granted") {
        console.debug("[NOTIF] Permission missing, skipping.");
        return;
    }

    try {
        // Try Service Worker (Robust for Mobile Web / Background)
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            if (reg && reg.showNotification) {
                await reg.showNotification(title, options);
                return;
            }
        }
        
        // Fallback to Main Thread API (Desktop)
        new Notification(title, options);
    } catch (e) {
        console.error("[NOTIF] Failed to show notification", e);
    }
};

/**
 * Schedule multiple daily recurring notifications (Mobile Only).
 * Accepts array of reminder objects with {time, label}.
 */
export const scheduleDailyReminders = async (reminders: { hour: number, minute: number, label: string }[]) => {
    if (!Capacitor.isNativePlatform()) return;

    try {
        // 0. Create/Update Channel (Android Only) - Ensures high importance
        if (Capacitor.getPlatform() === 'android') {
            await LocalNotifications.createChannel({
                id: 'study-reminders',
                name: 'Study Reminders',
                description: 'Daily reminders to keep your study streak alive',
                importance: 5, // Max importance (heads-up notification)
                visibility: 1, // Public
                vibration: true
            });
        }

        // 1. Brute-Force Clear existing reminders in our reserved range (1000-1099)
        // This is more reliable than getPending() which can sometimes be stale.
        const idsToCancel = [];
        for (let i = 1000; i < 1100; i++) {
            idsToCancel.push({ id: i });
        }
        await LocalNotifications.cancel({ notifications: idsToCancel });

        if (reminders.length === 0) return;

        // 2. Schedule new batch
        const notifications = reminders.map((r, idx) => {
            return {
                title: r.label && r.label.trim() !== "" ? r.label : "Time to Study!",
                body: "It's time for your scheduled session.",
                id: 1000 + idx, // Unique ID per slot
                schedule: { 
                    on: { hour: r.hour, minute: r.minute },
                    repeats: true,
                    allowWhileIdle: true 
                },
                channelId: 'study-reminders',
                smallIcon: 'ic_stat_icon_config_sample'
            };
        });

        await LocalNotifications.schedule({ notifications });
        console.debug("[NOTIF] Daily reminders hardened & scheduled:", reminders.length);
    } catch (e) {
        console.warn("[NOTIF] Failed to schedule daily reminders", e);
    }
};

export const cancelDailyReminder = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        // Cancel entire range
        const pending = await LocalNotifications.getPending();
        const dailyIds = pending.notifications
            .filter(n => n.id >= 1000 && n.id < 1100)
            .map(n => ({ id: n.id }));
            
        if (dailyIds.length > 0) {
            await LocalNotifications.cancel({ notifications: dailyIds });
        }
    } catch (e) {
        // ignore
    }
};

// --- TIMER SPECIFIC NOTIFICATIONS ---

/**
 * Schedules a notification for when the Focus Timer will complete.
 * This ensures the user is notified even if the app is in the background/killed.
 */
export const scheduleFinishNotification = async (secondsRemaining: number) => {
    if (secondsRemaining <= 0) return;
    
    const finishDate = new Date(Date.now() + (secondsRemaining * 1000));

    // 1. Native Mobile
    if (Capacitor.isNativePlatform()) {
        try {
            // Cancel any previous timer notifications first
            await LocalNotifications.cancel({ notifications: [{ id: 8888 }] });

            await LocalNotifications.schedule({
                notifications: [{
                    title: "Session Complete!",
                    body: "Great job! Tap to log your session.",
                    id: 8888, // Fixed ID for the active timer
                    schedule: { at: finishDate },
                    sound: 'beep.wav',
                    smallIcon: 'ic_stat_icon_config_sample',
                    actionTypeId: 'OPEN_APP'
                }]
            });
            console.debug("[NOTIF] Scheduled finish for", finishDate.toLocaleTimeString());
        } catch (e) {
            console.warn("[NOTIF] Failed to schedule finish", e);
        }
    } 
    // 2. Web (Service Worker) - Fallback for background tabs on Android Chrome
    else if ('serviceWorker' in navigator && Notification.permission === "granted") {
        try {
            const reg = await navigator.serviceWorker.ready;
            // Note: Standard SWs don't support precise 'schedule' easily without Push API,
            // but we can rely on the app being open in a background tab for now.
            // True background scheduling on Web requires Push Notifications setup.
        } catch (e) {
            // ignore
        }
    }
};

export const cancelFinishNotification = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await LocalNotifications.cancel({ notifications: [{ id: 8888 }] });
            console.debug("[NOTIF] Cancelled finish notification");
        } catch (e) {
            // ignore
        }
    }
};