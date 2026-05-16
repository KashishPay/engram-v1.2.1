import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { getOAuthAppOrigin } from '../utils/authEnv';
import { initGuestClock } from '../utils/guestLimit';

// Minimal User Shim to replace Firebase User interface
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isGuest: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    // Check if user selected Guest Mode previously
    const storedGuest = localStorage.getItem('engram_is_guest');
    if (storedGuest === 'true') {
        setIsGuest(true);
        setLoading(false);
    }

    // Supabase Auth State Listener
    if (!supabase) {
        console.error("Supabase client is not initialized.");
        setLoading(false);
        return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        console.debug("[AUTH] onAuthStateChange event", _event, { 
            hasSession: !!session, 
            userId: session?.user?.id, 
            email: session?.user?.email 
        });
        
        if (session?.user) {
            // Adapt Supabase user to match local User interface
            const adaptedUser: User = {
                uid: session.user.id,
                email: session.user.email || null,
                displayName: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
                photoURL: session.user.user_metadata?.avatar_url || null,
            };
            setUser(adaptedUser);
            setIsGuest(false);
            localStorage.removeItem('engram_is_guest');
        } else {
            setUser(null);
        }
        setLoading(false);
    });

    // [POPUP FLOW] Listen for success message from OAuth popup
    const handleMessage = async (event: MessageEvent) => {
        // Security: Validate origin if possible, but '*' is often needed for dynamic previews
        if (event.data?.type === 'ENGRAM_OAUTH_SUCCESS') {
            const { session } = event.data;
            if (session && session.access_token) {
                console.debug("[AUTH] Received OAuth success from popup. Hydrating session...");
                const { error } = await supabase.auth.setSession({
                    access_token: session.access_token,
                    refresh_token: session.refresh_token
                });
                if (error) console.error("[AUTH] Failed to set session from popup", error);
            }
        }
    };
    window.addEventListener('message', handleMessage);

    return () => {
        subscription.unsubscribe();
        window.removeEventListener('message', handleMessage);
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!supabase) return;
    
    const redirectTo = `${getOAuthAppOrigin()}/#/auth/callback`;
    
    console.debug("[AUTH] signInWithOAuth start", { 
        redirectTo, 
        origin: window.location.origin, 
    });
    
    const { data, error } = await supabase.auth.signInWithOAuth({ 
        provider: 'google',
        options: { 
            redirectTo,
            skipBrowserRedirect: true
        }
    });

    console.debug("[AUTH] signInWithGoogle result", { hasUrl: !!data?.url, error });

    if (error) {
        alert("Login Error: " + error.message);
        return;
    }

    if (data?.url) {
        console.debug("[AUTH] Redirecting to:", data.url);
        window.location.href = data.url;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
      if (!supabase) throw new Error("Auth service unavailable");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
      if (!supabase) throw new Error("Auth service unavailable");
      const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { full_name: name } }
      });
      if (error) throw error;
  };

  const logout = async () => {
    console.debug("[AUTH] Logout requested");
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setIsGuest(false);
    localStorage.removeItem('engram_is_guest');
  };

  const continueAsGuest = () => {
      console.debug("[AUTH] Continuing as guest");
      initGuestClock();
      setIsGuest(true);
      localStorage.setItem('engram_is_guest', 'true');
  };

  return (
    <AuthContext.Provider value={{ user, loading, isGuest, signInWithGoogle, signInWithEmail, signUpWithEmail, logout, continueAsGuest }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};