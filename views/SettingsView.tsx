
import React, { useEffect, useRef, useState } from 'react';
import { 
    Award, ChevronRight, Palette, Clock, Bell, Layout, 
    Info, Download, Upload, Sun, Moon, 
    Smartphone, LogOut, Key, Trash2, ShieldCheck, ExternalLink, AlertTriangle, RotateCw, Zap, Sparkles,
    Check, Loader2, LayoutGrid, Layers, Headphones, MessageSquarePlus, Star, PartyPopper, RefreshCw, UserX, CloudSync,
    Target
} from 'lucide-react';
import { UserProfile } from '../types';
import { validateApiKey, getUsageStats } from '../services/gemini';
import { performDeviceReset } from '../utils/deviceReset';
import { deleteUserAccount } from '../services/supabase';

interface UsageStats {
    source?: string;
    count: number;
    limit: number;
    month?: number;
}

interface SettingsViewProps {
    userProfile: UserProfile;
    userId: string;
    userEmail?: string | null;
    isGuest: boolean;
    currentTheme: string;
    navigateTo: (view: string) => void;
    setShowFeedbackModal: (show: boolean) => void;
    handleExportData: () => void;
    handleImportData: (e: React.ChangeEvent<HTMLInputElement>) => void;
    appMode: string;
    setAppMode: (mode: string) => void;
    onSignOut: () => void;
    onDeleteProfile: (id: string) => void;
    level: number;
    badgeCount: number;
    streak?: number;
    globalSyncEnabled: boolean;
    setGlobalSyncEnabled: (enabled: boolean) => void;
}

const SettingsItem: React.FC<{ icon: unknown, label: string, color: string, onClick?: () => void, rightElement?: React.ReactNode }> = ({ icon, label, color, onClick, rightElement }) => {
    const Icon = icon as React.ElementType;
    return (
        <button onClick={onClick} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition border-b last:border-b-0 border-gray-100 dark:border-gray-800">
            <div className="flex items-center space-x-3">{Icon && <Icon size={20} className={color} />}<span className="font-medium text-gray-700 dark:text-gray-200">{label}</span></div>
            {rightElement || <ChevronRight className="text-gray-300 dark:text-gray-600" size={20} />}
        </button>
    );
};

const CelebrationOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        const setCanvasSize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
        };
        setCanvasSize();
        window.addEventListener('resize', setCanvasSize);

        const particles: unknown[] = [];
        const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        
        for (let i = 0; i < 200; i++) {
            particles.push({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                vx: (Math.random() - 0.5) * 15,
                vy: (Math.random() - 0.5) * 15 - 5,
                size: Math.random() * 8 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1,
                decay: 0.005 + Math.random() * 0.01,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10
            });
        }

        let animationId: number;
        const animate = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            let activeParticles = 0;

            particles.forEach(p => {
                if (p.life > 0) {
                    activeParticles++;
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.2; 
                    p.vx *= 0.96; 
                    p.vy *= 0.96;
                    p.life -= p.decay;
                    p.rotation += p.rotationSpeed;

                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate((p.rotation * Math.PI) / 180);
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = Math.max(p.life, 0);
                    
                    // Draw Star or Rect randomly
                    if (Math.random() > 0.5) {
                        ctx.beginPath();
                        ctx.moveTo(0, -p.size);
                        for (let i = 0; i < 5; i++) {
                            ctx.rotate(Math.PI / 5);
                            ctx.lineTo(0, -(p.size * 0.5));
                            ctx.rotate(Math.PI / 5);
                            ctx.lineTo(0, -p.size);
                        }
                        ctx.fill();
                    } else {
                        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                    }
                    ctx.restore();
                }
            });

            if (activeParticles > 0) {
                animationId = requestAnimationFrame(animate);
            }
        };
        animate();

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', setCanvasSize);
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-500">
            <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative z-10 text-center animate-in zoom-in-95 duration-300">
                <div className="w-24 h-24 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-yellow-500 shadow-inner">
                    <Star size={48} fill="currentColor" className="animate-pulse" />
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2 tracking-tight">Habit Unlocked!</h2>
                <div className="inline-block bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-bold px-3 py-1 rounded-full mb-6">
                    21 DAY STREAK
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm leading-relaxed">
                    <span className="font-bold">"It takes 21 days to form a new habit."</span> <br/>
                    — Maxwell Maltz, <i>Psycho-Cybernetics</i>
                </p>
                <p className="text-gray-500 dark:text-gray-400 mb-8 text-xs">
                    You've rewired your brain for consistency. Keep this momentum going!
                </p>
                <button 
                    onClick={onClose}
                    className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-2xl font-bold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition active:scale-95 flex items-center justify-center"
                >
                    <PartyPopper size={20} className="mr-2" />
                    Claim Victory
                </button>
            </div>
        </div>
    );
};

export const SettingsView: React.FC<SettingsViewProps> = ({ 
    userProfile, userId, userEmail, isGuest, currentTheme, navigateTo, 
    handleExportData, handleImportData, appMode, setAppMode, onSignOut, onDeleteProfile, level, badgeCount, streak = 0,
    onManualSync, isSyncing
}) => {
    const [showCelebration, setShowCelebration] = useState(false);
    const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
    
    // BYOK State
    const [showKeyInput, setShowKeyInput] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [hasKey, setHasKey] = useState(false);
    const [storedKey, setStoredKey] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [keyStatus, setKeyStatus] = useState<'checking' | 'valid' | 'invalid' | 'none'>('none');

    // Reset State
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [resetMessage, setResetMessage] = useState<string | null>(null);

    // Delete Account State
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Initial Load
    useEffect(() => {
        setUsageStats(getUsageStats());

        // Trigger celebration only if streak >= 21 and hasn't been shown before
        if (streak >= 21) {
            const hasCelebrated = localStorage.getItem(`engram_21_day_celebrated_${userId}`);
            if (!hasCelebrated) {
                setShowCelebration(true);
            }
        }
        
        // Check for existing API Key
        const key = localStorage.getItem(`engram_custom_api_key_${userId}`);
        if (key) {
            setHasKey(true);
            setApiKey(key); 
            setStoredKey(key);
            
            // STRICT CHECK ON LOAD
            if (!key.startsWith('AIza') || key.length < 39) {
                setKeyStatus('invalid');
            } else {
                setKeyStatus('valid'); 
            }
        }
    }, [streak]);

    // Handle Input Change explicitly to clear status immediately
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setApiKey(newValue);
        // CRITICAL: Immediately invalidate status when user types to prevent false "Valid" state during debounce
        if (newValue !== storedKey) {
            setKeyStatus('none');
        } else if (newValue === storedKey && hasKey) {
            setKeyStatus('valid');
        }
    };

    // Real-time API Key Validation (Debounced)
    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            const trimmed = apiKey.trim();

            if (!trimmed) {
                if (!hasKey) setKeyStatus('none');
                return;
            }

            if (hasKey && trimmed === storedKey) {
                setKeyStatus('valid');
                return;
            }

            // 1. Client-side Check
            if (!trimmed.startsWith('AIza') || trimmed.length < 39) {
                setKeyStatus('invalid');
                return;
            }

            // 2. Server-side Check
            setIsValidating(true);
            setKeyStatus('checking');
            
            const isValid = await validateApiKey(trimmed);
            
            setIsValidating(false);
            setKeyStatus(isValid ? 'valid' : 'invalid');

        }, 800); // Increased debounce to 800ms to reduce flicker

        return () => clearTimeout(timeoutId);
    }, [apiKey, hasKey, storedKey]);

    const handleCloseCelebration = () => {
        localStorage.setItem(`engram_21_day_celebrated_${userId}`, 'true');
        setShowCelebration(false);
    };

    const handleSaveKey = async () => {
        const trimmed = apiKey.trim();
        if (!trimmed) return;

        // Final strict check
        if (keyStatus === 'valid' && trimmed.length >= 39 && trimmed.startsWith('AIza')) {
            localStorage.setItem(`engram_custom_api_key_${userId}`, trimmed);
            setHasKey(true);
            setStoredKey(trimmed);
            setUsageStats(getUsageStats()); // Update usage display
            alert("API Key Saved Successfully! You are now using your own quota.");
        } else if (keyStatus === 'checking') {
            alert("Please wait for validation to complete...");
        } else {
            alert("Cannot save invalid key. Please check your input.");
        }
    };

    const handleDeleteKey = () => {
        localStorage.removeItem(`engram_custom_api_key_${userId}`);
        setHasKey(false);
        setStoredKey('');
        setApiKey('');
        setKeyStatus('none');
        setUsageStats(getUsageStats()); // Update usage display
    };

    const handleSendFeedback = () => {
        const email = "engram.pro@gmail.com";
        const subject = encodeURIComponent("Engram App Feedback");
        const body = encodeURIComponent(`Describe your feedback or bug report here:\n\n\n\n---\nUser ID: ${userId}\nApp Version: 1.0.2 (Beta)`);
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    };

    const handleConfirmReset = async () => {
        setIsResetting(true);
        setResetMessage("Processing...");
        try {
            // Keep auth if not a guest (guests don't have auth to keep)
            await performDeviceReset(!isGuest);
            setResetMessage("Device data cleared. Reloading...");
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (e) {
            console.error(e);
            setResetMessage("Error: Could not fully clear data. Please refresh manually.");
            setIsResetting(false);
        }
    };

    const handleConfirmDeleteAccount = async () => {
        setIsDeleting(true);
        try {
            if (!isGuest) {
                // 1. Call RPC to delete from Supabase Auth & DB
                await deleteUserAccount();
            }
            
            // 2. Delete profile data and switch/logout
            onDeleteProfile(userId);
            navigateTo('home');
            
        } catch (e: unknown) {
            console.error("Account deletion failed", e);
            alert("Failed to delete account: " + ((e as Error).message || "Unknown error"));
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    // Determine Action Button & Status Display
    let actionButton;
    const isStoredMatch = hasKey && apiKey === storedKey;
    const showFormatWarning = apiKey.trim().length > 0 && (!apiKey.trim().startsWith('AIza') || apiKey.trim().length < 39);

    if (isValidating || keyStatus === 'checking') {
        actionButton = (
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-blue-500" />
            </div>
        );
    } else if (isStoredMatch) {
        actionButton = (
            <button 
                onClick={handleDeleteKey} 
                className="p-3 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 transition flex items-center justify-center shadow-sm"
                title="Permanently Delete Key"
            >
                <Trash2 size={20}/>
            </button>
        );
    } else {
        actionButton = (
            <button 
                onClick={handleSaveKey} 
                disabled={!apiKey.trim() || keyStatus !== 'valid'}
                className={`p-3 rounded-xl transition flex items-center justify-center shadow-sm ${keyStatus === 'valid' ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                title="Validate & Save Key"
            >
                <Check size={24}/>
            </button>
        );
    }

    // Badge Logic
    let badge = null;
    if (hasKey || keyStatus !== 'none') {
        if (keyStatus === 'checking') {
             badge = <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full flex items-center mr-2"><RotateCw size={12} className="mr-1 animate-spin"/>Checking</span>;
        } else if (keyStatus === 'valid') {
             if (isStoredMatch) {
                 badge = <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center mr-2"><ShieldCheck size={12} className="mr-1"/>Active</span>;
             } else {
                 // Explicitly warn that it is NOT saved yet
                 badge = <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full flex items-center mr-2"><Check size={12} className="mr-1"/>Verified - Click Save</span>;
             }
        } else if (keyStatus === 'invalid') {
             badge = <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full flex items-center mr-2"><AlertTriangle size={12} className="mr-1"/>Invalid Key</span>;
        }
    }

    // Usage Display Logic
    const isUnlimited = usageStats?.source === 'custom';
    const usageDisplay = isUnlimited 
        ? <span className="text-xl font-bold text-gray-600 dark:text-gray-400">∞</span>
        : <span className="text-xs text-gray-400">{usageStats?.count || 0} / {usageStats?.limit || 50}</span>;

    const deleteLabel = isGuest ? "Delete Guest Account" : "Delete My Account";
    const deleteDesc = isGuest ? "Permanently deletes all local data." : "Permanently deletes data from server.";

    return (
        <>
            {showCelebration && <CelebrationOverlay onClose={handleCloseCelebration} />}
            {/* Added extra bottom padding (pb-40) to ensure scrolling clears the tab bar */}
            <div className={`bg-${currentTheme}-50 dark:bg-gray-900 -mx-1.5 px-1.5 pt-10 space-y-5 min-h-full pb-40`}>
                <div className="flex items-center space-x-4 mb-2 cursor-pointer transition hover:opacity-80" onClick={() => navigateTo('profile')}>
                    <div className="relative">
                        <div className={`w-16 h-16 rounded-full bg-${currentTheme}-200 overflow-hidden border-4 border-white dark:border-gray-700 shadow-md relative`}>
                            {userProfile.avatar ? <img src={userProfile.avatar} alt="Avatar" className="w-full h-full object-cover" /> : <img src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${userId}&backgroundColor=b6e3f4`} alt="Avatar" className="w-full h-full" />}
                        </div>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center">
                            <h2 className={`text-xl font-bold text-${currentTheme}-900 dark:text-${currentTheme}-200 leading-tight truncate`}>{userProfile.name}</h2>
                        </div>
                        {userEmail && (
                             <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mt-0.5">{userEmail}</p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 mt-0.5">
                            {userProfile.username ? `@${userProfile.username}` : `User ID: ${userId.slice(-4)}`}
                        </p>
                        <div className="flex space-x-2">
                            <span className="bg-green-400 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">Lv.{level}</span>
                            <span className={`bg-${currentTheme}-400 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm flex items-center`}>
                                <Award size={10} className="mr-1" />{badgeCount} Badges
                            </span>
                        </div>
                    </div>
                    <ChevronRight className="text-gray-400" />
                </div>
                
                <div className="space-y-6">
                    {/* AI Configuration (BYOK) Card */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
                        <SettingsItem 
                            icon={Key} 
                            label="AI Configuration (BYOK)" 
                            color={hasKey ? (keyStatus === 'invalid' ? "text-red-500" : "text-blue-500") : "text-blue-500"} 
                            onClick={() => setShowKeyInput(!showKeyInput)} 
                            rightElement={
                                <div className="flex items-center">
                                    {badge}
                                    <ChevronRight className={`text-gray-300 dark:text-gray-600 transition-transform duration-200 ${showKeyInput ? 'rotate-90' : ''}`} size={20} />
                                </div>
                            }
                        />
                        {showKeyInput && (
                            <div className="p-5 bg-gray-50 dark:bg-gray-800/50 animate-in slide-in-from-top-2 border-t border-gray-100 dark:border-gray-700">
                                <div className={`mb-4 p-3 rounded-xl border flex items-center ${hasKey ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-100 border-gray-200 text-gray-700'}`}>
                                    <div className={`p-2 rounded-full mr-3 ${hasKey ? 'bg-green-200 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                                        {hasKey ? <ShieldCheck size={16}/> : <Zap size={16}/>}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide">Current API Source</p>
                                        <p className="text-sm font-semibold">{hasKey ? 'Custom Key (Private Quota)' : 'Standard (Shared Quota)'}</p>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4">
                                    <h4 className="font-bold text-gray-800 dark:text-white text-sm mb-3">Get a free Gemini API Key:</h4>
                                    <ol className="text-xs text-gray-600 dark:text-gray-300 space-y-2 leading-relaxed">
                                        <li className="flex items-start">
                                            <span className="font-bold mr-1.5">1.</span> 
                                            <span>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-600 font-medium hover:underline inline-flex items-center">Google AI Studio <ExternalLink size={10} className="ml-0.5"/></a>.</span>
                                        </li>
                                        <li className="flex items-start">
                                            <span className="font-bold mr-1.5">2.</span>
                                            <span>Click <span className="font-bold text-gray-800 dark:text-gray-200">Create API key</span> (it's free).</span>
                                        </li>
                                        <li className="flex items-start">
                                            <span className="font-bold mr-1.5">3.</span>
                                            <span>Copy the key string and paste it below.</span>
                                        </li>
                                    </ol>
                                </div>

                                <div className="flex space-x-2 relative">
                                    <input 
                                        type="password" 
                                        value={apiKey}
                                        onChange={handleInputChange}
                                        placeholder="Paste API Key (starts with Alza...)"
                                        className={`flex-1 p-3 text-sm bg-gray-800 text-white placeholder-gray-400 border rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition ${keyStatus === 'invalid' ? 'border-red-500' : 'border-gray-700'}`}
                                    />
                                    {actionButton}
                                </div>
                                {showFormatWarning && (
                                     <p className="text-[10px] text-orange-500 mt-1 pl-1 font-medium animate-in fade-in">
                                        Warning: Google API Keys usually start with "AIza".
                                     </p>
                                )}
                                {keyStatus === 'invalid' && (
                                    <p className="text-xs text-red-500 mt-2 flex items-center font-bold animate-in fade-in">
                                        <AlertTriangle size={12} className="mr-1" /> Invalid API Key. Check format/length.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* General Settings Card */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
                        <SettingsItem icon={LayoutGrid} label="Tab Bar" color="text-orange-500" onClick={() => navigateTo('tabBarSettings')} />
                        <SettingsItem icon={Palette} label="Appearance" color="text-orange-600" onClick={() => navigateTo('appearance')} />
                        <SettingsItem icon={Clock} label="Date & Time" color="text-orange-500" onClick={() => navigateTo('dateTimeSettings')} />
                        <SettingsItem icon={Bell} label="Sounds & Notifications" color="text-orange-500" onClick={() => navigateTo('soundsNotifications')} />
                        <SettingsItem icon={Layout} label="Widgets" color="text-orange-500" onClick={() => navigateTo('widgets')} />
                        <SettingsItem icon={Layers} label="Flashcard Hub" color="text-pink-500" onClick={() => navigateTo('flashcardHub')} />
                        <SettingsItem icon={Target} label="Test Series" color="text-blue-500" onClick={() => navigateTo('testSeries')} />
                        <SettingsItem icon={Headphones} label="Podcast & Settings" color="text-orange-500" onClick={() => navigateTo('podcastSettings')} />
                        <SettingsItem 
                            icon={Sparkles} 
                            label="AI Features & Quota" 
                            color="text-purple-500" 
                            onClick={() => navigateTo('aiFeatures')} 
                            rightElement={
                                <div className="flex items-center">
                                    <span className="text-xs text-gray-400 mr-2">
                                        {usageDisplay}
                                    </span>
                                    <ChevronRight size={20} className="text-gray-300 dark:text-gray-600" />
                                </div>
                            }
                        />
                        <SettingsItem icon={Info} label="About" color="text-gray-500" onClick={() => navigateTo('about')} />
                    </div>

                    {/* Support Section */}
                    <div>
                        <h3 className="px-4 mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Support</h3>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
                            <SettingsItem icon={MessageSquarePlus} label="Send Feedback / Report Bug" color="text-amber-600" onClick={handleSendFeedback} />
                        </div>
                    </div>

                    {/* Data Management Section */}
                    <div>
                        <h3 className="px-4 mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Data Management</h3>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                                <div className="grid grid-cols-2 gap-3">
                                    <button onClick={handleExportData} className="flex items-center justify-center p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl font-medium text-sm border border-blue-100 dark:border-blue-800 transition hover:bg-blue-100 dark:hover:bg-blue-900/30">
                                        <Download size={18} className="mr-2" />Export Backup
                                    </button>
                                    {isGuest ? (
                                        <button 
                                            onClick={() => handleImportData({ target: { value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>)} 
                                            className="flex items-center justify-center p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl font-medium text-sm border border-green-100 dark:border-green-800 transition hover:bg-green-100 dark:hover:bg-green-900/30"
                                        >
                                            <Upload size={18} className="mr-2" /> Import Backup
                                        </button>
                                    ) : (
                                        <label className="flex items-center justify-center p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl font-medium text-sm border border-green-100 dark:border-green-800 transition hover:bg-green-100 dark:hover:bg-green-900/30 cursor-pointer">
                                            <Upload size={18} className="mr-2" />Import Backup
                                            <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
                                        </label>
                                    )}
                                </div>
                                
                                {/* Global Sync Feature */}
                                {!isGuest && userProfile?.can_use_global_sync && (
                                    <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-xl">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <div className="p-2 bg-purple-100 dark:bg-purple-800/50 rounded-lg mr-3">
                                                    <CloudSync size={18} className="text-purple-600 dark:text-purple-400" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-purple-900 dark:text-purple-300">Cloud Sync</h4>
                                                    <p className="text-xs text-purple-700 dark:text-purple-400/80">Save and load your data</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={onManualSync}
                                                disabled={isSyncing}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition ${isSyncing ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                                            >
                                                {isSyncing ? 'Syncing...' : 'Sync Now'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* App Mode Section */}
                    <div>
                        <h3 className="px-4 mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">App Mode</h3>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="p-4">
                                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                                    {[{ id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'system', label: 'System', icon: Smartphone }].map(mode => (
                                        <button key={mode.id} onClick={() => setAppMode(mode.id)} className={`flex-1 flex items-center justify-center py-2 rounded-lg text-sm font-medium transition ${appMode === mode.id ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                                            <mode.icon size={16} className="mr-1.5" />{mode.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Device Maintenance Section */}
                    <div>
                        <h3 className="px-4 mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Device Maintenance</h3>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                                
                                {!showResetConfirm ? (
                                    <button onClick={() => setShowResetConfirm(true)} className="w-full flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-xl transition hover:bg-red-100 dark:hover:bg-red-900/20">
                                        <div className="flex items-center">
                                            <RefreshCw size={18} className="mr-2"/>
                                            <div className="text-left">
                                                <span className="font-medium text-sm block">Clear my device data</span>
                                                <span className="text-[10px] opacity-80 block">Resets this device. You'll stay signed in.</span>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} />
                                    </button>
                                ) : (
                                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30 animate-in fade-in mb-3">
                                        <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-2">Are you sure?</p>
                                        <p className="text-xs text-red-600 dark:text-red-400 mb-4">This will wipe all local data. You will stay signed in. This cannot be undone.</p>
                                        
                                        {resetMessage ? (
                                            <div className="text-center font-bold text-sm text-green-600 dark:text-green-400 py-2 animate-pulse">
                                                {resetMessage}
                                            </div>
                                        ) : (
                                            <div className="flex space-x-3">
                                                <button 
                                                    onClick={() => setShowResetConfirm(false)} 
                                                    disabled={isResetting}
                                                    className="flex-1 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-100"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={handleConfirmReset}
                                                    disabled={isResetting}
                                                    className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-bold flex items-center justify-center hover:bg-red-700"
                                                >
                                                    {isResetting ? <Loader2 size={14} className="animate-spin mr-1"/> : null}
                                                    {isResetting ? "Clearing..." : "Yes, Clear Data"}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Account Deletion Button */}
                                <div className="mt-3">
                                    {!showDeleteConfirm ? (
                                        <button onClick={() => setShowDeleteConfirm(true)} className="w-full flex items-center justify-between p-3 border border-red-100 dark:border-red-900/50 rounded-xl transition hover:bg-red-50 dark:hover:bg-red-900/10 group">
                                            <div className="flex items-center text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300">
                                                <UserX size={18} className="mr-2"/>
                                                <div className="text-left">
                                                    <span className="font-medium text-sm block">{deleteLabel}</span>
                                                    <span className="text-[10px] opacity-80 block">{deleteDesc}</span>
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className="text-red-300" />
                                        </button>
                                    ) : (
                                        <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-xl border border-red-200 dark:border-red-800 animate-in fade-in">
                                            <div className="flex items-center text-red-800 dark:text-red-200 font-bold text-sm mb-2">
                                                <AlertTriangle size={16} className="mr-2" />
                                                Danger Zone
                                            </div>
                                            <p className="text-xs text-red-700 dark:text-red-300 mb-4">
                                                This will permanently delete your {isGuest ? 'local guest profile' : 'account'} and all data. This action is irreversible.
                                            </p>
                                            <div className="flex space-x-3">
                                                <button 
                                                    onClick={() => setShowDeleteConfirm(false)} 
                                                    disabled={isDeleting}
                                                    className="flex-1 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-100"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={handleConfirmDeleteAccount}
                                                    disabled={isDeleting}
                                                    className="flex-1 py-2 bg-red-700 text-white rounded-lg text-xs font-bold flex items-center justify-center hover:bg-red-800 shadow-md"
                                                >
                                                    {isDeleting ? <Loader2 size={14} className="animate-spin mr-1"/> : <Trash2 size={14} className="mr-1"/>}
                                                    {isDeleting ? "Deleting..." : "Confirm Delete"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button onClick={onSignOut} className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition group">
                                <div className="flex items-center space-x-3 text-gray-600 dark:text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                                    <LogOut size={20} /><span className="font-medium">Sign Out</span>
                                </div>
                                <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-red-300 transition-colors"/>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
