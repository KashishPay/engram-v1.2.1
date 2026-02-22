
import { supabase } from './supabase';

export const ProfileService = {
    /**
     * Checks if the username is available using the DB RPC function.
     */
    checkUsernameAvailable: async (username: string): Promise<boolean> => {
        if (!supabase) return false;
        try {
            const { data, error } = await supabase.rpc('check_username_available', {
                username_input: username
            });
            if (error) throw error;
            return !!data;
        } catch (e) {
            console.error("Username check failed", e);
            return false;
        }
    },

    /**
     * Creates a profile for the current authenticated user.
     */
    createProfile: async (fullName: string, username: string, avatarUrl: string | null) => {
        if (!supabase) throw new Error("Supabase unavailable");
        
        const { data, error } = await supabase.rpc('create_user_profile', {
            display_name: fullName,
            username_input: username,
            avatar_url_input: avatarUrl
        });

        if (error) throw error;
        return data;
    },

    /**
     * Fetches the profile for the *currently authenticated* user.
     */
    getCurrentProfile: async () => {
        if (!supabase) return null;
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', session.user.id)
            .single();

        if (error) {
            // It's expected to fail if the user just signed up and hasn't onboarded
            return null;
        }
        return data;
    }
};
