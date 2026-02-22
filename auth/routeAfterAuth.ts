
import { supabase } from '../services/supabase';
import { UserProfile } from '../types';

interface AuthRoutingCallbacks {
    navigateTo: (view: string) => void;
    setUserProfile: (profile: UserProfile) => void;
    setIsOnboarded: (isOnboarded: boolean) => void;
}

/**
 * Shared logic to route a user after a successful login (Email or OAuth).
 * Checks if the user has a profile in the database.
 * - If yes: Syncs profile state and goes to 'home'.
 * - If no: Goes to 'onboarding'.
 * 
 * deterministic target: "#/home"
 */
export const routeAfterAuth = async (session: any, callbacks: AuthRoutingCallbacks) => {
    const { navigateTo, setUserProfile, setIsOnboarded } = callbacks;

    // 1. Guard: Session Check
    if (!session?.user) {
        console.warn("[AUTH-ROUTER] No session user found. Fallback to home.");
        return navigateTo("home"); 
    }

    const userId = session.user.id;
    console.debug("[AUTH-ROUTER] Processing routing for User ID:", userId);

    try {
        // 2. Fetch Profile (Non-blocking UI check)
        const { data: profile, error } = await supabase
            .from("profiles")
            .select("user_id, full_name, username, avatar_url")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {
            console.error("[AUTH-ROUTER] Profile check failed:", error);
        }

        // 3. Deterministic Routing
        if (profile && profile.username) {
            console.debug("[AUTH-ROUTER] Profile found. User is onboarded. Routing to #/home");
            // Profile exists and is complete -> Sync State & Go Home
            setUserProfile({
                name: profile.full_name,
                avatar: profile.avatar_url || session.user.user_metadata?.avatar_url || null,
                username: profile.username
            });
            setIsOnboarded(true);
            navigateTo("home");
        } else {
            console.debug("[AUTH-ROUTER] Profile missing or incomplete. Redirecting to Onboarding.");
            // No profile or incomplete -> Onboarding
            setIsOnboarded(false);
            navigateTo("onboarding");
        }
    } catch (e) {
        console.error("[AUTH-ROUTER] Unexpected error during routing:", e);
        // Fallback safety: always allow access to home rather than stuck on blank screen
        navigateTo("home");
    }
};
