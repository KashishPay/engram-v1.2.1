
import { supabase } from '../services/supabase';

export const performDeviceReset = async (): Promise<void> => {
    console.debug("[RESET] Starting device wipe...");

    // 1. Sign Out (Best Effort)
    if (supabase) {
        try {
            await supabase.auth.signOut();
            console.debug("[RESET] signout ok");
        } catch (e) {
            console.debug("[RESET] signout fail/skipped", e);
        }
    }

    // 2. Clear Storage
    try {
        localStorage.clear();
        sessionStorage.clear();
        console.debug("[RESET] cleared storage");
    } catch (e) {
        console.error("[RESET] storage clear error", e);
    }

    // 3. Clear IndexedDB
    try {
        // Attempt to delete specific known DB
        const req = window.indexedDB.deleteDatabase('EngramDB');
        req.onsuccess = () => console.debug("[RESET] cleared indexeddb (EngramDB)");
        req.onerror = () => console.warn("[RESET] failed to clear indexeddb");
        
        // Attempt to clear all if API is supported
        if ((window.indexedDB as any).databases) {
            const dbs = await (window.indexedDB as any).databases();
            for (const db of dbs) {
                if (db.name) window.indexedDB.deleteDatabase(db.name);
            }
            console.debug("[RESET] cleared all discovered databases");
        }
    } catch (e) {
        console.error("[RESET] IDB error", e);
    }

    // 4. Clear Caches & Service Worker
    if ('caches' in window) {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
            console.debug("[RESET] cleared caches");
        } catch (e) { console.error(e); }
    }

    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
            }
            console.debug("[RESET] unregistered SWs");
        } catch (e) { console.error(e); }
    }
    
    // UI handles reload now
};
