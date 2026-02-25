
let wakeLockSentinel: { released: boolean; release: () => Promise<void>; addEventListener: (event: string, cb: () => void) => void } | null = null;

export const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
        try {
            // Check if already active
            if (wakeLockSentinel && !wakeLockSentinel.released) return;

            wakeLockSentinel = await (navigator as unknown as { wakeLock: { request: (type: string) => Promise<{ released: boolean; release: () => Promise<void>; addEventListener: (event: string, cb: () => void) => void }> } }).wakeLock.request('screen');
            console.debug('[WakeLock] Active');
            
            wakeLockSentinel.addEventListener('release', () => {
                console.debug('[WakeLock] Released');
            });
        } catch (err: unknown) {
            // Fails gracefully (e.g. low battery)
            console.warn(`[WakeLock] Request failed: ${(err as Error).name}, ${(err as Error).message}`);
        }
    }
};

export const releaseWakeLock = async () => {
    if (wakeLockSentinel) {
        try {
            await wakeLockSentinel.release();
            wakeLockSentinel = null;
        } catch (err: unknown) {
            console.warn(`[WakeLock] Release Error: ${(err as Error).name}`);
        }
    }
};
