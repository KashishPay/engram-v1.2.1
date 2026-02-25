
import React, { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { supabase } from '../services/supabase';
import { routeAfterAuth } from '../auth/routeAfterAuth';
import { UserProfile } from '../types';
import { ENABLE_PASSWORD_RECOVERY } from '../config/auth';
import { ErrorCard } from '../components/ErrorCard';

interface AuthCallbackViewProps {
    navigateTo: (view: string) => void;
    setUserProfile: (profile: UserProfile) => void;
    setIsOnboarded: (isOnboarded: boolean) => void;
    themeColor: string;
}

// Robust helper to extract params from Query, Hash Query, or Nested Hash fragments
const extractAuthParams = () => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search); // Start with standard query params

    const hash = window.location.hash;
    
    // 1. Standard Hash Params (e.g. #/auth/callback?code=...)
    if (hash.includes('?')) {
        const queryPart = hash.split('?')[1];
        if (queryPart) {
            new URLSearchParams(queryPart).forEach((v, k) => params.set(k, v));
        }
    }

    // 2. Implicit Flow / Magic Link often puts tokens after the LAST hash
    // e.g. #/auth/callback#access_token=...
    // We split by '#' and check the last segment
    const parts = window.location.href.split('#');
    if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        // Only treat as params if it looks like key=value
        if (lastPart.includes('=') && (lastPart.includes('access_token') || lastPart.includes('refresh_token') || lastPart.includes('error'))) {
             new URLSearchParams(lastPart).forEach((v, k) => params.set(k, v));
        }
    }

    return {
        code: params.get('code'),
        error: params.get('error'),
        errorDescription: params.get('error_description'),
        type: params.get('type'),
        accessToken: params.get('access_token'),
        refreshToken: params.get('refresh_token') || undefined, // Optional
    };
};

export const AuthCallbackView: React.FC<AuthCallbackViewProps> = ({ 
    navigateTo, 
    setUserProfile, 
    setIsOnboarded, 
    themeColor 
}) => {
    const hasCalled = useRef(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isLongWait, setIsLongWait] = useState(false);

    useEffect(() => {
        if (hasCalled.current) return;
        hasCalled.current = true;

        const handleCallback = async () => {
            // [PII REDACTION] Do not log full href as it may contain tokens
            console.debug("[CALLBACK] mounted");
            
            const timeoutId = setTimeout(() => {
                setIsLongWait(true);
            }, 8000);

            try {
                // 1. Extract All Params
                const { code, error, errorDescription, type, accessToken, refreshToken } = extractAuthParams();

                // [DIAGNOSIS LOG]
                console.debug("[AUTH] callback params", { 
                    type, 
                    hasCode: !!code, 
                    hasError: !!error,
                    hasAccessToken: !!accessToken
                });

                // GUARD: Check feature flags
                if (type === 'recovery' && !ENABLE_PASSWORD_RECOVERY) {
                    throw new Error("Password recovery is currently disabled.");
                }

                // 2. Handle Explicit Errors
                if (error) {
                    throw new Error(errorDescription || error || "Authentication failed.");
                }

                // 3. Handle Token Hydration (Implicit / Magic Link)
                if (accessToken) {
                    console.debug("[CALLBACK] implicit token detected, hydrating session...");

                    // [POPUP FLOW] If we are in a popup, send the session to the opener and close
                    if (window.opener && window.opener !== window) {
                        console.debug("[CALLBACK] detected popup mode, sending message to opener");
                        window.opener.postMessage({ 
                            type: 'ENGRAM_OAUTH_SUCCESS', 
                            session: { 
                                access_token: accessToken, 
                                refresh_token: refreshToken 
                            } 
                        }, '*');
                        
                        // Small delay to ensure message is sent before closing
                        setTimeout(() => window.close(), 500);
                        return;
                    }

                    const { data, error: sessionError } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken || undefined
                    });

                    if (sessionError) throw sessionError;

                    if (data.session) {
                        // CLEANUP URL SAFELY
                        try {
                            const cleanUrl = new URL(window.location.href);
                            ["code", "error", "error_description", "type"].forEach(p => cleanUrl.searchParams.delete(p));

                            // Remove anything after '?' in the hash
                            if (cleanUrl.hash.includes("?")) {
                                cleanUrl.hash = cleanUrl.hash.split("?")[0];
                            }
                            // Remove any extra fragment after '#'
                            if (cleanUrl.hash.includes("#")) {
                                cleanUrl.hash = cleanUrl.hash.split("#")[0];
                            }

                            window.history.replaceState({}, document.title, cleanUrl.toString());
                        } catch {
                            console.warn("[CALLBACK] replaceState failed (likely blob sandbox). Using location hash fallback.");
                            window.location.hash = '#/auth/callback';
                        }
                    }
                }

                // 4. Handle Code Exchange (PKCE)
                if (code) {
                    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
                    
                    if (exchangeError) throw exchangeError;

                    // [POPUP FLOW] If we are in a popup, send the session to the opener and close
                    if (window.opener && window.opener !== window && data.session) {
                        console.debug("[CALLBACK] detected popup mode (PKCE), sending message to opener");
                        window.opener.postMessage({ 
                            type: 'ENGRAM_OAUTH_SUCCESS', 
                            session: { 
                                access_token: data.session.access_token, 
                                refresh_token: data.session.refresh_token 
                            } 
                        }, '*');
                        
                        // Small delay to ensure message is sent before closing
                        setTimeout(() => window.close(), 500);
                        return;
                    }

                    // CLEANUP URL SAFELY
                    try {
                        const cleanUrl = new URL(window.location.href);
                        cleanUrl.search = ''; // Remove query
                        if (cleanUrl.hash.includes('?')) cleanUrl.hash = cleanUrl.hash.split('?')[0];
                        window.history.replaceState({}, document.title, cleanUrl.toString());
                    } catch {
                        console.warn("[CALLBACK] replaceState failed (likely blob sandbox). Using location hash fallback.");
                        window.location.hash = '#/auth/callback';
                    }

                    if (data.session) {
                        console.debug("[CALLBACK] session established via PKCE", { type });
                        
                        if (type === 'recovery') {
                            navigateTo('resetPassword');
                            return;
                        }
                        
                        await routeAfterAuth(data.session, { navigateTo, setUserProfile, setIsOnboarded });
                        return;
                    } else {
                        throw new Error("Session creation failed. Please try logging in again.");
                    }
                }

                // 5. Fallback: Check for Existing Session
                console.debug("[CALLBACK] no code/token, checking active session...");
                const { data: { session } } = await supabase.auth.getSession();
                
                if (session) {
                    if (type === 'recovery') {
                        navigateTo('resetPassword');
                        return;
                    }
                    console.debug("[CALLBACK] active session found. routing.");
                    await routeAfterAuth(session, { navigateTo, setUserProfile, setIsOnboarded });
                } else {
                    console.warn("[CALLBACK] no session found. defaulting to home.");
                    navigateTo('home'); 
                }

            } catch (err: unknown) {
                console.error("[CALLBACK] exchange fail", { name: (err as Error)?.name, message: (err as Error)?.message });
                setErrorMsg((err as Error).message || "An unexpected error occurred.");
            } finally {
                clearTimeout(timeoutId);
            }
        };

        handleCallback();
    }, [navigateTo, setUserProfile, setIsOnboarded]);

    if (errorMsg) {
        // Friendly error card with illustration: standardized error UX
        return (
            <ErrorCard 
                error={new Error(errorMsg)} 
                resetErrorBoundary={() => navigateTo('home')} 
            />
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 text-center">
            <RotateCw size={48} className={`animate-spin text-${themeColor}-600 mb-6`} />
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Verifying credentials...</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm max-w-xs">
                Securely connecting you to Engram.
            </p>
            {isLongWait && (
                <div className="mt-8 animate-in fade-in">
                    <p className="text-xs text-orange-500 mb-3">Taking longer than usual...</p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="text-sm font-bold text-gray-600 dark:text-gray-300 underline hover:text-gray-900 dark:hover:text-white"
                    >
                        Retry
                    </button>
                </div>
            )}
        </div>
    );
};
