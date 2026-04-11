import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '../services/supabase';
import { Capacitor } from '@capacitor/core';
import pkg from '../package.json';

// Automatically pulls the version from your package.json
const CURRENT_APP_VERSION = pkg.version || "1.0.0"; 

// Helper to compare semantic versions (e.g., "1.0.1" > "1.0.0" returns 1)
const compareVersions = (v1: string, v2: string) => {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
};

export const UpdateChecker: React.FC = () => {
    const [updateType, setUpdateType] = useState<'none' | 'soft' | 'hard'>('none');
    const [updateUrl, setUpdateUrl] = useState<string>('');
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const checkUpdate = async () => {
            if (!supabase) return;
            
            try {
                const platform = Capacitor.getPlatform(); // 'web', 'ios', 'android'
                // Fallback to 'android' for web testing if you want to test the UI in browser
                const searchPlatform = platform === 'web' ? 'android' : platform;

                const { data, error } = await supabase
                    .from('app_config')
                    .select('*')
                    .eq('platform', searchPlatform)
                    .single();

                if (error) {
                    // If the table doesn't exist yet, it will throw an error, we just silently ignore it
                    console.debug("[UpdateChecker] Could not fetch app_config:", error.message);
                    return;
                }

                if (data) {
                    const { latest_version, min_required_version, update_url } = data;
                    
                    if (min_required_version && compareVersions(min_required_version, CURRENT_APP_VERSION) > 0) {
                        setUpdateType('hard');
                        setUpdateUrl(update_url || '');
                        setIsVisible(true);
                    } else if (latest_version && compareVersions(latest_version, CURRENT_APP_VERSION) > 0) {
                        setUpdateType('soft');
                        setUpdateUrl(update_url || '');
                        setIsVisible(true);
                    }
                }
            } catch (e) {
                console.error("[UpdateChecker] Error checking for updates:", e);
            }
        };

        // Add a small delay so it doesn't interrupt the immediate app launch experience
        const timer = setTimeout(() => {
            checkUpdate();
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    if (!isVisible || updateType === 'none') return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex justify-center mb-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl">
                        <Download size={32} />
                    </div>
                </div>
                <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">
                    Update Available
                </h2>
                <p className="text-gray-600 dark:text-gray-300 text-center text-sm mb-6">
                    {updateType === 'hard' 
                        ? "A critical update is required to continue using the app. Please update to the latest version."
                        : "A new version of the app is available with bug fixes and improvements. Would you like to update now?"}
                </p>
                
                <div className="space-y-3">
                    <button 
                        onClick={() => {
                            if (updateUrl) window.open(updateUrl, '_blank');
                        }}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center"
                    >
                        Update Now
                    </button>
                    
                    {updateType === 'soft' && (
                        <button 
                            onClick={() => setIsVisible(false)}
                            className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold transition-colors"
                        >
                            Maybe Later
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
