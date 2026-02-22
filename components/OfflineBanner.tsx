
import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (isOnline) return null;

    return (
        <div className="bg-red-500 text-white px-4 py-2 text-xs font-bold text-center flex items-center justify-center animate-pulse fixed top-0 left-0 right-0 z-50">
            <WifiOff size={14} className="mr-2" />
            You are offline. AI features may be unavailable.
        </div>
    );
};
