
/**
 * Normalizes malformed "double-hash" URLs often returned by OAuth providers in implicit/fragment mode.
 * Example:
 *   Input:  https://app.com/#/auth/callback#access_token=123&type=recovery
 *   Output: https://app.com/#/auth/callback?access_token=123&type=recovery
 * 
 * This ensures that standard routers (which expect one hash) and parsers (which expect ? for params)
 * can read the auth payload correctly.
 */
export function normalizeDoubleHashToQuery(): boolean {
    const { hash, href } = window.location;
    
    // Fast check: need at least two '#' characters
    const firstHashIndex = hash.indexOf('#');
    if (firstHashIndex === -1) return false;
    
    const secondHashIndex = hash.indexOf('#', firstHashIndex + 1);
    if (secondHashIndex === -1) return false;

    // Split into parts: ["", "/route", "payload"]
    const parts = hash.split('#');
    
    // We expect 3 parts for a standard double-hash scenario (empty, route, payload)
    if (parts.length < 3) return false;

    const route = parts[1] || '';
    const payload = parts.slice(2).join('#'); // Rejoin any further hashes in payload

    // Basic heuristic: payload should look like query params (key=value)
    if (!payload.includes('=')) return false;

    // Construct clean hash with '?' separator
    const cleanHash = `#${route}?${payload}`;

    // Replace state without reloading
    try {
        const urlObj = new URL(href);
        urlObj.hash = cleanHash;
        window.history.replaceState(null, document.title, urlObj.toString());
        console.debug("[Sanitizer] Normalized double-hash URL:", { from: hash, to: cleanHash });
        return true;
    } catch (e) {
        console.error("[Sanitizer] Failed to normalize URL", e);
        return false;
    }
}
