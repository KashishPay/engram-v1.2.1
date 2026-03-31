
import { supabase } from '../services/supabase';
import { closeDB } from '../services/storage';

export const performDeviceReset = async (keepAuth: boolean = false): Promise<void> => {
    console.debug(`[RESET] Starting device wipe (keepAuth: ${keepAuth})...`);

    // 1. Sign Out (Best Effort) - Skip if keepAuth is true
    if (supabase && !keepAuth) {
        try {
            await supabase.auth.signOut();
            console.debug("[RESET] signout ok");
        } catch (e) {
            console.debug("[RESET] signout fail/skipped", e);
        }
    }

    // 2. Clear Storage
    try {
        if (keepAuth) {
            // Only clear non-auth keys
            const keysToKeep = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
            const authData: Record<string, string> = {};
            keysToKeep.forEach(k => {
                const val = localStorage.getItem(k);
                if (val) authData[k] = val;
            });

            localStorage.clear();
            sessionStorage.clear();

            // Restore auth data
            Object.entries(authData).forEach(([k, v]) => localStorage.setItem(k, v));
            console.debug("[RESET] cleared storage (kept auth)");
        } else {
            localStorage.clear();
            sessionStorage.clear();
            console.debug("[RESET] cleared storage");
        }
    } catch (e) {
        console.error("[RESET] storage clear error", e);
    }

    // 3. Clear IndexedDB
    try {
        await closeDB();
        
        await new Promise<void>((resolve) => {
            const req = window.indexedDB.deleteDatabase('EngramDB');
            req.onsuccess = () => {
                console.debug("[RESET] cleared indexeddb (EngramDB)");
                resolve();
            };
            req.onerror = () => {
                console.warn("[RESET] failed to clear indexeddb");
                resolve(); // resolve anyway to continue reset
            };
            req.onblocked = () => {
                console.warn("[RESET] blocked clearing indexeddb");
                resolve(); // resolve anyway to avoid hanging forever
            };
        });

        // Attempt to clear all if API is supported
        if ('databases' in window.indexedDB) {
            const dbs = await (window.indexedDB as unknown as { databases: () => Promise<{ name: string }[]> }).databases();
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
