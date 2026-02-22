
import { createClient } from '@supabase/supabase-js';

// --- SUPABASE CONFIGURATION ---
// Instructions:
// 1. Go to app.supabase.com -> Project Settings -> API
// 2. Copy the "URL" and "anon" (public) Key
// 3. Paste them below replacing "PASTE_LATER"
export const SUPABASE_URL = "https://yblssncisqtatxixagsd.supabase.co" as string;
export const SUPABASE_ANON_KEY = "sb_publishable_LWC4E_0skfYrJUvaZpvY2A_FHbtdBM_" as string;

// Main Auth/DB Configuration
export const SUPABASE_ENABLED = true;

// Helper to ensure we don't try to init with placeholders
const isSupabaseConfigured = SUPABASE_URL !== "PASTE_LATER" && SUPABASE_ANON_KEY !== "PASTE_LATER";
export const SUPABASE_READY = SUPABASE_ENABLED && isSupabaseConfigured;

let supabase = null;

if (SUPABASE_READY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true, // Auto-store session in localStorage
                autoRefreshToken: true,
                detectSessionInUrl: true // Enabled for Magic Link / Implicit Flow support
            }
        });
    } catch (e) {
        console.error("[Supabase] Initialization failed:", e);
    }
}

// Verification Log
console.log(`[Supabase] client status: enabled=${SUPABASE_ENABLED}, ready=${SUPABASE_READY}`);

export const deleteUserAccount = async () => {
    if (!supabase) throw new Error("Supabase not initialized");
    const { error } = await supabase.rpc('delete_user_account');
    if (error) throw error;
};

export { supabase };
