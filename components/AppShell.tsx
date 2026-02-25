
import React, { useState, useEffect } from 'react';
import { RotateCw, CheckCircle, X, Bell, MessageSquare, Trash2, CheckCheck } from 'lucide-react';
import { NavButton } from './NavButton';
import { FloatingFocusTimer } from './FloatingFocusTimer';
import { PodcastMiniPlayer } from '../views/PodcastView';
import { OfflineBanner } from './OfflineBanner';
import { PermissionModal, FeedbackModal } from './Modals';
import { TAB_ITEMS } from '../constants';
import { Topic, User } from '../types';
import { PodcastState, PodcastControls } from '../hooks/usePodcast';
import { GlobalNotificationService, GlobalNotification } from '../services/globalNotifications';
import { triggerHaptic } from '../utils/haptics';

interface AppShellProps {
    children: React.ReactNode;
    user: User | null;
    isGuest: boolean;
    currentView: string;
    themeColor: string;
    themeIntensity: string;
    navigateTo: (view: string, data?: unknown) => void;
    enabledTabs: string[];
    showFeedbackModal: boolean;
    setShowFeedbackModal: (show: boolean) => void;
    showImportSuccessModal: boolean;
    permissionsGranted: boolean;
    handleAllowPermissions: () => void;
    podcast: { state: PodcastState; controls: PodcastControls; audioRef: React.RefObject<HTMLAudioElement> };
    focusState: { topicId: string | null; topicName: string | null };
    handleFloatingLog: (minutes: number) => void;
    selectedTopic: Topic | null;
    
    // New Props for Podcast Overlay
    isPodcastOpen?: boolean;
    setIsPodcastOpen?: (open: boolean) => void;
    podcastOverlay?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
    children,
    user,
    isGuest,
    currentView,
    themeColor,
    themeIntensity,
    navigateTo,
    enabledTabs,
    showFeedbackModal,
    setShowFeedbackModal,
    showImportSuccessModal,
    permissionsGranted,
    handleAllowPermissions,
    podcast,
    focusState,
    handleFloatingLog,
    selectedTopic,
    isPodcastOpen = false,
    setIsPodcastOpen,
    podcastOverlay
}) => {
    const [showGuestBanner, setShowGuestBanner] = useState(true);
    const visibleTabsIds = [...enabledTabs, 'settings'];
    
    // Notifications State
    const [notifications, setNotifications] = useState<GlobalNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Use dark: modifier for dark mode background instead of JS conditional
    const mainBgClass = `bg-${themeColor}-${themeIntensity} dark:bg-gray-900`;
    const isLoggedIn = !!(user || isGuest);

    const showTabBar = isLoggedIn && currentView !== 'onboarding' && currentView !== 'chat';

    // Guest Status Check
    const guestStatus = isGuest ? checkGuestStatus() : null;

    // Base padding for tab bar (~64px) + env(safe-area)
    const bottomPaddingBase = 64; // px
    
    const contentPaddingStyle = {
        paddingBottom: `calc(${bottomPaddingBase}px + env(safe-area-inset-bottom, 20px))`
    };

    // MOUNT GATE: Only mount Floating Timer if we are NOT on the detail view of the currently active topic.
    const showFloatingTimer = isLoggedIn && 
        focusState.topicId && 
        currentView !== 'onboarding' && 
        !(currentView === 'topicDetail' && selectedTopic?.id === focusState.topicId);

    // Dynamic classes for Main Container
    const isEdgeToEdge = (!isLoggedIn) || currentView === 'onboarding' || currentView === 'chat' || currentView === 'topicDetail';
    const mainClasses = `flex-1 flex flex-col min-h-0 no-scrollbar ${
        isEdgeToEdge 
            ? 'bg-white dark:bg-gray-900 p-0 overflow-hidden' 
            : `${['subjects', 'home', 'topicList', 'settings', 'podcastSettings', 'appearance', 'tabBarSettings', 'dateTimeSettings', 'soundsNotifications', 'widgets', 'about', 'profile', 'aiFeatures', 'flashcardHub'].includes(currentView) ? 'px-1.5' : 'px-4'} ${currentView === 'settings' ? 'pt-0' : 'pt-4'} overflow-y-auto`
    }`;

    // --- Global Notifications Logic ---
    useEffect(() => {
        if (!isLoggedIn) return;

        // 1. Fetch initial
        const loadNotifications = async () => {
            const all = await GlobalNotificationService.fetchNotifications();
            const dismissed = new Set(GlobalNotificationService.getDismissedIds());
            const active = all.filter(n => !dismissed.has(n.id));
            setNotifications(active);
            setUnreadCount(active.length);
        };
        loadNotifications();

        // 2. Realtime Sub
        const sub = GlobalNotificationService.subscribe((newNotif) => {
            setNotifications(prev => [newNotif, ...prev]);
            setUnreadCount(prev => prev + 1);
        });

        return () => { if(sub) sub.unsubscribe(); };
    }, [isLoggedIn]);

    const handleDismissNotification = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        triggerHaptic.impact('Light');
        
        // Optimistic Remove
        setNotifications(prev => prev.filter(n => n.id !== id));
        setUnreadCount(prev => Math.max(0, prev - 1));
        
        // Persist
        GlobalNotificationService.dismissNotifications([id]);
    };

    const handleClearAllNotifications = () => {
        if (notifications.length === 0) return;
        triggerHaptic.notification('Success');
        
        const ids = notifications.map(n => n.id);
        GlobalNotificationService.dismissNotifications(ids);
        
        setNotifications([]);
        setUnreadCount(0);
        setIsDrawerOpen(false);
    };

    const handleToggleDrawer = () => {
        triggerHaptic.selection();
        setIsDrawerOpen(!isDrawerOpen);
    };

    return (
        <div 
            className={`min-h-screen bg-gray-100 dark:bg-gray-900 font-sans antialiased flex justify-center p-0 md:p-4 transition-colors duration-200`}
            style={{ '--tabbar-height': '64px' } as React.CSSProperties}
        >
            {!permissionsGranted && isLoggedIn && <PermissionModal onAllow={handleAllowPermissions} />}
            <OfflineBanner />
            <FeedbackModal isOpen={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} themeColor={themeColor} />
            
            {showImportSuccessModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center border border-gray-100 dark:border-gray-800">
                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600 dark:text-green-400 shadow-inner">
                            <CheckCircle size={32} />
                        </div>
                        <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">Import Successful!</h2>
                        <p className="text-gray-500 dark:text-gray-400 mb-8 text-xs leading-relaxed">
                            Your data has been restored. Please relaunch the app to apply the changes.
                        </p>
                        <button 
                            onClick={() => window.location.reload()}
                            className={`w-full py-4 bg-${themeColor}-600 text-white rounded-2xl font-bold shadow-lg hover:bg-${themeColor}-700 transition transform active:scale-95 flex items-center justify-center`}
                        >
                            <RotateCw size={20} className="mr-2" />
                            Relaunch App
                        </button>
                    </div>
                </div>
            )}

            {/* NOTIFICATION DRAWER (Option 1) */}
            {/* Backdrop */}
            <div 
                className={`fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsDrawerOpen(false)}
            />
            
            {/* Slide-Over Panel */}
            <div 
                className={`fixed top-0 right-0 z-[101] h-full w-[85vw] md:w-[400px] bg-white dark:bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-out border-l border-gray-100 dark:border-gray-800 flex flex-col ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Drawer Header */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-900 shrink-0">
                    <div className="flex items-center">
                        <div className={`p-2 bg-${themeColor}-50 dark:bg-${themeColor}-900/20 text-${themeColor}-600 rounded-full mr-3`}>
                            <Bell size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-800 dark:text-white">Notifications</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {notifications.length > 0 ? `${notifications.length} Unread` : 'All caught up'}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsDrawerOpen(false)} 
                        className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Drawer Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 dark:bg-black/20">
                    {notifications.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                            <MessageSquare size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                            <p className="text-sm font-medium">No new notifications</p>
                        </div>
                    ) : (
                        notifications.map(notif => (
                            <div 
                                key={notif.id} 
                                className="group relative bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col transition-all hover:shadow-md animate-in slide-in-from-right-4 duration-300"
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-bold text-sm text-gray-900 dark:text-white pr-6 leading-tight">
                                        {notif.title}
                                    </h4>
                                    <button 
                                        onClick={(e) => handleDismissNotification(notif.id, e)}
                                        className="absolute top-3 right-3 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                                        title="Dismiss"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                
                                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-3 pr-2">
                                    {notif.body}
                                </p>
                                
                                <div className="flex justify-between items-center mt-auto">
                                    <span className="text-[10px] text-gray-400 font-medium">
                                        {new Date(notif.created_at).toLocaleDateString()}
                                    </span>
                                    <button
                                        onClick={(e) => handleDismissNotification(notif.id, e)}
                                        className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg"
                                    >
                                        <CheckCheck size={12} className="mr-1" /> Mark as Read
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Drawer Footer */}
                {notifications.length > 0 && (
                    <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 safe-area-bottom">
                        <button 
                            onClick={handleClearAllNotifications}
                            className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-sm hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition flex items-center justify-center border border-transparent hover:border-red-100 dark:hover:border-red-900/50"
                        >
                            <Trash2 size={16} className="mr-2" /> Clear All Notifications
                        </button>
                    </div>
                )}
            </div>

            <div className={`w-full max-w-md md:rounded-3xl md:shadow-2xl overflow-hidden flex flex-col h-[100dvh] md:h-[calc(100vh-2rem)] border-0 md:border dark:border-gray-800 ${mainBgClass} relative`}>
                
                {/* GLOBAL PODCAST OVERLAY */}
                {isPodcastOpen && podcastOverlay && (
                    <div className="absolute inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
                        {podcastOverlay}
                    </div>
                )}

                {/* GUEST BANNER */}
                {isGuest && showGuestBanner && guestStatus && !guestStatus.expired && !isPodcastOpen && (
                    <div className="bg-indigo-600 dark:bg-indigo-900/80 text-white px-4 py-2 text-xs font-medium flex justify-between items-center shrink-0 animate-in slide-in-from-top-2 relative z-20">
                        <span>
                            Guest Trial: <span className="font-bold">{guestStatus.daysLeft} days</span> remaining
                        </span>
                        <button 
                            onClick={() => setShowGuestBanner(false)} 
                            className="p-1 rounded-full hover:bg-white/20 transition opacity-90 hover:opacity-100"
                            aria-label="Dismiss banner"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* Header Logic */}
                {isLoggedIn && !isPodcastOpen && currentView !== 'onboarding' && currentView !== 'chat' && currentView !== 'settings' && currentView !== 'appearance' && currentView !== 'tabBarSettings' && currentView !== 'dateTimeSettings' && currentView !== 'profile' && currentView !== 'soundsNotifications' && currentView !== 'widgets' && currentView !== 'about' && currentView !== 'terms' && currentView !== 'privacy' && currentView !== 'licenses' && currentView !== 'podcastSettings' && (
                    <header className={`bg-${themeColor}-600 dark:bg-${themeColor}-900 px-4 py-2 text-white flex justify-between items-center shrink-0 shadow-sm z-10`}>
                        <h1 className="text-lg font-bold tracking-tight">Engram</h1>
                        <button 
                            onClick={handleToggleDrawer}
                            className="relative p-2 rounded-full hover:bg-white/10 transition"
                        >
                            <Bell size={20} />
                            {unreadCount > 0 && (
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-gray-900 animate-pulse"></span>
                            )}
                        </button>
                    </header>
                )}
                {isLoggedIn && !isPodcastOpen && ['settings', 'tabBarSettings', 'dateTimeSettings', 'soundsNotifications', 'widgets'].includes(currentView) && currentView !== 'appearance' && (
                    <header className={`bg-${themeColor}-50 dark:bg-gray-900 px-4 py-3 text-${themeColor}-900 dark:text-${themeColor}-100 flex justify-between items-center shrink-0 z-10`}>
                        <h1 className="text-xl font-bold pl-1">{currentView === 'settings' ? 'Settings' : ' '}</h1>
                    </header>
                )}
                
                {/* Main Content Area */}
                <main 
                    id="main-scroll-container" 
                    className={mainClasses}
                    // FIX: Apply padding whenever the tab bar is visible.
                    // This prevents content (like the notebook) from being hidden behind the fixed footer.
                    style={showTabBar ? contentPaddingStyle : undefined}
                >
                    {children}
                </main>
                
                <audio 
                    ref={podcast.audioRef} 
                    src={podcast.state.audioSrc || undefined}
                    onTimeUpdate={podcast.audioProps.onTimeUpdate}
                    onLoadedMetadata={podcast.audioProps.onLoadedMetadata}
                    onEnded={podcast.audioProps.onEnded}
                />

                {/* Mini Player Logic */}
                {isLoggedIn && podcast.state.currentTopic && !isPodcastOpen && (
                    <div className="z-30 pointer-events-none">
                        <PodcastMiniPlayer 
                            state={podcast.state} 
                            controls={podcast.controls} 
                            navigateTo={() => setIsPodcastOpen?.(true)} 
                            themeColor={themeColor}
                        />
                    </div>
                )}

                {/* Floating Focus Timer */}
                {showFloatingTimer && (
                    <FloatingFocusTimer
                        activeTopicId={focusState.topicId}
                        activeTopicName={focusState.topicName || "Topic"}
                        currentView={currentView}
                        selectedTopicId={selectedTopic?.id}
                        themeColor={themeColor}
                        onLogTime={handleFloatingLog}
                    />
                )}

                {/* Navigation Footer */}
                {/* HIDDEN IN CHAT: To maximize screen space and fix layout */}
                {isLoggedIn && currentView !== 'onboarding' && currentView !== 'chat' && (
                    <footer 
                        className="fixed left-0 right-0 max-w-md mx-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-white/20 dark:border-gray-800 md:rounded-b-3xl shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)] flex justify-between items-center px-2 h-[calc(4rem+env(safe-area-inset-bottom))] md:h-16 z-40 overflow-x-auto no-scrollbar transition-all duration-300"
                        style={{ 
                            bottom: '0', 
                            paddingBottom: 'env(safe-area-inset-bottom)'
                        }}
                    >
                        {visibleTabsIds.map(tabId => {
                            const item = TAB_ITEMS.find(t => t.id === tabId);
                            if (!item) return null;
                            return (<NavButton key={item.id} icon={item.icon} label={item.label} view={item.id} currentView={currentView} navigateTo={navigateTo} themeColor={themeColor} />);
                        })}
                    </footer>
                )}
            </div>
        </div>
    );
};
