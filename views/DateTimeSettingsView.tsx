
import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { goBackOrFallback } from '../utils/navigation';

interface DateTimeSettingsViewProps {
    settings: Record<string, unknown>; // Using any for brevity in prop passing, strictly typed in usage
    onUpdateSettings: (newSettings: Record<string, unknown>) => void;
    navigateTo: (view: string) => void;
    goBack: () => void;
    themeColor: string;
}

export const DateTimeSettingsView: React.FC<DateTimeSettingsViewProps> = ({ settings, onUpdateSettings, themeColor }) => {
    
    const handleChange = (key: string, value: unknown) => {
        onUpdateSettings({ ...settings, [key]: value });
    };

    const Toggle = ({ checked, onChange }: { checked: boolean, onChange: (val: boolean) => void }) => (
        <button 
            onClick={() => onChange(!checked)}
            className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out relative ${checked ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-600'}`}
        >
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
    );

    return (
        <div className="px-0 py-4 space-y-4">
            <div className="flex items-center space-x-2 mb-4">
                <button onClick={() => goBackOrFallback('#/settings')} className={`p-2 rounded-full hover:bg-${themeColor}-100 dark:hover:bg-gray-800 text-${themeColor}-600 dark:text-${themeColor}-400`}>
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Date & Time</h2>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-transparent dark:border-gray-700">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                    <div className="flex flex-col">
                        <span className="text-gray-800 dark:text-gray-200 font-medium">Time Format</span>
                        <span className="text-xs text-gray-400">System Default</span>
                    </div>
                    <div className="relative">
                        <select 
                            value={settings.timeFormat as string}
                            onChange={(e) => handleChange('timeFormat', e.target.value)}
                            className="appearance-none bg-transparent text-gray-500 dark:text-gray-300 text-right outline-none cursor-pointer pr-6 z-10 relative"
                        >
                            <option value="system" className="bg-white dark:bg-gray-800">System Default</option>
                            <option value="12h" className="bg-white dark:bg-gray-800">12-Hour</option>
                            <option value="24h" className="bg-white dark:bg-gray-800">24-Hour</option>
                        </select>
                        <ChevronRight size={16} className="text-gray-300 dark:text-gray-500 absolute right-0 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                    </div>
                </div>

                <div className="p-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                    <div className="flex flex-col">
                        <span className="text-gray-800 dark:text-gray-200 font-medium">Start Day of Week</span>
                        <span className="text-xs text-gray-400 capitalize">{settings.startDayOfWeek}</span>
                    </div>
                    <div className="relative">
                        <select 
                            value={settings.startDayOfWeek as string}
                            onChange={(e) => handleChange('startDayOfWeek', e.target.value)}
                            className="appearance-none bg-transparent text-gray-500 dark:text-gray-300 text-right outline-none cursor-pointer opacity-0 absolute right-0 w-full h-full z-10"
                        >
                            <option value="sunday">Sunday</option>
                            <option value="monday">Monday</option>
                            <option value="saturday">Saturday</option>
                        </select>
                        <div className="flex items-center text-gray-500 dark:text-gray-300">
                             <span className="capitalize mr-2 text-sm">{settings.startDayOfWeek as string}</span>
                             <ChevronRight size={16} className="text-gray-300 dark:text-gray-500" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-transparent dark:border-gray-700">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <span className="text-gray-800 dark:text-gray-200 font-medium">Show Week Numbers(W)</span>
                    <Toggle checked={settings.showWeekNumbers as boolean} onChange={(val) => handleChange('showWeekNumbers', val)} />
                </div>

                <div className="p-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                    <div className="flex flex-col">
                        <span className="text-gray-800 dark:text-gray-200 font-medium">Week 1 is</span>
                        <span className="text-xs text-gray-400 capitalize">{settings.week1Definition as string}</span>
                    </div>
                    <div className="relative">
                         <select 
                            value={settings.week1Definition as string}
                            onChange={(e) => handleChange('week1Definition', e.target.value)}
                             className="appearance-none bg-transparent text-gray-500 dark:text-gray-300 text-right outline-none cursor-pointer opacity-0 absolute right-0 w-full h-full z-10"
                        >
                            <option value="default">Default</option>
                            <option value="first4day">First 4-day week</option>
                            <option value="firstFullWeek">First full week</option>
                        </select>
                        <div className="flex items-center text-gray-500 dark:text-gray-300">
                             <span className="capitalize mr-2 text-sm">{settings.week1Definition as string}</span>
                             <ChevronRight size={16} className="text-gray-300 dark:text-gray-500" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-transparent dark:border-gray-700">
                <div className="p-4 flex justify-between items-start">
                    <div className="flex flex-col pr-4">
                        <span className="text-gray-800 dark:text-gray-200 font-medium mb-1">Countdown Mode</span>
                        <span className="text-xs text-gray-400 leading-relaxed">
                            If enabled, a countdown will appear below the task instead of its due date. Tap the countdown again to switch back to normal due date mode.
                        </span>
                    </div>
                    <div className="mt-1">
                        <Toggle checked={settings.countdownMode as boolean} onChange={(val) => handleChange('countdownMode', val)} />
                    </div>
                </div>
            </div>
        </div>
    );
};
