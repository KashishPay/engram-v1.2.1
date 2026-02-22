
const STACK_KEY = "engram_nav_stack";
const MAX_STACK_SIZE = 50;

function getStack(): string[] {
    try {
        const stored = sessionStorage.getItem(STACK_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveStack(stack: string[]) {
    try {
        sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
    } catch (e) {
        console.warn("[NAVSTACK] Failed to save stack", e);
    }
}

function normalizeHash(hash: string): string {
    if (!hash || hash === '#' || hash === '') return "#/home";
    if (hash.startsWith("#/")) return hash;
    if (hash.startsWith("#")) return "#/" + hash.substring(1);
    return "#/" + hash;
}

export const NavStack = {
    getStack: () => getStack(),

    pushHash: (rawHash: string) => {
        const hash = normalizeHash(rawHash);
        const stack = getStack();
        const last = stack[stack.length - 1];

        // Normalize stack top for comparison to ensure robustness
        const normalizedLast = last ? normalizeHash(last) : null;

        if (normalizedLast === hash) {
            // Avoid duplicates back-to-back
            return;
        }

        stack.push(hash);
        if (stack.length > MAX_STACK_SIZE) {
            stack.shift(); // Remove oldest
        }

        saveStack(stack);
        console.debug("[NAVSTACK] push", { hash, size: stack.length });
    },

    goBackHash: (fallbackHash: string) => {
        const stack = getStack();
        const currentHash = normalizeHash(window.location.hash);
        
        console.debug("[NAVSTACK] back request", { currentHash, stackSize: stack.length });

        // Remove current view from stack history
        stack.pop(); 
        
        const previous = stack[stack.length - 1];
        
        // Commit changes to storage before navigating
        saveStack(stack);

        if (previous) {
            console.debug("[NAVSTACK] restoring previous", previous);
            window.location.hash = previous;
        } else {
            const target = normalizeHash(fallbackHash);
            console.debug("[NAVSTACK] fallback to", target);
            window.location.hash = target;
        }
    },
    
    reset: () => {
        sessionStorage.removeItem(STACK_KEY);
    }
};
