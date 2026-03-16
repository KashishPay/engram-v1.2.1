
/**
 * SyncService
 * 
 * Provides utilities for merging local and remote data using a "Last Write Wins" (LWW) strategy.
 * This prepares the application for future cloud synchronization (e.g., Supabase).
 * 
 * Logic:
 * 1. Entities are matched by ID.
 * 2. If an entity exists in both Local and Remote lists, the one with the later `updatedAt` timestamp is kept.
 * 3. If `updatedAt` is missing, it falls back to 0 (oldest), effectively being overwritten by any timestamped version.
 */

import { supabase } from './supabase';

export interface SyncPayload {
    subjects?: any[];
    study_logs?: any[];
    habits?: any[];
    settings?: any;
    updated_at?: string;
}

export const SyncService = {
    /**
     * Pulls the latest sync state for the user from Supabase.
     */
    pullData: async (userId: string): Promise<SyncPayload | null> => {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase
                .from('sync_state')
                .select('subjects, study_logs, habits, settings, updated_at')
                .eq('user_id', userId)
                .maybeSingle();
            
            if (error) throw error;
            return data;
        } catch (e) {
            console.error("[SyncService] Pull failed:", e);
            throw e;
        }
    },

    /**
     * Pushes the current local state to Supabase.
     */
    pushData: async (userId: string, payload: SyncPayload): Promise<boolean> => {
        if (!supabase) return false;
        try {
            const { error } = await supabase
                .from('sync_state')
                .upsert({
                    user_id: userId,
                    subjects: payload.subjects,
                    study_logs: payload.study_logs,
                    habits: payload.habits,
                    settings: payload.settings,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) throw error;
            return true;
        } catch (e) {
            console.error("[SyncService] Push failed:", e);
            return false;
        }
    },

    /**
     * Subscribes to realtime updates for the user's sync state.
     */
    subscribeToSyncState: (userId: string, onUpdate: (payload: SyncPayload) => void) => {
        if (!supabase) return () => {};

        const channel = supabase.channel(`sync_state_${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'sync_state',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    console.debug("[SyncService] Realtime update received:", payload);
                    if (payload.new) {
                        onUpdate(payload.new as SyncPayload);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase?.removeChannel(channel);
        };
    },

    /**
     * Merges two collections of entities based on ID and updatedAt timestamp.
     * @param localList - The list currently on the device
     * @param remoteList - The list fetched from the cloud
     * @returns A new merged list
     */
    mergeCollections<T extends { id: string; updatedAt?: string }>(localList: T[], remoteList: T[]): T[] {
        const mergedMap = new Map<string, T>();

        // 1. Load all remote items into the map
        remoteList.forEach(item => {
            mergedMap.set(item.id, item);
        });

        // 2. Iterate through local items and merge/overwrite
        localList.forEach(localItem => {
            const remoteItem = mergedMap.get(localItem.id);
            
            if (!remoteItem) {
                // Item exists locally but not remotely (New local item)
                mergedMap.set(localItem.id, localItem);
            } else {
                // Conflict: Item exists in both. Compare timestamps.
                const localTime = new Date(localItem.updatedAt || 0).getTime();
                const remoteTime = new Date(remoteItem.updatedAt || 0).getTime();

                // If local is newer or equal, use local. Otherwise, keep remote.
                if (localTime >= remoteTime) {
                    mergedMap.set(localItem.id, localItem);
                }
            }
        });

        return Array.from(mergedMap.values());
    },

    /**
     * Merges two single entity objects (e.g., UserProfile).
     */
    mergeEntity<T extends { updatedAt?: string }>(local: T, remote: T): T {
        if (!local) return remote;
        if (!remote) return local;
        
        const localTime = new Date(local.updatedAt || 0).getTime();
        const remoteTime = new Date(remote.updatedAt || 0).getTime();
        
        return localTime >= remoteTime ? local : remote;
    }
};