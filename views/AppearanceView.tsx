
import React from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { APP_THEMES } from '../constants';
import { goBackOrFallback } from '../utils/navigation';

interface AppearanceViewProps {
    currentTheme: string;
    setCurrentTheme: (theme: string) => void;
    themeIntensity: string;
    setThemeIntensity: (intensity: string) => void;
    goBack: () => void;
}

export const AppearanceView: React.FC<AppearanceViewProps> = ({ 
    currentTheme, setCurrentTheme, themeIntensity, setThemeIntensity, goBack 
}) => (
    <div className="px-0 py-4 space-y-6">
        <div className="flex items-center space-x-2 mb-4">
            <button onClick={() => goBackOrFallback('#/settings')} className={`p-2 rounded-full hover:bg-${currentTheme}-100 text-${currentTheme}-600 dark:text-${currentTheme}-400 dark:hover:bg-gray-800`}>
                <ArrowLeft size={24} />
            </button>
            <h2 className={`text-2xl font-bold text-${currentTheme}-800 dark:text-${currentTheme}-200`}>Theme</h2>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
            <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4">Color Series</h3>
            <div className="grid grid-cols-2 gap-4">
                {APP_THEMES.map(theme => (
                    <button key={theme.id} onClick={() => setCurrentTheme(theme.id)} className={`flex flex-col items-center p-4 rounded-xl transition border-2 ${currentTheme === theme.id ? `border-${theme.id}-500 bg-${theme.id}-50 dark:bg-${theme.id}-900/30` : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <div className={`w-12 h-12 rounded-lg ${theme.color} mb-2 shadow-sm flex items-center justify-center text-white`}>
                            {currentTheme === theme.id && <Check size={20}/>}
                        </div>
                        <span className={`font-medium text-sm ${currentTheme === theme.id ? `text-${theme.id}-700 dark:text-${theme.id}-300` : 'text-gray-600 dark:text-gray-400'}`}>{theme.name}</span>
                    </button>
                ))}
            </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
            <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Color Intensity (Light Mode Only)</h3>
            <div className="flex space-x-2">
                {['50', '100', '200'].map(intensity => (
                    <button key={intensity} onClick={() => setThemeIntensity(intensity)} className={`flex-1 py-3 rounded-lg font-medium text-sm transition border-2 ${themeIntensity === intensity ? `border-${currentTheme}-500 bg-${currentTheme}-50 dark:bg-${currentTheme}-900/50 text-${currentTheme}-800 dark:text-${currentTheme}-200` : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        {intensity === '50' ? 'Soft' : intensity === '100' ? 'Medium' : 'Vibrant'}
                    </button>
                ))}
            </div>
        </div>
    </div>
);
