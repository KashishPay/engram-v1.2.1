
import { supabase } from './supabase';
import { showLocalNotification } from '../utils/notifications';

export interface GlobalNotification {
    id: string;
    title: string;
    body: string;
    created_at: string;
    is_active: boolean;
}

const DISMISSED_KEY = 'engram_dismissed_notifications';

export const GlobalNotificationService = {
    /**
     * Fetch active notifications from Supabase
     */
    fetchNotifications: async (): Promise<GlobalNotification[]> => {
        if (!supabase) return [];
        
        const { data, error } = await supabase
            .from('global_notifications')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching notifications", error);
            return [];
        }
        return data as GlobalNotification[];
    },

    /**
     * Get list of IDs user has already cleared
     */
    getDismissedIds: (): string[] => {
        try {
            const raw = localStorage.getItem(DISMISSED_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    },

    /**
     * Mark specific IDs as read
     */
    dismissNotifications: (ids: string[]) => {
        const current = GlobalNotificationService.getDismissedIds();
        const newSet = new Set([...current, ...ids]);
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(newSet)));
    },

    /**
     * Subscribe to new notifications for Realtime updates
     */
    subscribe: (onNew: (n: GlobalNotification) => void) => {
        if (!supabase) return null;

        const channel = supabase
            .channel('global-notifs')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'global_notifications', filter: 'is_active=eq.true' },
                (payload) => {
                    const newNotif = payload.new as GlobalNotification;
                    // Trigger System Notification
                    showLocalNotification(newNotif.title, {
                        body: newNotif.body,
                        tag: 'global-announcement'
                    });
                    onNew(newNotif);
                }
            )
            .subscribe();

        return channel;
    }
};
