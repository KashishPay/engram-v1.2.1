
import React, { useState, useEffect, useRef } from 'react';
import { LogIn, ChevronRight, Plus, Camera, Mail, Lock, User, ArrowLeft, Send, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { getOAuthAppOrigin } from '../utils/authEnv';
import { EngramLogo } from '../components/EngramLogo';
import { ENABLE_PASSWORD_RECOVERY, ENABLE_GOOGLE_OAUTH } from '../config/auth';
import { GoogleSignInCard } from '../components/GoogleSignInCard';
import { TermsContent, PrivacyContent } from './LegalViews';

interface LoginViewProps {
    onComplete: (name: string, avatar: string | null) => void;
    onSignInSuccess?: () => void; // New callback for email sign in
}

// Declared at module scope to avoid identity/new function on each render; prevents remount & focus loss.
// MODIFIED: Changed to a scrollable container to support mobile layouts where content exceeds viewport height.
const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="h-full w-full overflow-y-auto bg-white dark:bg-gray-900 md:bg-gray-50 md:dark:bg-gray-950 animate-in fade-in duration-500">
        <div className="min-h-full w-full flex items-center justify-center p-0 md:p-4">
            <div className="w-full md:h-auto md:max-w-md bg-white dark:bg-gray-900 md:rounded-3xl md:shadow-2xl md:border border-gray-100 dark:border-gray-800 p-6 md:p-8 flex flex-col items-center justify-center relative">
                {children}
            </div>
        </div>
    </div>
);

export const LoginView: React.FC<LoginViewProps> = ({ onComplete, onSignInSuccess }) => {
    const { signInWithEmail, signUpWithEmail } = useAuth();
    
    const [step, setStep] = useState<'intro' | 'auth' | 'guest-setup'>('intro');
    const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
    
    // Auth Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authName, setAuthName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Guest Profile State
    const [name, setName] = useState('');
    const [avatar, setAvatar] = useState<string | null>(null);
    
    // Modal State for Legal Content
    const [legalModalOpen, setLegalModalOpen] = useState<'terms' | 'privacy' | null>(null);
    
    // Auto-trigger for redirect loops handling (kept for robustness, though less critical with button)
    const autoAuthAttempted = useRef(false);

    // Auto-detect startGoogle parameter to handle preview redirects nicely
    useEffect(() => {
        if (autoAuthAttempted.current) return;
        
        // Check hash or search for 'startGoogle=1'
        const rawUrl = window.location.href;
        
        if (rawUrl.includes('startGoogle=1')) {
            console.debug("[LOGIN] Detected startGoogle signal.");
            autoAuthAttempted.current = true;
            
            // Clean URL
            const cleanUrl = rawUrl.replace(/[?&]startGoogle=1/, '');
            window.history.replaceState({}, document.title, cleanUrl);
            
            // Note: We don't auto-click the button here to avoid popup blockers, 
            // but we could if needed. For now, user sees the button.
        }
    }, []);

    // Scroll Lock when modal is open
    useEffect(() => {
        if (legalModalOpen) {
            document.body.style.overflow = 'hidden';
            
            const handleEsc = (e: KeyboardEvent) => {
                if (e.key === 'Escape') setLegalModalOpen(null);
            };
            window.addEventListener('keydown', handleEsc);
            return () => {
                window.removeEventListener('keydown', handleEsc);
                document.body.style.overflow = '';
            };
        } else {
            document.body.style.overflow = '';
        }
    }, [legalModalOpen]);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setAvatar(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleSendMagicLink = async () => {
        if (!supabase) {
            setError("Authentication service unavailable.");
            return;
        }
        
        const cleanEmail = email.trim();
        if (!cleanEmail) {
            setError("Please enter your email to receive a magic link.");
            return;
        }
        
        // Basic regex validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            setError("Please enter a valid email address.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        // Construct redirect URL: origin + #/auth/callback
        const redirectUrl = `${window.location.origin}/#/auth/callback`;

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: cleanEmail,
                options: {
                    emailRedirectTo: redirectUrl,
                    shouldCreateUser: true // Allow sign up via magic link
                }
            });
            
            if (error) throw error;
            
            setSuccessMessage("Magic link sent! Check your email to sign in.");
        } catch (err: any) {
            console.error("Magic link error:", err);
            let msg = "Failed to send magic link.";
            if (err.status === 429) msg = "Too many requests. Please wait a moment.";
            else if (err.message) msg = err.message;
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ENABLE_PASSWORD_RECOVERY) return;

        if (!email.trim()) {
            setError("Please enter your email.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        const appOrigin = getOAuthAppOrigin();
        const redirectTo = appOrigin;
        
        // [PII REDACTION] Don't log full email in debug
        console.debug("[RECOVERY] resetPasswordForEmail", { email: email ? 'REDACTED' : null, redirectTo });

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo
            });
            
            console.debug("[AUTH] forgotPassword result", { error: error?.message ?? null });

            if (error) throw error;
            
            setSuccessMessage("If this email exists, a reset link has been sent.");
        } catch (err: any) {
            if (err.message?.includes("rate limit")) {
                setError("Too many requests. Please wait for a while.");
            } else {
                setSuccessMessage("If this email exists, a reset link has been sent.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setIsLoading(true);

        try {
            if (authMode === 'signup') {
                if (!authName.trim()) throw new Error("Name is required.");
                await signUpWithEmail(email, password, authName);
                setSuccessMessage("Account created! Please check your email to verify.");
                setAuthMode('signin');
            } else {
                await signInWithEmail(email, password);
                if (onSignInSuccess) onSignInSuccess();
            }
        } catch (err: any) {
            console.error(err);
            let msg = "Authentication failed.";
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') msg = "Invalid email or password.";
            else if (err.code === 'auth/email-already-in-use') msg = "Email already in use.";
            else if (err.code === 'auth/weak-password') msg = "Password should be at least 6 characters.";
            else if (err.message) msg = err.message;
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Modal Render Logic ---
    const renderLegalModal = () => {
        if (!legalModalOpen) return null;
        
        return (
            <div 
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300" 
                role="dialog" 
                aria-modal="true"
                onClick={() => setLegalModalOpen(null)}
            >
                <div 
                    className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md max-h-[85vh] shadow-2xl flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-300"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-900 z-10 shrink-0">
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                            {legalModalOpen === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
                        </h3>
                        <button 
                            onClick={() => setLegalModalOpen(null)} 
                            className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition"
                            aria-label="Close"
                        >
                            <X size={20}/>
                        </button>
                    </div>
                    {/* Content */}
                    <div className="p-6 overflow-y-auto">
                        {legalModalOpen === 'terms' ? <TermsContent /> : <PrivacyContent />}
                    </div>
                </div>
            </div>
        );
    };

    if (step === 'intro') {
        return (
            <>
                <Wrapper>
                    <div className="mt-4 mb-12 relative group">
                        {/* Premium Frame with Brand Border Glow */}
                        <div className="relative brand-border-glow
                            mx-auto
                            w-[270px] h-[270px] sm:w-[310px] sm:h-[310px]
                            rounded-[2.5rem]
                            bg-white dark:bg-gray-800
                            border border-gray-100 dark:border-gray-700/50
                            shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] dark:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.4)]
                            flex items-center justify-center
                            transform transition duration-500 group-hover:scale-[1.01] group-hover:-translate-y-1
                        ">
                            <EngramLogo 
                                size={1024} 
                                className="!w-64 !h-64 sm:!w-72 sm:!h-72 object-contain rounded-[1.75rem]" 
                            />
                        </div>
                    </div>
                    
                    <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-3 tracking-wide">ENGRAM</h1>
                    <p className="text-gray-500 dark:text-gray-400 mb-10 text-lg leading-relaxed max-w-sm mx-auto font-medium text-center">
                        Make neurons happier with spaced repetition. Capture notes, generate quizzes, and master your studies with AI.
                    </p>

                    <div className="w-full max-w-sm space-y-4">
                        <button 
                            onClick={() => setStep('auth')}
                            className="w-full py-3.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-bold flex items-center justify-center shadow-lg hover:scale-[1.02] transition"
                        >
                            <LogIn size={20} className="mr-2" />
                            Sign In / Sign Up
                        </button>
                        
                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200 dark:border-gray-700"></span></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white dark:bg-gray-900 px-2 text-gray-400">Or</span></div>
                        </div>

                        <button 
                            onClick={() => setStep('guest-setup')}
                            className="w-full py-3.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                        >
                            Continue as Guest
                        </button>
                    </div>
                    
                    <p className="text-xs text-gray-400 mt-8">
                        By continuing, you agree to our{' '}
                        <button 
                            onClick={(e) => { e.preventDefault(); setLegalModalOpen('terms'); }}
                            className="underline cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            Terms
                        </button>
                        {' '} & {' '}
                        <button 
                            onClick={(e) => { e.preventDefault(); setLegalModalOpen('privacy'); }}
                            className="underline cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            Privacy Policy
                        </button>.
                    </p>
                </Wrapper>
                {renderLegalModal()}
            </>
        );
    }

    if (step === 'auth') {
        return (
            <Wrapper>
                <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in slide-in-from-right-10 duration-500 relative">
                    <button onClick={() => setStep('intro')} className="absolute top-0 left-0 p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                        <ArrowLeft size={24} />
                    </button>

                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 mt-12">
                        {authMode === 'signin' ? 'Welcome Back' : authMode === 'signup' ? 'Create Account' : 'Reset Password'}
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm text-center">
                        {authMode === 'signin' ? 'Enter your credentials to access your account.' 
                            : authMode === 'signup' ? 'Sign up to start your learning journey.' 
                            : 'Enter your email to receive a password reset link.'}
                    </p>

                    {authMode === 'forgot' && ENABLE_PASSWORD_RECOVERY ? (
                        <form onSubmit={handleResetPassword} className="w-full max-w-sm space-y-4">
                            <div className="relative">
                                <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input 
                                    type="email"
                                    placeholder="Email Address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition text-gray-900 dark:text-white"
                                    required
                                />
                            </div>

                            {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl font-medium text-center">{error}</div>}
                            {successMessage && <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm rounded-xl font-medium text-center">{successMessage}</div>}

                            <button 
                                type="submit"
                                disabled={isLoading || !!successMessage}
                                className="w-full py-3.5 bg-amber-600 text-white rounded-2xl font-bold shadow-lg hover:bg-amber-700 transition transform active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                {isLoading ? 'Sending...' : <><Send size={18} className="mr-2"/> Send Reset Link</>}
                            </button>

                            <button 
                                type="button"
                                onClick={() => { 
                                    setAuthMode('signin'); 
                                    setError(null); 
                                    setSuccessMessage(null);
                                    setIsLoading(false);
                                }}
                                className="w-full py-2 text-gray-500 dark:text-gray-400 text-sm font-bold hover:text-gray-700 dark:hover:text-gray-200"
                            >
                                Back to Sign In
                            </button>
                        </form>
                    ) : (
                        <>
                            <form onSubmit={handleAuthSubmit} className="w-full max-w-sm space-y-4">
                                {authMode === 'signup' && (
                                    <div className="relative">
                                        <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input 
                                            type="text"
                                            placeholder="Full Name"
                                            value={authName}
                                            onChange={(e) => setAuthName(e.target.value)}
                                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition text-gray-900 dark:text-white"
                                            required
                                        />
                                    </div>
                                )}
                                
                                {authMode === 'signin' && (
                                    <div className="flex justify-end w-full mb-1 -mt-2">
                                        <button 
                                            type="button"
                                            onClick={handleSendMagicLink}
                                            disabled={isLoading}
                                            className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition flex items-center py-1 px-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                            title="Send a sign-in link to your email"
                                        >
                                            <Sparkles size={12} className="mr-1.5" />
                                            Get magic link for sign in
                                        </button>
                                    </div>
                                )}

                                <div className="relative">
                                    <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input 
                                        type="email"
                                        placeholder="Email Address"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>

                                <div className="relative">
                                    <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input 
                                        type="password"
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition text-gray-900 dark:text-white"
                                        required={authMode === 'signup' || authMode === 'signin'} 
                                    />
                                </div>

                                {authMode === 'signin' && ENABLE_PASSWORD_RECOVERY && (
                                    <div className="flex justify-end">
                                        <button 
                                            type="button"
                                            onClick={() => { 
                                                setAuthMode('forgot'); 
                                                setError(null); 
                                                setIsLoading(false);
                                            }}
                                            className="text-xs text-amber-600 dark:text-amber-400 font-bold hover:underline"
                                        >
                                            Forgot password?
                                        </button>
                                    </div>
                                )}

                                {error && (
                                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl font-medium text-center">
                                        {error}
                                    </div>
                                )}
                                {successMessage && (
                                    <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm rounded-xl font-medium text-center">
                                        {successMessage}
                                    </div>
                                )}

                                <button 
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3.5 bg-amber-600 text-white rounded-2xl font-bold shadow-lg hover:bg-amber-700 transition transform active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isLoading 
                                        ? (authMode === 'signup' ? 'Confirm Your Signup' : 'Processing...') 
                                        : (authMode === 'signin' ? 'Sign In' : 'Sign Up')
                                    }
                                </button>
                            </form>

                            {/* Google Sign In Integration */}
                            {ENABLE_GOOGLE_OAUTH && (
                                <>
                                    <div className="relative w-full max-w-sm py-6">
                                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200 dark:border-gray-700"></span></div>
                                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-white dark:bg-gray-900 px-2 text-gray-400">Or continue with</span></div>
                                    </div>

                                    <GoogleSignInCard />
                                </>
                            )}

                            <div className="mt-2 flex items-center text-sm">
                                <span className="text-gray-500 dark:text-gray-400">
                                    {authMode === 'signin' ? "Don't have an account?" : "Already have an account?"}
                                </span>
                                <button 
                                    onClick={() => {
                                        setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                                        setError(null);
                                        setSuccessMessage(null);
                                        setIsLoading(false);
                                    }}
                                    className="ml-2 font-bold text-amber-600 dark:text-amber-400 hover:underline"
                                >
                                    {authMode === 'signin' ? 'Sign Up' : 'Sign In'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </Wrapper>
        );
    }

    return (
        <Wrapper>
            <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in slide-in-from-right-10 duration-500">
                <div className="mb-8 relative group cursor-pointer">
                    <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-xl bg-gray-100 dark:bg-gray-800 relative">
                        {avatar ? (
                            <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800">
                                 <Camera size={32} />
                            </div>
                        )}
                    </div>
                    <div className="absolute bottom-0 right-0 bg-amber-500 text-white p-2 rounded-full shadow-md border-2 border-white dark:border-gray-900">
                         <Plus size={16} strokeWidth={3} />
                    </div>
                    <input 
                        type="file" 
                        accept="image/*" 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        onChange={handleAvatarChange} 
                    />
                </div>

                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Create Guest Profile</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm max-w-xs mx-auto">
                    Set up your guest profile. This data stays on your device.
                </p>

                <div className="w-full max-w-sm space-y-4">
                    <input 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && name.trim()) {
                                onComplete(name, avatar);
                            }
                        }}
                        placeholder="Enter your name"
                        className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-900 outline-none transition text-center font-semibold text-lg text-gray-900 dark:text-white placeholder-gray-400"
                        autoFocus
                    />

                    <button 
                        onClick={() => onComplete(name, avatar)}
                        disabled={!name.trim()}
                        className="w-full py-3.5 bg-amber-600 text-white rounded-2xl font-bold shadow-lg hover:bg-amber-700 transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        Get Started <ChevronRight size={20} className="ml-1" />
                    </button>

                    <button 
                        onClick={() => setStep('intro')}
                        className="py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm font-medium transition"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        </Wrapper>
    );
};
