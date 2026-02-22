
/**
 * Utilities for detecting and debugging authentication payloads in the URL.
 * Handles standard query params, hash params, and "double-hash" scenarios.
 */

export const hasAuthPayload = (): boolean => {
    const h = window.location.href;
    return (
        h.includes("access_token=") ||
        h.includes("refresh_token=") ||
        h.includes("code=") ||
        h.includes("type=magiclink") ||
        h.includes("type=recovery") ||
        h.includes("error=") ||
        h.includes("error_description=")
    );
};

export const logAuthPayloadDebug = (tag: string) => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const hash = window.location.hash;

    // Helper to check presence in Query OR Hash (simple string check for hash)
    const check = (key: string) => {
        if (params.has(key)) return true;
        // Check for "key=" to avoid partial matches
        if (hash.includes(`${key}=`)) return true;
        return false;
    };

    // Extract 'type' specifically if present
    const getType = () => {
        if (params.get('type')) return params.get('type');
        const match = hash.match(/[?&]type=([^&]+)/);
        return match ? match[1] : undefined;
    };

    console.debug(`${tag} Auth Payload State:`, {
        hasCode: check('code'),
        hasAccess: check('access_token'),
        hasRefresh: check('refresh_token'),
        hasError: check('error'),
        type: getType(),
        // [PII REDACTION] Log length only, never the content
        hashLength: hash.length
    });
};
