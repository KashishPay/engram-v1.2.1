
import React from 'react';
import { ArrowLeft, Twitter, Instagram, Facebook, ChevronRight, Youtube } from 'lucide-react';
import { goBackOrFallback } from '../utils/navigation';
import { EngramLogo } from '../components/EngramLogo';

interface AboutViewProps {
    navigateTo: (view: string) => void;
    goBack: () => void;
    themeColor: string;
}

export const AboutView: React.FC<AboutViewProps> = ({ navigateTo, goBack, themeColor }) => (
    <div className="px-0 py-4 space-y-6">
        <div className="flex items-center space-x-2 mb-4">
            <button onClick={() => goBackOrFallback('#/settings')} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800`}>
                <ArrowLeft size={24} />
            </button>
            <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>About</h2>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm text-center">
            
            <div className="flex items-center justify-center mb-6">
                <EngramLogo size={64} className="shadow-lg rounded-2xl transform rotate-3" />
            </div>

            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">Engram</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-6">Version 1.0 (Beta)</p>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-6">
                Engram is an AI-powered study companion designed to help you master any subject through spaced repetition, active recall, and instant feedback.
            </p>

            {/* Roadmap (Coming Soon): compact card inserted after description; keeps mobile elegance; no new deps. */}
            <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-700/40 dark:to-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 mb-6 text-left shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100 mb-3 flex items-center">
                    <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide mr-2">Roadmap</span>
                    Coming Soon
                </h3>
                <ul className="space-y-2.5">
                    <li className="flex items-start text-xs text-gray-600 dark:text-gray-300">
                        <span className={`mt-0.5 mr-2 w-1.5 h-1.5 rounded-full bg-${themeColor}-500 shrink-0`}></span>
                        <span>
                            <strong className="text-gray-800 dark:text-gray-200">Engram Pro:</strong> Removes ads & unlocks Cloud Sync functionality.
                        </span>
                    </li>
                    <li className="flex items-start text-xs text-gray-600 dark:text-gray-300">
                        <span className={`mt-0.5 mr-2 w-1.5 h-1.5 rounded-full bg-${themeColor}-500 shrink-0`}></span>
                        <span>Native Android & iOS versions.</span>
                    </li>
                </ul>
            </div>

            <div className="flex justify-center space-x-6 mb-8">
                {/* Social placeholders (non-interactive for now) */}
                <div className="text-gray-300 dark:text-gray-600"><Twitter size={24} /></div>
                <div className="text-gray-300 dark:text-gray-600"><Instagram size={24} /></div>
                <div className="text-gray-300 dark:text-gray-600"><Facebook size={24} /></div>
                
                {/* Active YouTube Link */}
                <a 
                    href="https://www.youtube.com/@engramspace" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 transition transform hover:scale-110"
                    aria-label="Engram YouTube Channel"
                >
                    <Youtube size={24} />
                </a>
            </div>
            <div className="space-y-3">
                <button onClick={() => navigateTo('terms')} className="w-full py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 flex justify-between px-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition"><span>Terms of Service</span><ChevronRight size={16}/></button>
                <button onClick={() => navigateTo('privacy')} className="w-full py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 flex justify-between px-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition"><span>Privacy Policy</span><ChevronRight size={16}/></button>
                <button onClick={() => navigateTo('licenses')} className="w-full py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 flex justify-between px-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition"><span>Open Source Licenses</span><ChevronRight size={16}/></button>
            </div>
            <p className="mt-8 text-xs text-gray-400">© 2026 Engram. All rights reserved.</p>
        </div>
    </div>
);
