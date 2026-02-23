
import React, { useState } from 'react';
import { Loader2, AlertCircle, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const GoogleSignInCard: React.FC = () => {
    const { signInWithGoogle } = useAuth();
    const [launching, setLaunching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGoogleSignIn = async () => {
        setError(null);
        setLaunching(true);
        try {
            await signInWithGoogle();
        } catch (err: unknown) {
            const error = err as Error;
            console.error("[OAuth] Start Failed:", error);
            setError(error.message || "Couldn’t start Google sign-in.");
        } finally {
            setLaunching(false);
        }
    };

    return (
        <div className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 flex flex-col items-center text-center">
            <div className="bg-white dark:bg-gray-700 p-2 rounded-full mb-3 shadow-sm text-blue-500">
                <Zap size={20} fill="currentColor" className="text-blue-500" />
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-1">Fast Access</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 max-w-[200px]">
                Sync your notes and quizzes instantly across devices.
            </p>

            <button
                onClick={handleGoogleSignIn}
                disabled={launching}
                className="w-full py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-600 transition shadow-sm relative overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.98]"
            >
                {launching ? (
                    <>
                        <Loader2 size={18} className="animate-spin text-gray-400 mr-2" />
                        <span className="text-sm">Connecting...</span>
                    </>
                ) : (
                    <>
                        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        <span className="text-sm">Continue with Google</span>
                    </>
                )}
            </button>

            {error && (
                <div className="flex items-center text-xs text-red-500 mt-3 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg animate-in fade-in w-full justify-center">
                    <AlertCircle size={12} className="mr-1.5" />
                    {error}
                </div>
            )}
        </div>
    );
};
