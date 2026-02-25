import React from 'react';
import { ArrowLeft, Shield, Database, Cpu } from 'lucide-react';
import { Card } from '../components/Card';
import { goBackOrFallback } from '../utils/navigation';

interface LegalViewProps {
    navigateTo: (view: string) => void;
    goBack: () => void;
    themeColor: string;
}

const Header = ({ title, themeColor }: { title: string, themeColor: string }) => (
    <div className="flex items-center space-x-2 mb-6">
        <button onClick={() => goBackOrFallback('#/about')} className={`p-2 rounded-full hover:bg-${themeColor}-100 text-${themeColor}-600 dark:text-${themeColor}-400 dark:hover:bg-gray-800`}>
            <ArrowLeft size={24} />
        </button>
        <h2 className={`text-2xl font-bold text-${themeColor}-800 dark:text-${themeColor}-200`}>{title}</h2>
    </div>
);

export const TermsContent: React.FC = () => (
    <div className="space-y-6 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        <p className="font-bold text-xs uppercase text-gray-400">Last Updated: February 2026</p>
        
        <section>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2 flex items-center">
                <Shield size={18} className="mr-2 opacity-70"/> 1. Service Usage
            </h3>
            <p>By using Engram ("the App"), you agree to these terms. Engram is an AI-assisted study tool designed to help you organize notes and practice active recall.</p>
        </section>
        
        <section>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2 flex items-center">
                <Cpu size={18} className="mr-2 opacity-70"/> 2. Artificial Intelligence
            </h3>
            <p>The App uses Google Gemini API to generate quizzes, summaries, and chat responses.</p>
            <ul className="list-disc list-inside ml-2 mt-2 space-y-1 text-gray-600 dark:text-gray-400">
                <li><strong>Accuracy:</strong> AI can make mistakes ("hallucinations"). Always verify critical information from your primary study materials.</li>
                <li><strong>Usage Limits:</strong> Free usage is subject to quotas. You may provide your own API Key for extended limits.</li>
            </ul>
        </section>
        
        <section>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2 flex items-center">
                <Database size={18} className="mr-2 opacity-70"/> 3. User Content
            </h3>
            <p>You retain full ownership of the notes and images you upload. You grant the App permission to process this data solely for the purpose of generating study aids.</p>
        </section>

        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 rounded-r-xl">
            <p className="text-yellow-800 dark:text-yellow-200 font-medium">
                Disclaimer: This tool is a supplement to your education, not a replacement for official instruction. We are not liable for academic performance outcomes.
            </p>
        </div>
    </div>
);

export const PrivacyContent: React.FC = () => (
    <div className="space-y-6 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        <p className="font-bold text-xs uppercase text-gray-400">Last Updated: February 2026</p>

        <div className="p-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded-r-xl mb-6">
            <h4 className="font-bold text-green-800 dark:text-green-200 mb-1">Local-First Architecture</h4>
            <p className="text-green-700 dark:text-green-300">
                Your notes, images, and chat history are stored <strong>locally on your device</strong> (IndexedDB). They are not uploaded to our servers unless you explicitly sync or use AI features.
            </p>
        </div>

        <section>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">1. Data We Collect</h3>
            <ul className="list-disc list-inside ml-2 mt-2 space-y-1">
                <li><strong>Profile Data:</strong> Name, email, and avatar (stored via Supabase for authentication).</li>
                <li><strong>Usage Data:</strong> Anonymous statistics (e.g., number of quizzes taken) to improve the App.</li>
                <li><strong>Input Data:</strong> Text and images you send to the AI are transmitted to Google Cloud for processing but are not used to train their models (via paid/enterprise endpoints).</li>
            </ul>
        </section>
        
        <section>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">2. Third-Party Services</h3>
            <p>We use the following trusted providers:</p>
            <div className="grid grid-cols-1 gap-2 mt-2">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                    <strong>Google Gemini:</strong> For AI generation (OCR, Chat, Quizzes).
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                    <strong>Supabase:</strong> For secure user authentication and optional profile sync.
                </div>
            </div>
        </section>
        
        <section>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">3. Device Permissions</h3>
            <ul className="list-disc list-inside ml-2 mt-2 space-y-1">
                <li><strong>Camera:</strong> Used only for scanning notes or setting a profile picture.</li>
                <li><strong>Storage:</strong> Used for exporting backups or saving generated PDFs.</li>
            </ul>
        </section>

        <section>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">4. Your Rights</h3>
            <p>You can export your data or delete your account at any time via the Settings menu. Deleting your account permanently removes your profile from Supabase.</p>
        </section>
    </div>
);

export const TermsView: React.FC<LegalViewProps> = ({ themeColor }) => (
    <div className="px-1.5">
        <div className="px-2.5">
            <Header title="Terms of Service" themeColor={themeColor} />
        </div>
        <Card className="p-6 overflow-y-auto max-h-[80vh] shadow-sm">
            <TermsContent />
        </Card>
    </div>
);

export const PrivacyView: React.FC<LegalViewProps> = ({ themeColor }) => (
    <div className="px-1.5">
        <div className="px-2.5">
            <Header title="Privacy Policy" themeColor={themeColor} />
        </div>
        <Card className="p-6 overflow-y-auto max-h-[80vh] shadow-sm">
            <PrivacyContent />
        </Card>
    </div>
);

export const LicensesView: React.FC<LegalViewProps> = ({ themeColor }) => (
    <div className="px-1.5">
        <div className="px-2.5">
            <Header title="Open Source Licenses" themeColor={themeColor} />
            <p className="mb-4 text-sm text-gray-500">Engram is built using the following open source software:</p>
        </div>
        <div className="space-y-3">
             <Card className="p-4">
                <h3 className="font-bold text-gray-900 dark:text-white">React</h3>
                <p className="text-xs text-gray-500 mt-1 mb-2">MIT License. Copyright (c) Meta Platforms, Inc.</p>
                <p className="text-[10px] text-gray-400">Permission is hereby granted, free of charge, to any person obtaining a copy of this software...</p>
            </Card>
            <Card className="p-4">
                <h3 className="font-bold text-gray-900 dark:text-white">Lucide React</h3>
                <p className="text-xs text-gray-500 mt-1 mb-2">ISC License. Copyright (c) 2022 Lucide Contributors.</p>
                <p className="text-[10px] text-gray-400">Permission to use, copy, modify, and/or distribute this software for any purpose...</p>
            </Card>
             <Card className="p-4">
                <h3 className="font-bold text-gray-900 dark:text-white">Google GenAI SDK</h3>
                <p className="text-xs text-gray-500 mt-1 mb-2">Apache-2.0 License. Copyright 2024 Google LLC.</p>
                <p className="text-[10px] text-gray-400">Licensed under the Apache License, Version 2.0 (the "License")...</p>
            </Card>
            <Card className="p-4">
                <h3 className="font-bold text-gray-900 dark:text-white">Tailwind CSS</h3>
                <p className="text-xs text-gray-500 mt-1 mb-2">MIT License. Copyright (c) Tailwind Labs, Inc.</p>
                <p className="text-[10px] text-gray-400">Permission is hereby granted, free of charge, to any person obtaining a copy...</p>
            </Card>
        </div>
    </div>
);