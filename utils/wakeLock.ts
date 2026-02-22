
let wakeLockSentinel: any = null;

export const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
        try {
            // Check if already active
            if (wakeLockSentinel && !wakeLockSentinel.released) return;

            wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
            console.debug('[WakeLock] Active');
            
            wakeLockSentinel.addEventListener('release', () => {
                console.debug('[WakeLock] Released');
            });
        } catch (err: any) {
            // Fails gracefully (e.g. low battery)
            console.warn(`[WakeLock] Request failed: ${err.name}, ${err.message}`);
        }
    }
};

export const releaseWakeLock = async () => {
    if (wakeLockSentinel) {
        try {
            await wakeLockSentinel.release();
            wakeLockSentinel = null;
        } catch (err: any) {
            console.warn(`[WakeLock] Release Error: ${err.name}`);
        }
    }
};
