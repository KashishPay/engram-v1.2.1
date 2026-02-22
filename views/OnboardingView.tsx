
import React, { useState, useEffect } from 'react';
import { User, AtSign, Check, AlertCircle, ArrowRight, Loader2, LogOut } from 'lucide-react';
import { ProfileService } from '../services/profile';
import { useAuth } from '../context/AuthContext';

interface OnboardingViewProps {
    onComplete: (profile: any) => void;
    initialName?: string;
    initialAvatar?: string | null;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete, initialName, initialAvatar }) => {
    const { user, logout } = useAuth();
    const [fullName, setFullName] = useState(initialName || user?.displayName || '');
    const [username, setUsername] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Debounced check
    useEffect(() => {
        const cleanUsername = username.replace(/^@/, '').trim();
        if (cleanUsername.length < 3) {
            setUsernameStatus(cleanUsername.length > 0 ? 'invalid' : 'idle');
            return;
        }

        const regex = /^[a-zA-Z0-9_]+$/;
        if (!regex.test(cleanUsername)) {
            setUsernameStatus('invalid');
            return;
        }

        setUsernameStatus('checking');
        const timer = setTimeout(async () => {
            const available = await ProfileService.checkUsernameAvailable(cleanUsername);
            setUsernameStatus(available ? 'available' : 'taken');
        }, 500);

        return () => clearTimeout(timer);
    }, [username]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (usernameStatus !== 'available' || !fullName.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const cleanUsername = username.replace(/^@/, '').trim();
            const profile = await ProfileService.createProfile(
                fullName.trim(), 
                cleanUsername, 
                initialAvatar || user?.photoURL || null
            );
            onComplete(profile);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to create profile. Please try again.");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 p-6 items-center justify-center animate-in fade-in duration-300">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600 dark:text-amber-400 font-bold text-3xl">
                        {fullName ? fullName.charAt(0).toUpperCase() : <User />}
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Claim your handle</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                        Welcome to Engram! Set up your unique profile to start syncing your knowledge.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Display Name</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition text-gray-900 dark:text-white"
                                placeholder="Your Name"
                                required
                            />
                            <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Username</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                className={`w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border rounded-xl focus:ring-2 outline-none transition text-gray-900 dark:text-white ${
                                    usernameStatus === 'taken' || usernameStatus === 'invalid' 
                                    ? 'border-red-300 focus:ring-red-200' 
                                    : usernameStatus === 'available' 
                                    ? 'border-green-300 focus:ring-green-200' 
                                    : 'border-gray-200 dark:border-gray-700 focus:ring-amber-500'
                                }`}
                                placeholder="username"
                                required
                            />
                            <AtSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                {usernameStatus === 'checking' && <Loader2 size={18} className="animate-spin text-gray-400" />}
                                {usernameStatus === 'available' && <Check size={18} className="text-green-500" />}
                                {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <AlertCircle size={18} className="text-red-500" />}
                            </div>
                        </div>
                        <div className="mt-2 min-h-[20px]">
                            {usernameStatus === 'taken' && <p className="text-xs text-red-500">That handle is already taken.</p>}
                            {usernameStatus === 'invalid' && <p className="text-xs text-red-500">Use 3-20 letters, numbers, or underscores.</p>}
                            {usernameStatus === 'available' && <p className="text-xs text-green-500">@{username.replace(/^@/, '')} is available!</p>}
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl text-center">
                            {error}
                        </div>
                    )}

                    <button 
                        type="submit"
                        disabled={isSubmitting || usernameStatus !== 'available' || !fullName.trim()}
                        className="w-full py-4 bg-amber-600 text-white rounded-xl font-bold shadow-lg hover:bg-amber-700 transition transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <>Finish Setup <ArrowRight size={20} className="ml-2" /></>}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <button onClick={() => logout()} className="flex items-center justify-center w-full text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <LogOut size={14} className="mr-2" /> Sign in with a different account
                    </button>
                </div>
            </div>
        </div>
    );
};
