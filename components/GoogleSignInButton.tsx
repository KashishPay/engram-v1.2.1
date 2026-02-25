import React, { useState } from 'react';
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { supabase } from '../services/supabase';
import { Capacitor } from '@capacitor/core';

interface GoogleSignInButtonProps {
    className?: string;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ className = '' }) => {
    const [launching, setLaunching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showProductionGuard, setShowProductionGuard] = useState(false);

    const isPreviewOrigin = () => {
        const o = window.location.origin;
        return (
            o.startsWith('blob:') ||
            o.includes('aistudio.google.com') ||
            o.includes('googleusercontent.com') ||
            o.includes('scf.usercontent.goog') ||
            window.self !== window.top
        );
    };

    const handleGoogleSignIn = async () => {
        setError(null);

        // [POPUP FLOW] For preview environments, we use a popup to bypass iframe restrictions
        if (isPreviewOrigin()) {
            setLaunching(true);
            try {
                // 1. Compute the production callback URL (which is whitelisted in Google Console)
                const redirectTo = "https://engram-space.vercel.app/auth/callback";
                
                // 2. Get the authorization URL from Supabase without redirecting the main window
                const { data, error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo,
                        skipBrowserRedirect: true,
                        scopes: 'openid https://www.googleapis.com/auth/userinfo.email',
                        queryParams: {
                            access_type: 'offline',
                            prompt: 'select_account',
                        },
                    }
                });

                if (error) throw error;

                if (data?.url) {
                    // 3. Open the popup
                    const width = 500;
                    const height = 600;
                    const left = window.screenX + (window.outerWidth - width) / 2;
                    const top = window.screenY + (window.outerHeight - height) / 2;
                    
                    const popup = window.open(
                        data.url,
                        'engram_oauth_popup',
                        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
                    );

                    if (!popup) {
                        throw new Error("Popup blocked. Please allow popups for this site.");
                    }

                    // 4. Monitor the popup
                    const timer = setInterval(() => {
                        if (popup.closed) {
                            clearInterval(timer);
                            setLaunching(false);
                        }
                    }, 1000);
                }
            } catch (err: unknown) {
                console.error("[OAuth] Popup Start Failed:", err);
                const message = err instanceof Error ? err.message : "Couldn’t start Google sign-in.";
                setError(message);
                setLaunching(false);
            }
            return;
        }

        setLaunching(true);
        try {
            // Use standard web redirect to ensure the browser can always handle the destination.
            // This avoids "invalid scheme" errors on devices without deep link configuration.
            const redirectTo = `${window.location.origin}/#/auth/callback`;
            
            console.debug("[OAuth] Launching Google Sign In", { redirectTo, platform: Capacitor.getPlatform() });

            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo,
                    scopes: 'openid https://www.googleapis.com/auth/userinfo.email',
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'select_account',
                    },
                }
            });

            if (error) throw error;
            // Successful init redirects the browser, so we remain in 'launching' state
        } catch (err: unknown) {
            console.error("[OAuth] Start Failed:", err);
            setError("Couldn’t start Google sign-in. Please try again.");
            setLaunching(false);
        }
    };

    if (showProductionGuard) {
        return (
            <div className={`w-full max-w-sm p-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 ${className}`}>
                <div className="mb-2 text-amber-600 dark:text-amber-400 font-bold flex items-center text-sm">
                    <AlertCircle size={18} className="mr-2" />
                    Security Check
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">
                    For security, Google Sign-In is disabled in preview environments. Please continue on our secure production site.
                </p>
                <button
                    onClick={() => window.open('https://engram-space.vercel.app/#/login', '_blank', 'noopener,noreferrer')}
                    className="w-full py-3 bg-amber-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-amber-700 transition flex items-center justify-center transform active:scale-95"
                >
                    Continue to Engram <ExternalLink size={14} className="ml-2" />
                </button>
                <button
                    onClick={() => setShowProductionGuard(false)}
                    className="mt-4 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline"
                >
                    Cancel
                </button>
            </div>
        );
    }

    return (
        <div className={`w-full flex flex-col items-center ${className}`}>
            <button
                onClick={handleGoogleSignIn}
                disabled={launching}
                aria-label="Continue with Google"
                className="w-full max-w-sm py-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl font-bold flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-750 transition shadow-sm relative overflow-hidden group disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-[0.99]"
            >
                {launching ? (
                    <div className="flex items-center">
                        <Loader2 size={20} className="animate-spin text-gray-400 mr-2" />
                        <span className="text-gray-500">Connecting...</span>
                    </div>
                ) : (
                    <>
                        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        <span className="group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                            Continue with Google
                        </span>
                    </>
                )}
            </button>
            {error && (
                <div className="flex items-center text-xs text-red-500 mt-3 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg animate-in fade-in">
                    <AlertCircle size={12} className="mr-1.5" />
                    {error}
                </div>
            )}
        </div>
    );
};