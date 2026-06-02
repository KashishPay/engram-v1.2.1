
import { ChatMessage, Topic } from '../types';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const DB_NAME = 'EngramDB';
const AUDIO_STORE = 'audio_files';
const IMAGE_STORE = 'image_files';
const TOPIC_BODY_STORE = 'topic_bodies';
const CHAT_HISTORY_STORE = 'chat_history'; // New Store
const DB_VERSION = 5; // Bumped from 4 to 5

// Safe DEV flag that works in no-build environments without crashing on process.env access
const DEV = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
            (typeof window !== 'undefined' && (
                window.location.hostname === 'localhost' ||
                window.location.hostname.includes('googleusercontent.com') ||
                window.location.hostname.includes('ai.studio')
            ));

// Performance Budget Logger
const checkPerfBudget = (name: string, start: number, limit: number) => {
    if (!DEV) return;
    const duration = performance.now() - start;
    if (duration > limit) {
        console.warn(`%c [Perf] ${name} exceeded budget: ${duration.toFixed(2)}ms (Limit: ${limit}ms)`, 'color: orange; font-weight: bold');
    } else {
        console.debug(`[Perf] ${name}: ${duration.toFixed(2)}ms`);
    }
};

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            dbPromise = null;
            reject(new Error("IndexedDB is not supported in this browser."));
            return;
        }

        let isResolved = false;
        const timeoutId = setTimeout(() => {
            if (!isResolved) {
                console.warn("[Storage] IndexedDB open timed out.");
                dbPromise = null;
                reject(new Error("IndexedDB open timed out"));
            }
        }, 3000);

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            
            if (!db.objectStoreNames.contains(AUDIO_STORE)) {
                db.createObjectStore(AUDIO_STORE);
            }
            if (!db.objectStoreNames.contains(IMAGE_STORE)) {
                db.createObjectStore(IMAGE_STORE);
            }
            if (!db.objectStoreNames.contains(TOPIC_BODY_STORE)) {
                db.createObjectStore(TOPIC_BODY_STORE);
            }
            // New Store for Chat Persistence
            if (!db.objectStoreNames.contains(CHAT_HISTORY_STORE)) {
                db.createObjectStore(CHAT_HISTORY_STORE);
            }
        };

        request.onblocked = () => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeoutId);
            console.warn("[Storage] IndexedDB open blocked. Please close other tabs.");
            dbPromise = null;
            reject(new Error("IndexedDB blocked"));
        };

        request.onsuccess = (event) => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeoutId);
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
            if (isResolved) return;
            const error = (event.target as IDBOpenDBRequest).error;
            
            // ROLLBACK PROTECTION: Smart Open
            if (error?.name === 'VersionError') {
                console.warn(`[Storage] Version mismatch (Disk > App). Attempting Smart Open...`);
                const retry = indexedDB.open(DB_NAME); 
                
                retry.onsuccess = (e) => {
                    if (isResolved) return;
                    isResolved = true;
                    clearTimeout(timeoutId);
                    console.info("[Storage] Smart Open successful. Running in compatibility mode.");
                    resolve((e.target as IDBOpenDBRequest).result);
                };
                
                retry.onerror = (e) => {
                    if (isResolved) return;
                    isResolved = true;
                    clearTimeout(timeoutId);
                    const retryError = (e.target as IDBOpenDBRequest).error;
                    console.error("[Storage] Smart Open failed.", retryError);
                    dbPromise = null;
                    reject(retryError || error);
                };
            } else {
                isResolved = true;
                clearTimeout(timeoutId);
                dbPromise = null;
                reject(error);
            }
        };
    });

    return dbPromise;
};

export const closeDB = async (): Promise<void> => {
    if (dbPromise) {
        try {
            const db = await dbPromise;
            db.close();
        } catch {
            console.warn("[Storage] Error closing DB", e);
        }
        dbPromise = null;
    }
};

// --- Helper to create namespaced key ---
const getBodyKey = (userId: string, topicId: string) => `${userId}:${topicId}`;

// --- Topic Body Storage (Text) ---

export const saveTopicBodyToIDB = async (userId: string, topicId: string, content: string): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try {
            try { await Filesystem.mkdir({ path: 'topic_bodies', directory: Directory.Data, recursive: true }); } catch { /* ignore */ }
            await Filesystem.writeFile({
                path: `topic_bodies/${getBodyKey(userId, topicId)}.txt`,
                data: content,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return;
        } catch {
            console.error("Capacitor Topic Body Save Error:", e);
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(TOPIC_BODY_STORE, 'readwrite');
            const store = transaction.objectStore(TOPIC_BODY_STORE);
            const request = store.put(content, getBodyKey(userId, topicId));

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch {
        console.error("IndexedDB Topic Body Save Error:", e);
        throw e;
    }
};

export const getTopicBodyFromIDB = async (userId: string, topicId: string): Promise<string | undefined> => {
    const start = performance.now();
    if (Capacitor.isNativePlatform()) {
        try {
            const res = await Filesystem.readFile({
                path: `topic_bodies/${getBodyKey(userId, topicId)}.txt`,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            checkPerfBudget(`fetch_body_${topicId.slice(0, 5)}`, start, 150);
            return res.data as string;
        } catch {
            return "";
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(TOPIC_BODY_STORE, 'readonly');
            const store = transaction.objectStore(TOPIC_BODY_STORE);
            const request = store.get(getBodyKey(userId, topicId));

            request.onsuccess = () => {
                checkPerfBudget(`fetch_body_${topicId.slice(0, 5)}`, start, 150);
                resolve(request.result);
            };
            request.onerror = () => {
                console.warn(`Failed to read body for ${topicId}, returning empty.`);
                resolve(""); 
            };
        });
    } catch {
        console.error("IndexedDB Topic Body Read Error (Critical):", e);
        return ""; 
    }
};

export const deleteTopicBodyFromIDB = async (userId: string, topicId: string): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try {
            await Filesystem.deleteFile({
                path: `topic_bodies/${getBodyKey(userId, topicId)}.txt`,
                directory: Directory.Data
            });
        } catch { /* ignore */ }
        
        // Opportunistic cleanup of source images and chat history
        deleteTopicSourcesFromIDB(topicId).catch(e => console.warn("Source cleanup warning", e));
        deleteChatHistoryFromIDB(userId, topicId).catch(e => console.warn("Chat cleanup warning", e));
        return;
    }

    try {
        const db = await openDB();
        const tx = db.transaction(TOPIC_BODY_STORE, 'readwrite');
        const store = tx.objectStore(TOPIC_BODY_STORE);
        store.delete(getBodyKey(userId, topicId));
        
        // Opportunistic cleanup of source images and chat history
        deleteTopicSourcesFromIDB(topicId).catch(e => console.warn("Source cleanup warning", e));
        deleteChatHistoryFromIDB(userId, topicId).catch(e => console.warn("Chat cleanup warning", e));

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        console.error("IndexedDB Topic Body Delete Error:", e);
    }
};

// --- Chat History Storage (New) ---

export const saveChatToIDB = async (userId: string, topicId: string, messages: ChatMessage[]): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try {
            try { await Filesystem.mkdir({ path: 'chat_history', directory: Directory.Data, recursive: true }); } catch { /* ignore */ }
            await Filesystem.writeFile({
                path: `chat_history/${getBodyKey(userId, topicId)}.txt`,
                data: JSON.stringify(messages),
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return;
        } catch {
            console.error("Capacitor Chat Save Error:", e);
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CHAT_HISTORY_STORE, 'readwrite');
            const store = transaction.objectStore(CHAT_HISTORY_STORE);
            // We store the array directly under the namespaced key
            const request = store.put(messages, getBodyKey(userId, topicId));

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch {
        console.error("IndexedDB Chat Save Error:", e);
    }
};

export const getChatFromIDB = async (userId: string, topicId: string): Promise<ChatMessage[] | undefined> => {
    if (Capacitor.isNativePlatform()) {
        try {
            const res = await Filesystem.readFile({
                path: `chat_history/${getBodyKey(userId, topicId)}.txt`,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return JSON.parse(res.data as string);
        } catch {
            return undefined;
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(CHAT_HISTORY_STORE, 'readonly');
            const store = transaction.objectStore(CHAT_HISTORY_STORE);
            const request = store.get(getBodyKey(userId, topicId));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(undefined);
        });
    } catch {
        console.error("IndexedDB Chat Read Error:", e);
        return undefined;
    }
};

export const deleteChatHistoryFromIDB = async (userId: string, topicId: string): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try {
            await Filesystem.deleteFile({
                path: `chat_history/${getBodyKey(userId, topicId)}.txt`,
                directory: Directory.Data
            });
        } catch { /* ignore */ }
        return;
    }

    try {
        const db = await openDB();
        const tx = db.transaction(CHAT_HISTORY_STORE, 'readwrite');
        tx.objectStore(CHAT_HISTORY_STORE).delete(getBodyKey(userId, topicId));
        return new Promise((resolve) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        console.warn("Failed to delete chat history", e);
    }
};

// --- Batch Helpers for Backup ---

export const batchGetTopicBodies = async (userId: string, topicIds: string[]): Promise<Record<string, string>> => {
    if (Capacitor.isNativePlatform()) {
        const results: Record<string, string> = {};
        for (const id of topicIds) {
            try {
                const res = await Filesystem.readFile({
                    path: `topic_bodies/${getBodyKey(userId, id)}.txt`,
                    directory: Directory.Data,
                    encoding: Encoding.UTF8
                });
                if (res.data) results[id] = res.data as string;
            } catch { /* ignore */ }
        }
        return results;
    }

    try {
        const db = await openDB();
        const results: Record<string, string> = {};
        for (const id of topicIds) {
            const val = await new Promise<string | undefined>((resolve) => {
                const tx = db.transaction(TOPIC_BODY_STORE, 'readonly');
                const req = tx.objectStore(TOPIC_BODY_STORE).get(getBodyKey(userId, id));
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(undefined);
            });
            if (val) results[id] = val;
        }
        return results;
    } catch {
        console.error("Batch Body Read Error:", e);
        return {};
    }
};

export const batchSaveTopicBodies = async (userId: string, map: Record<string, string>): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try { await Filesystem.mkdir({ path: 'topic_bodies', directory: Directory.Data, recursive: true }); } catch { /* ignore */ }
        for (const [id, content] of Object.entries(map)) {
            try {
                await Filesystem.writeFile({
                    path: `topic_bodies/${getBodyKey(userId, id)}.txt`,
                    data: content,
                    directory: Directory.Data,
                    encoding: Encoding.UTF8
                });
            } catch {
                console.error("Capacitor Batch Body Save Error:", e);
            }
        }
        return;
    }

    try {
        const db = await openDB();
        const tx = db.transaction(TOPIC_BODY_STORE, 'readwrite');
        const store = tx.objectStore(TOPIC_BODY_STORE);
        
        Object.entries(map).forEach(([id, content]) => {
            store.put(content, getBodyKey(userId, id));
        });
        
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        console.error("Batch Body Save Error:", e);
        throw e;
    }
};

export const batchGetImages = async (imageIds: string[]): Promise<Record<string, string>> => {
    if (Capacitor.isNativePlatform()) {
        const results: Record<string, string> = {};
        for (const id of imageIds) {
            try {
                const res = await Filesystem.readFile({
                    path: `images/${id}.txt`,
                    directory: Directory.Data,
                    encoding: Encoding.UTF8
                });
                if (res.data) results[id] = res.data as string;
            } catch {
                // ignore
            }
        }
        return results;
    }

    try {
        const db = await openDB();
        const results: Record<string, string> = {};
        for (const id of imageIds) {
            const val = await new Promise<string | undefined>((resolve) => {
                const tx = db.transaction(IMAGE_STORE, 'readonly');
                const req = tx.objectStore(IMAGE_STORE).get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(undefined);
            });
            if (val) results[id] = val;
        }
        return results;
    } catch {
        console.error("Batch Image Read Error:", e);
        return {};
    }
};

export const batchGetOriginalImages = async (topicIds: string[]): Promise<Record<string, string>> => {
    if (Capacitor.isNativePlatform()) {
        const results: Record<string, string> = {};
        for (const topicId of topicIds) {
            try {
                const dir = await Filesystem.readdir({ path: 'images', directory: Directory.Data });
                const files = dir.files.map(f => typeof f === 'string' ? f : f.name).filter(f => f.startsWith(`source_${topicId}_`) && f.endsWith('.txt'));
                for (const f of files) {
                    const res = await Filesystem.readFile({ path: `images/${f}`, directory: Directory.Data, encoding: Encoding.UTF8 });
                    if (res.data) results[f.replace('.txt', '')] = res.data as string;
                }
            } catch { /* ignore */ }
        }
        return results;
    }

    try {
        const db = await openDB();
        const results: Record<string, string> = {};
        
        for (const topicId of topicIds) {
            await new Promise<void>((resolve) => {
                const tx = db.transaction(IMAGE_STORE, 'readonly');
                const store = tx.objectStore(IMAGE_STORE);
                const prefix = `source_${topicId}_`;
                const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false);
                
                const req = store.openCursor(range);
                req.onsuccess = (e) => {
                    const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
                    if (cursor) {
                        results[cursor.key as string] = cursor.value;
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                req.onerror = () => resolve();
            });
        }
        return results;
    } catch {
        console.error("Batch Original Image Read Error:", e);
        return {};
    }
};

export const batchSaveImages = async (map: Record<string, string>): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        for (const [id, base64] of Object.entries(map)) {
            try {
                // Ignore error if directory already exists
                try {
                    await Filesystem.mkdir({ path: 'images', directory: Directory.Data, recursive: true });
                } catch { /* ignore */ }
                await Filesystem.writeFile({
                    path: `images/${id}.txt`,
                    data: base64,
                    directory: Directory.Data,
                    encoding: Encoding.UTF8
                });
            } catch {
                console.error("Capacitor Batch Image Save Error:", e);
            }
        }
        return;
    }

    try {
        const db = await openDB();
        const tx = db.transaction(IMAGE_STORE, 'readwrite');
        const store = tx.objectStore(IMAGE_STORE);
        
        Object.entries(map).forEach(([id, base64]) => {
            store.put(base64, id);
        });
        
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        console.error("Batch Image Save Error:", e);
        throw e;
    }
};

export const batchGetChatHistories = async (userId: string, topicIds: string[]): Promise<Record<string, ChatMessage[]>> => {
    if (Capacitor.isNativePlatform()) {
        const results: Record<string, ChatMessage[]> = {};
        for (const id of topicIds) {
            try {
                const res = await Filesystem.readFile({
                    path: `chat_history/${getBodyKey(userId, id)}.txt`,
                    directory: Directory.Data,
                    encoding: Encoding.UTF8
                });
                if (res.data) results[id] = JSON.parse(res.data as string);
            } catch { /* ignore */ }
        }
        return results;
    }

    try {
        const db = await openDB();
        const results: Record<string, ChatMessage[]> = {};
        for (const id of topicIds) {
            const val = await new Promise<ChatMessage[] | undefined>((resolve) => {
                const tx = db.transaction(CHAT_HISTORY_STORE, 'readonly');
                const req = tx.objectStore(CHAT_HISTORY_STORE).get(getBodyKey(userId, id));
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(undefined);
            });
            if (val) results[id] = val;
        }
        return results;
    } catch {
        console.error("Batch Chat Read Error:", e);
        return {};
    }
};

export const batchSaveChatHistories = async (userId: string, map: Record<string, ChatMessage[]>): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try { await Filesystem.mkdir({ path: 'chat_history', directory: Directory.Data, recursive: true }); } catch { /* ignore */ }
        for (const [id, messages] of Object.entries(map)) {
            try {
                await Filesystem.writeFile({
                    path: `chat_history/${getBodyKey(userId, id)}.txt`,
                    data: JSON.stringify(messages),
                    directory: Directory.Data,
                    encoding: Encoding.UTF8
                });
            } catch { /* ignore */ }
        }
        return;
    }

    try {
        const db = await openDB();
        const tx = db.transaction(CHAT_HISTORY_STORE, 'readwrite');
        const store = tx.objectStore(CHAT_HISTORY_STORE);
        
        Object.entries(map).forEach(([id, messages]) => {
            store.put(messages, getBodyKey(userId, id));
        });
        
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        console.error("Batch Chat Save Error:", e);
        throw e;
    }
};

export const ensureTopicContent = async (userId: string, topic: Topic): Promise<Topic> => {
    if (topic.shortNotes && topic.shortNotes.length > 0) return topic;
    const body = await getTopicBodyFromIDB(userId, topic.id);
    return { ...topic, shortNotes: body || "" };
};

// --- Audio Storage ---

export const saveAudioToIDB = async (topicId: string, audioData: Blob | string): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try {
            let dataStr = "";
            if (typeof audioData === 'string') {
                dataStr = audioData;
            } else {
                dataStr = await new Promise((res, rej) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result as string);
                    reader.onerror = rej;
                    reader.readAsDataURL(audioData);
                });
            }
            try {
                await Filesystem.mkdir({ path: 'audio', directory: Directory.Data, recursive: true });
            } catch { /* ignore */ }
            
            await Filesystem.writeFile({
                path: `audio/${topicId}.txt`,
                data: dataStr,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return;
        } catch {
            console.error("Capacitor Audio Save Error:", e);
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(AUDIO_STORE, 'readwrite');
            const store = transaction.objectStore(AUDIO_STORE);
            const request = store.put(audioData, topicId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch {
        console.error("IndexedDB Audio Save Error:", e);
        throw e;
    }
};

export const getAudioFromIDB = async (topicId: string): Promise<Blob | string | undefined> => {
    if (Capacitor.isNativePlatform()) {
        try {
            const result = await Filesystem.readFile({
                path: `audio/${topicId}.txt`,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return result.data as string;
        } catch {
            // might not exist
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(AUDIO_STORE, 'readonly');
            const store = transaction.objectStore(AUDIO_STORE);
            const request = store.get(topicId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch {
        console.error("IndexedDB Audio Read Error:", e);
        return undefined;
    }
};

export const getAllAudioKeys = async (): Promise<string[]> => {
    if (Capacitor.isNativePlatform()) {
        try {
            const dir = await Filesystem.readdir({ path: 'audio', directory: Directory.Data });
            return dir.files.map(f => typeof f === 'string' ? f : f.name).map(f => f.replace('.txt', ''));
        } catch {
            return [];
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(AUDIO_STORE, 'readonly');
            const store = transaction.objectStore(AUDIO_STORE);
            const request = store.getAllKeys();

            request.onsuccess = () => resolve(request.result as string[]);
            request.onerror = () => reject(request.error);
        });
    } catch {
        console.error("IndexedDB Audio Key Fetch Error:", e);
        return [];
    }
};

export const getAllTopicBodyKeys = async (userId: string): Promise<string[]> => {
    if (Capacitor.isNativePlatform()) {
        try {
            const dir = await Filesystem.readdir({ path: 'topic_bodies', directory: Directory.Data });
            const prefix = `${userId}:`;
            return dir.files
                .map(f => typeof f === 'string' ? f : f.name)
                .filter(f => f.startsWith(prefix) && f.endsWith('.txt'))
                .map(f => f.replace('.txt', '').replace(prefix, ''));
        } catch {
            return [];
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(TOPIC_BODY_STORE, 'readonly');
            const store = tx.objectStore(TOPIC_BODY_STORE);
            const prefix = `${userId}:`;
            const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
            const req = store.getAllKeys(range);
            req.onsuccess = () => {
                const keys = (req.result as string[]).map(k => k.replace(prefix, ''));
                resolve(keys);
            };
            req.onerror = () => resolve([]);
        });
    } catch {
        console.error("IndexedDB Topic Body Key Fetch Error:", e);
        return [];
    }
};

export const deleteAudioFromIDB = async (topicId: string): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try {
            await Filesystem.deleteFile({
                path: `audio/${topicId}.txt`,
                directory: Directory.Data
            });
        } catch { /* ignore */ }
    }

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(AUDIO_STORE, 'readwrite');
            const store = transaction.objectStore(AUDIO_STORE);
            const request = store.delete(topicId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch {
        console.error("IndexedDB Audio Delete Error:", e);
    }
};

// --- Image Storage ---

export const saveImageToIDB = async (imageId: string, base64Image: string): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try {
            await Filesystem.writeFile({
                path: `images/${imageId}.txt`,
                data: base64Image,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return;
        } catch {
            console.error("Capacitor Image Save Error:", e);
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(IMAGE_STORE, 'readwrite');
            const store = transaction.objectStore(IMAGE_STORE);
            const request = store.put(base64Image, imageId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch {
        console.error("IndexedDB Image Save Error:", e);
        throw e;
    }
};

export const getImageFromIDB = async (imageId: string): Promise<string | undefined> => {
    if (Capacitor.isNativePlatform()) {
        try {
            const result = await Filesystem.readFile({
                path: `images/${imageId}.txt`,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return result.data as string;
        } catch {
            // Might not exist
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(IMAGE_STORE, 'readonly');
            const store = transaction.objectStore(IMAGE_STORE);
            const request = store.get(imageId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch {
        console.error("IndexedDB Image Read Error:", e);
        return undefined;
    }
};

// --- Source Image Helpers (Append/Count/Delete) ---

export const getNextSourceIndex = async (topicId: string): Promise<number> => {
    if (Capacitor.isNativePlatform()) {
        try {
            const dir = await Filesystem.readdir({ path: 'images', directory: Directory.Data });
            const files = dir.files.map(f => typeof f === 'string' ? f : f.name).filter(f => f.startsWith(`source_${topicId}_`) && f.endsWith('.txt'));
            if (files.length === 0) return 0;
            let max = -1;
            files.forEach(f => {
                const parts = f.replace('.txt', '').split('_');
                const idx = parseInt(parts[parts.length - 1], 10);
                if (!isNaN(idx) && idx > max) max = idx;
            });
            return max + 1;
        } catch {
            return 0;
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(IMAGE_STORE, 'readonly');
            const store = tx.objectStore(IMAGE_STORE);
            const prefix = `source_${topicId}_`;
            const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
            
            if (store.getAllKeys) {
                const req = store.getAllKeys(range);
                req.onsuccess = () => {
                    const keys = req.result as string[];
                    if (keys.length === 0) {
                        resolve(0);
                        return;
                    }
                    let max = -1;
                    keys.forEach(k => {
                        const parts = k.split('_');
                        const idx = parseInt(parts[parts.length - 1], 10);
                        if (!isNaN(idx) && idx > max) max = idx;
                    });
                    resolve(max + 1);
                };
                req.onerror = () => resolve(0);
            } else {
                let max = -1;
                const req = store.openCursor(range);
                req.onsuccess = (e) => {
                    const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
                    if (cursor) {
                        const parts = (cursor.key as string).split('_');
                        const idx = parseInt(parts[parts.length - 1], 10);
                        if (!isNaN(idx) && idx > max) max = idx;
                        cursor.continue();
                    } else {
                        resolve(max + 1);
                    }
                };
                req.onerror = () => resolve(0);
            }
        });
    } catch {
        console.warn("Failed to get next index", e);
        return 0;
    }
};

export const getSourceImageCount = async (topicId: string): Promise<number> => {
    if (Capacitor.isNativePlatform()) {
        try {
            const dir = await Filesystem.readdir({ path: 'images', directory: Directory.Data });
            const files = dir.files.map(f => typeof f === 'string' ? f : f.name).filter(f => f.startsWith(`source_${topicId}_`) && f.endsWith('.txt'));
            return files.length;
        } catch {
            return 0;
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(IMAGE_STORE, 'readonly');
            const store = tx.objectStore(IMAGE_STORE);
            const prefix = `source_${topicId}_`;
            const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
            
            if (store.count) {
                const req = store.count(range);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(0);
            } else {
                const req = store.getAllKeys(range);
                req.onsuccess = () => resolve(req.result.length);
                req.onerror = () => resolve(0);
            }
        });
    } catch {
        return 0;
    }
};

export const deleteTopicSourcesFromIDB = async (topicId: string): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try {
            const dir = await Filesystem.readdir({ path: 'images', directory: Directory.Data });
            const files = dir.files.map(f => typeof f === 'string' ? f : f.name).filter(f => f.startsWith(`source_${topicId}_`) && f.endsWith('.txt'));
            for (const f of files) {
                await Filesystem.deleteFile({ path: `images/${f}`, directory: Directory.Data });
            }
        } catch { /* ignore */ }
    }

    try {
        const db = await openDB();
        const tx = db.transaction(IMAGE_STORE, 'readwrite');
        const store = tx.objectStore(IMAGE_STORE);
        const prefix = `source_${topicId}_`;
        const range = IDBKeyRange.bound(prefix, prefix + '\uffff');

        if (store.getAllKeys) {
            store.getAllKeys(range).onsuccess = (e) => {
                const keys = (e.target as IDBRequest).result as string[];
                keys.forEach(k => store.delete(k));
            };
        } else {
            for (let i = 0; i < 100; i++) {
                store.delete(`${prefix}${i}`);
            }
        }
        
        return new Promise((resolve) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve(); 
        });
    } catch {
        console.warn("Failed to delete source images", e);
    }
};

// --- Heavy Array Storage (Histories & Lists) ---

export const saveLargeJSONToIDB = async (key: string, data: unknown): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
        try {
            try { await Filesystem.mkdir({ path: 'json_store', directory: Directory.Data, recursive: true }); } catch { /* ignore */ }
            await Filesystem.writeFile({
                path: `json_store/${key}.txt`,
                data: JSON.stringify(data),
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return;
        } catch {
            console.error("Capacitor JSON Save Error:", e);
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(TOPIC_BODY_STORE, 'readwrite'); // Reusing TOPIC_BODY_STORE for big strings
            const store = tx.objectStore(TOPIC_BODY_STORE);
            const req = store.put(JSON.stringify(data), `json_${key}`);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch {
        console.error("IDB Save Error", e);
    }
};

export const getLargeJSONFromIDB = async <T>(key: string, defaultValue: T): Promise<T> => {
    if (Capacitor.isNativePlatform()) {
        try {
            const res = await Filesystem.readFile({
                path: `json_store/${key}.txt`,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            if (res.data) return JSON.parse(res.data as string) as T;
        } catch {
            return defaultValue;
        }
    }

    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(TOPIC_BODY_STORE, 'readonly');
            const store = tx.objectStore(TOPIC_BODY_STORE);
            const req = store.get(`json_${key}`);
            req.onsuccess = () => {
                if (req.result) {
                    try {
                        resolve(JSON.parse(req.result) as T);
                    } catch {
                        resolve(defaultValue);
                    }
                } else {
                    resolve(defaultValue);
                }
            };
            req.onerror = () => resolve(defaultValue);
        });
    } catch {
        return defaultValue;
    }
};

export const migrateLocalStorageHistories = async (userId: string) => {
    const keys = [
        `engram-flashcard-history_${userId}`,
        `engramTasks_${userId}`,
        `engramMatrix_${userId}`,
        `engram_test_series_history_${userId}`,
        `engram_test_series_past_questions_${userId}`,
        // Data and subjects shouldn't be migrated since they are actively modified very frequently by hooks. We can migrate them if we move everything.
    ];

    for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                await saveLargeJSONToIDB(key, parsed);
                // Optionally remove from local storage after successful migration to save space
                // localStorage.removeItem(key);
            } catch { /* ignore */ }
        }
    }
};
