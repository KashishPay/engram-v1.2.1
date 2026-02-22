
import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, Check, ArrowLeft } from 'lucide-react';
import { supabase } from '../services/supabase';
import { ErrorCard } from '../components/ErrorCard';

interface ResetPasswordViewProps {
    navigateTo: (view: string) => void;
    themeColor: string;
}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({ navigateTo, themeColor }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [hasSession, setHasSession] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);

    useEffect(() => {
        // Verify we have a valid session from the magic link/auth callback
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setHasSession(!!session);
            setCheckingSession(false);
        };
        checkSession();
    }, []);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setStatus('error');
            setMessage("Passwords do not match.");
            return;
        }
        if (password.length < 6) {
            setStatus('error');
            setMessage("Password must be at least 6 characters.");
            return;
        }

        setLoading(true);
        setStatus('idle');
        setMessage('');

        try {
            // Strict session verification before update
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error("Recovery session expired. Please request a new password reset link.");
            }

            const { error } = await supabase.auth.updateUser({ password: password });
            if (error) throw error;

            console.debug("[AUTH] password update success");
            setStatus('success');
            setMessage("Password updated successfully!");
            
            // Short delay before redirecting to home
            setTimeout(() => {
                navigateTo('home');
            }, 2000);

        } catch (err: any) {
            console.error("[AUTH] password update error", err.message);
            setStatus('error');
            setMessage(err.message || "Failed to update password.");
        } finally {
            setLoading(false);
        }
    };

    if (checkingSession) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className={`animate-spin rounded-full h-8 w-8 border-b-2 border-${themeColor}-600`}></div>
            </div>
        );
    }

    if (!hasSession) {
        // Friendly error card with illustration: standardized error UX
        return (
            <ErrorCard 
                error={new Error("This password reset link is invalid or has expired.")}
                resetErrorBoundary={() => navigateTo('home')}
            />
        );
    }

    if (status === 'success') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-6 animate-in fade-in">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-sm w-full text-center border border-gray-100 dark:border-gray-700">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-green-500">
                        <Check size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">All Set!</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                        Your password has been updated. Redirecting...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-6 animate-in fade-in">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-sm w-full relative">
                <button 
                    onClick={() => navigateTo('home')}
                    className="absolute top-6 left-6 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition"
                >
                    <ArrowLeft size={20} />
                </button>

                <div className="text-center mb-8">
                    <div className={`w-16 h-16 bg-${themeColor}-100 dark:bg-${themeColor}-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-${themeColor}-600 dark:text-${themeColor}-400`}>
                        <Lock size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">New Password</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
                        Create a strong password for your account.
                    </p>
                </div>

                <form onSubmit={handleUpdate} className="space-y-4">
                    <div className="relative">
                        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            type="password"
                            placeholder="New Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-900 dark:text-white"
                            required
                            minLength={6}
                        />
                    </div>
                    <div className="relative">
                        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            type="password"
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-900 dark:text-white"
                            required
                            minLength={6}
                        />
                    </div>

                    {status === 'error' && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl text-center font-medium animate-in fade-in">
                            {message}
                        </div>
                    )}

                    <button 
                        type="submit"
                        disabled={loading}
                        className={`w-full py-3.5 bg-${themeColor}-600 text-white rounded-xl font-bold shadow-lg hover:bg-${themeColor}-700 transition transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center`}
                    >
                        {loading ? 'Updating...' : <>Update Password <ArrowRight size={18} className="ml-2" /></>}
                    </button>
                </form>
            </div>
        </div>
    );
};
