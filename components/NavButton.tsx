
import React from 'react';
import { triggerHaptic } from '../utils/haptics';

interface NavButtonProps {
    icon: any;
    label: string;
    view: string;
    currentView: string;
    navigateTo: (view: string) => void;
    themeColor: string;
}

export const NavButton: React.FC<NavButtonProps> = React.memo(({ icon: Icon, label, view, currentView, navigateTo, themeColor }) => {
    const isNavDisabled = ['quiz'].includes(currentView); 
    const isActive = isNavDisabled ? false : (view === currentView || (view === 'settings' && ['appearance', 'tabBarSettings', 'dateTimeSettings', 'about', 'terms', 'privacy', 'licenses'].includes(currentView))); 
    
    const handleClick = () => {
        triggerHaptic.selection();
        navigateTo(view);
    };

    return (
        <button onClick={handleClick} className={`flex flex-col items-center p-2 min-w-[64px] rounded-lg transition duration-200 ${isActive ? `text-${themeColor}-600 dark:text-${themeColor}-400 font-semibold` : `text-gray-500 dark:text-gray-500 hover:text-${themeColor}-500 dark:hover:text-${themeColor}-400`}`} disabled={isNavDisabled}>
            <Icon size={24} /><span className="text-[10px] mt-1 whitespace-nowrap">{label}</span>
        </button>
    );
});
