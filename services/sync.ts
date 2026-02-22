
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

export const SyncService = {
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