import React, { useState, useEffect } from 'react';
import { ArrowLeft, Bell, Download, Play, Pause, Check, AlertTriangle, Smartphone, Globe, Plus, Trash2, Clock, Tag, MessageSquare } from 'lucide-react';
import { Card } from '../components/Card';
import { NotificationSettings, ReminderConfig } from '../types';
import { AMBIENT_SOUNDS } from '../constants';
import { goBackOrFallback } from '../utils/navigation';
import { requestNotificationPermission } from '../utils/notifications';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

interface SoundsNotificationsViewProps {
    settings: NotificationSettings;
    onUpdateSettings: (settings: NotificationSettings) => void;
    navigateTo: (view: string) => void;
    goBack: () => void;
    themeColor: string;
}

export const SoundsNotificationsView: React.FC<SoundsNotificationsViewProps> = ({ settings, onUpdateSettings, navigateTo, goBack, themeColor }) => {
    const [downloading, setDownloading] = useState<string | null>(null);
    const [playing, setPlaying] = useState<string | null>(null);
    const [isCached, setIsCached] = useState<Record<string, boolean>>({});
    const [permissionStatus, setPermissionStatus] = useState<string>('default');
    
    // Detect platform for UI hints
    const isNative = Capacitor.isNativePlatform();
    
    const audioRef = React.useRef<HTMLAudioElement | null>(null);

    // Sync permission status on mount
    useEffect(() => {
        const checkStatus = async () => {
            if (isNative) {
                try {
                    const status = await LocalNotifications.checkPermissions();
                    setPermissionStatus(status.display);
                } catch (e) {
                    console.warn("Native permission check failed", e);
                    setPermissionStatus('unknown');
                }
            } else if ('Notification' in window) {
                setPermissionStatus(Notification.permission);
            }
        };
        checkStatus();
    }, [isNative]);

    const toggleNotification = async () => {
        // If turning OFF
        if (settings.enabled) {
            onUpdateSettings({ ...settings, enabled: false });
            return;
        }

        // If turning ON - Request Permission
        const granted = await requestNotificationPermission();
        
        if (granted) {
            onUpdateSettings({ ...settings, enabled: true });
            setPermissionStatus('granted');
            
            // Send a test notification to confirm it works
            if (isNative) {
                LocalNotifications.schedule({
                    notifications: [{
                        title: "Notifications Active",
                        body: "Great! You'll receive study reminders here.",
                        id: 999,
                        schedule: { at: new Date(Date.now() + 1000) },
                        sound: 'beep.wav',
                        smallIcon: 'ic_stat_icon_config_sample'
                    }]
                });
            } else {
                new Notification("Notifications Active", { 
                    body: "Great! You'll receive study reminders here.",
                    icon: 'https://engram-space.vercel.app/brand/engram_logo/engram_logo_192.png'
                });
            }

        } else {
            alert('Notifications are blocked. Please enable them in your device settings.');
            setPermissionStatus('denied');
            onUpdateSettings({ ...settings, enabled: false });
        }
    };

    const handleReminderChange = (index: number, updated: ReminderConfig) => {
        const newReminders = [...(settings.reminders || [])];
        newReminders[index] = updated;
        onUpdateSettings({ ...settings, reminders: newReminders });
    };

    const addTimeSlot = () => {
        // Default new slot
        const newReminders = [...(settings.reminders || []), { time: '09:00', label: 'Time to Study!' }];
        onUpdateSettings({ ...settings, reminders: newReminders });
    };

    const removeTimeSlot = (index: number) => {
        const newReminders = settings.reminders.filter((_, i) => i !== index);
        onUpdateSettings({ ...settings, reminders: newReminders });
    };

    // Use shared constant for sound list
    const soundList = AMBIENT_SOUNDS;

    // Check cache status on load
    useEffect(() => {
        if ('caches' in window) {
            caches.open('engram-sound-cache').then(async (cache) => {
                const status: Record<string, boolean> = {};
                for (const sound of soundList) {
                    const match = await cache.match(sound.url);
                    status[sound.id] = !!match;
                }
                setIsCached(status);
            });
        }
    }, [soundList]);

    const handleDownload = async (id: string) => {
        const resource = soundList.find(r => r.id === id);
        if (!resource || !('caches' in window)) return;

        setDownloading(id);
        try {
            const cache = await caches.open('engram-sound-cache');
            await cache.add(resource.url);
            setIsCached(prev => ({ ...prev, [id]: true }));
            alert(`Downloaded ${resource.name} for offline use.`);
        } catch (e) {
            console.error("Download failed:", e);
            alert("Failed to download sound. Please check connection.");
        } finally {
            setDownloading(null);
        }
    };

    const handlePreview = (url: string, id: string) => {
        if (playing === id) {
            audioRef.current?.pause();
            setPlaying(null);
        } else {
            if (audioRef.current) {
                audioRef.current.src = url;
                audioRef.current.play();
                setPlaying(id);
            }
        }
    };

    const reminders = settings.reminders || [];

    return (
        <div className="px-0 py-4 space-y-6 pb-20">
            <audio ref={audioRef} onEnded={() => setPlaying(null)} />
            
            <div className="flex items-center space-x-2 mb-4">
                <button onClick={() => goBackOrFallback('#/settings')} className={`p-2 rounded-full hover:bg-${themeColor}-100 dark:hover:bg-gray-800 text-${themeColor}-600 dark:text-${themeColor}-400`}>
                    <ArrowLeft size={24} />
                </button>
                <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>Sounds & Notifications</h2>
            </div>

            {/* Notifications Section */}
            <Card className="p-5">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-full bg-${themeColor}-100 dark:bg-${themeColor}-900/30 text-${themeColor}-600 dark:text-${themeColor}-400`}>
                            <Bell size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 dark:text-white">Daily Reminders</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {isNative ? "High-priority native alerts" : "Browser push notifications"}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={toggleNotification}
                        className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 relative ${settings.enabled ? `bg-${themeColor}-500` : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${settings.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>

                {settings.enabled && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 animate-in fade-in">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center">
                                <Clock size={16} className="mr-2 opacity-60" /> Schedule
                            </span>
                            <button 
                                onClick={addTimeSlot}
                                className={`text-xs font-bold text-${themeColor}-600 dark:text-${themeColor}-400 bg-${themeColor}-50 dark:bg-${themeColor}-900/30 px-3 py-1.5 rounded-lg flex items-center hover:opacity-80 transition`}
                            >
                                <Plus size={14} className="mr-1" /> Add Time
                            </button>
                        </div>

                        <div className="space-y-4 mb-2">
                            {reminders.map((reminder, idx) => (
                                <div key={idx} className="flex flex-col gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 animate-in slide-in-from-top-2 shadow-sm">
                                    {/* Top Row: Time & Delete */}
                                    <div className="flex justify-between items-center">
                                         <div className="flex items-center bg-white dark:bg-gray-700 rounded-xl px-3 py-1.5 border border-gray-200 dark:border-gray-600 shadow-sm">
                                            <Clock size={16} className={`text-${themeColor}-500 mr-2`}/>
                                            <input 
                                                type="time" 
                                                value={reminder.time} 
                                                onChange={(e) => handleReminderChange(idx, { ...reminder, time: e.target.value })}
                                                className="bg-transparent outline-none font-bold text-gray-800 dark:text-gray-100 text-lg"
                                            />
                                         </div>
                                         
                                         <button 
                                            onClick={() => removeTimeSlot(idx)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition"
                                            title="Remove reminder"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    {/* Bottom Row: Custom Message */}
                                    <div className="relative w-full">
                                        <MessageSquare size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input 
                                            type="text"
                                            value={reminder.label || ''}
                                            onChange={(e) => handleReminderChange(idx, { ...reminder, label: e.target.value })}
                                            placeholder="Enter custom message..."
                                            className="w-full bg-white dark:bg-gray-700 pl-9 pr-3 py-3 rounded-xl border border-gray-200 dark:border-gray-600 outline-none text-sm font-medium text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 shadow-sm transition-all"
                                        />
                                    </div>
                                </div>
                            ))}
                            {reminders.length === 0 && (
                                <p className="text-center text-xs text-gray-400 italic py-2">No reminders set. Add a time!</p>
                            )}
                        </div>
                        
                        {permissionStatus === 'denied' && (
                            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg flex items-start">
                                <AlertTriangle size={14} className="mr-2 mt-0.5 shrink-0" />
                                <span>Permission denied. Please enable notifications in your device settings.</span>
                            </div>
                        )}

                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs rounded-lg flex items-start">
                            {isNative ? (
                                <Smartphone size={14} className="mr-2 mt-0.5 shrink-0" />
                            ) : (
                                <Globe size={14} className="mr-2 mt-0.5 shrink-0" />
                            )}
                            <span>
                                {isNative 
                                    ? "Running in Native Mode. Reminders will ring even if the app is closed." 
                                    : "Running in Web Mode. Reminders require the browser to be running in the background."}
                            </span>
                        </div>
                    </div>
                )}
            </Card>

            {/* Sounds Section */}
            <div>
                <div className="flex justify-between items-center mb-3 px-1">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">Ambience Library</h3>
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">Offline Ready</span>
                </div>
                
                <div className="space-y-3">
                    {soundList.map(sound => (
                        <div key={sound.id} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between shadow-sm">
                            <div className="flex items-center space-x-3 overflow-hidden">
                                <div className={`p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0`}>
                                    <sound.icon size={20} />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate">{sound.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{sound.description} • {sound.size}</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center space-x-2 shrink-0">
                                <button 
                                    onClick={() => handlePreview(sound.url, sound.id)}
                                    className={`p-2 rounded-full transition ${playing === sound.id ? `bg-${themeColor}-100 text-${themeColor}-600` : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                >
                                    {playing === sound.id ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
                                </button>
                                
                                {isCached[sound.id] ? (
                                    <div className="p-2 text-green-500" title="Downloaded">
                                        <Check size={18} />
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => handleDownload(sound.id)}
                                        disabled={downloading === sound.id}
                                        className="p-2 text-gray-400 hover:text-blue-500 transition"
                                        title="Download"
                                    >
                                        {downloading === sound.id ? (
                                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <Download size={18} />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};