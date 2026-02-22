
/**
 * Navigates back using browser history if available, otherwise redirects to a fallback hash.
 * This ensures the Back button works even if the user landed directly on a sub-page (Deep Link)
 * and handles environments where history.back() is unreliable (AI Studio Preview / Iframes).
 * 
 * @param fallbackHash - The route to go to if history is empty or back fails (e.g., "#/settings")
 */
export function goBackOrFallback(fallbackHash: string) {
    const currentHash = window.location.hash;
    // Ensure hash format
    const targetHash = fallbackHash.startsWith('#') ? fallbackHash : `#/${fallbackHash}`;

    // 1. Preview/Iframe Detection
    // In these environments, history.back() often fails silently or doesn't update the hash.
    const isPreview = 
        window.location.protocol === 'blob:' ||
        window.location.origin.includes('scf.usercontent.goog') ||
        window.location.origin.includes('googleusercontent.com') ||
        window.self !== window.top;

    if (isPreview) {
        console.debug("[BACK] preview env -> direct fallback", { fallbackHash: targetHash });
        window.location.hash = targetHash;
        return;
    }

    // 2. Standard Browser Logic
    const hasHistory = window.history.length > 1;
    console.debug("[BACK] goBackOrFallback", { 
        currentHash, 
        fallbackHash: targetHash, 
        action: hasHistory ? 'history.back() attempt' : 'direct fallback'
    });
    
    if (hasHistory) {
        window.history.back();

        // 3. Verify & Fallback Mechanism
        // If history.back() didn't change the route within 80ms, force the fallback.
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (window.location.hash === currentHash) {
                    console.debug("[BACK] fallback applied (history.back failed)", { from: currentHash, to: targetHash });
                    window.location.hash = targetHash;
                }
            }, 80);
        });
    } else {
        window.location.hash = targetHash;
    }
}
