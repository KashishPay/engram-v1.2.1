
// utils/guestLimit.ts
// Client-side 15-day guest limit with localStorage timestamp.
// Minimal, reversible, and "Local First" (no server dependency).
// Added Layer 2: IndexedDB Backup for tamper resistance.

const GUEST_LIMIT_DAYS = 15;
const STORAGE_KEY = 'engram_guest_start_ts';

// --- Layer 2: System DB (Meta Store) ---
const SYS_DB_NAME = 'EngramSystem';
const SYS_STORE_NAME = 'sys_kv';
const SYS_DB_VERSION = 1;

const openSystemDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            reject(new Error("IDB not supported"));
            return;
        }
        const request = indexedDB.open(SYS_DB_NAME, SYS_DB_VERSION);
        
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(SYS_STORE_NAME)) {
                db.createObjectStore(SYS_STORE_NAME);
            }
        };
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const getBackupTimestamp = async (): Promise<string | null> => {
    try {
        const db = await openSystemDB();
        return new Promise((resolve) => {
            const tx = db.transaction(SYS_STORE_NAME, 'readonly');
            const req = tx.objectStore(SYS_STORE_NAME).get(STORAGE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
};

const saveBackupTimestamp = async (ts: string): Promise<void> => {
    try {
        const db = await openSystemDB();
        const tx = db.transaction(SYS_STORE_NAME, 'readwrite');
        tx.objectStore(SYS_STORE_NAME).put(ts, STORAGE_KEY);
    } catch (e) {
        console.warn("[GuestLimit] Backup save failed", e);
    }
};

// --- Core Logic ---

/** 
 * Reconcile LocalStorage and IDB on boot.
 * Strategy: Last Write Wins? No. OLDEST Write Wins (Security).
 * If users clear cache (Local missing) but have IDB, we restore Local.
 * If they clear IDB but have Local, we restore IDB.
 */
export const syncGuestClock = async () => {
    try {
        const localStr = localStorage.getItem(STORAGE_KEY);
        const backupStr = await getBackupTimestamp();

        console.debug("[GuestLimit] Sync check", { local: localStr, backup: backupStr });

        if (!localStr && !backupStr) return; // Fresh user

        // If one is missing, restore it from the other
        if (localStr && !backupStr) {
            await saveBackupTimestamp(localStr);
            return;
        }
        
        if (!localStr && backupStr) {
            localStorage.setItem(STORAGE_KEY, backupStr);
            return;
        }

        // Both exist: Enforce the OLDER timestamp (Start Time)
        // This prevents extending the trial by manipulating one store
        if (localStr && backupStr) {
            const t1 = parseInt(localStr);
            const t2 = parseInt(backupStr);
            
            if (t2 < t1) {
                // Backup is older (real start), Local was likely reset. Enforce Backup.
                console.debug("[GuestLimit] Restoring older timestamp from backup");
                localStorage.setItem(STORAGE_KEY, backupStr);
            } else if (t1 < t2) {
                // Local is older, update backup
                await saveBackupTimestamp(localStr);
            }
        }
    } catch (e) {
        console.error("[GuestLimit] Sync failed", e);
    }
};

/** Initialize the guest clock the first time guest mode is activated. */
export const initGuestClock = (): void => {
  try {
    const nowStr = Date.now().toString();
    
    // 1. Set LocalStorage
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, nowStr);
    }
    
    // 2. Set Backup (Fire and forget)
    saveBackupTimestamp(localStorage.getItem(STORAGE_KEY) || nowStr);
    
  } catch {
    // localStorage unavailable (very rare) — do nothing
  }
};

/** Check guest status: expired flag and rounded days left. */
export const checkGuestStatus = (): { expired: boolean; daysLeft: number; daysUsed: number } => {
  try {
    const startStr = localStorage.getItem(STORAGE_KEY);
    if (!startStr) {
      // Fresh guest: clock not set yet (or user cleared storage)
      // We treat this as a fresh start unless enforced by other means
      return { expired: false, daysLeft: GUEST_LIMIT_DAYS, daysUsed: 0 };
    }
    
    const start = parseInt(startStr, 10);
    const now = Date.now();
    const diffMs = now - start;
    
    // 1 day = 1000 * 60 * 60 * 24 ms
    const daysUsed = diffMs / 86400000;
    const daysLeft = Math.max(0, Math.ceil(GUEST_LIMIT_DAYS - daysUsed));
    const expired = daysUsed >= GUEST_LIMIT_DAYS;
    
    return { expired, daysLeft, daysUsed };
  } catch {
    return { expired: false, daysLeft: GUEST_LIMIT_DAYS, daysUsed: 0 };
  }
};

/** Get the raw timestamp for export. */
export const getGuestStartTimestamp = (): string | null => {
    return localStorage.getItem(STORAGE_KEY);
};
