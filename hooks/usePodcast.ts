
import { useState, useRef, useEffect, useCallback } from 'react';
import { Topic } from '../types';
import { generatePodcastScript, generatePodcastAudio, getFeatureConfig } from '../services/gemini';
import { getAudioFromIDB, saveAudioToIDB } from '../services/storage';
import { createWavBlob } from '../utils/audio';
import { ensureAudioContext } from '../utils/audioCue';
import { requestWakeLock, releaseWakeLock } from '../utils/wakeLock';
import { showLocalNotification, requestNotificationPermission } from '../utils/notifications';

export interface PodcastState {
    currentTopic: Topic | null;
    isPlaying: boolean;
    audioSrc: string | null;
    loading: boolean;
    status: string;
    currentTime: number;
    duration: number;
    generatedScript: string | null;
    estimatedDuration: number | null;
    downloadingIds: string[];
    error: string | null; // Added Error State
    generationStartTime: number | null; // Added for robust timer
}

export interface PodcastControls {
    playTopic: (topic: Topic, onUpdateTopic?: (t: Topic) => void) => Promise<void>;
    togglePlay: () => void;
    seek: (time: number) => void;
    skip: (seconds: number) => void;
    reset: () => void;
    downloadTopic: (topic: Topic, context: string, duration: number, language: string, onSuccess?: (audioData: Blob | string, script: string) => void) => Promise<void>;
}

export const usePodcast = (defaultLanguage: 'English' | 'Hinglish' = 'English') => {
    const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioSrc, setAudioSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [generatedScript, setGeneratedScript] = useState<string | null>(null);
    const [estimatedDuration, setEstimatedDuration] = useState<number | null>(null);
    const [generationStartTime, setGenerationStartTime] = useState<number | null>(null); // State for timer persistence
    const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);
    
    // Track if the current load operation is intended to auto-play (triggered by Play button)
    const shouldAutoPlayRef = useRef(false);

    const reset = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        setAudioSrc(null);
        setCurrentTopic(null);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setGeneratedScript(null);
        setLoading(false);
        setEstimatedDuration(null);
        setGenerationStartTime(null);
        setError(null);
        shouldAutoPlayRef.current = false;
        releaseWakeLock(); // Release lock on reset
    }, []);

    const togglePlay = useCallback(() => {
        if (!audioRef.current || !audioSrc) return;
        
        // Ensure context is running (Mobile wake)
        ensureAudioContext();

        if (isPlaying) {
            audioRef.current.pause();
            releaseWakeLock(); // Release lock when paused
        } else {
            audioRef.current.play().catch(e => {
                console.warn("Play interrupted", e);
                setIsPlaying(false);
            });
            requestWakeLock(); // Request lock when playing
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying, audioSrc]);

    const seek = useCallback((time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    }, []);

    const skip = useCallback((seconds: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime += seconds;
        }
    }, []);

    const loadAudioBlob = (audioData: Blob | string, script?: string) => {
        let blob: Blob;
        if (typeof audioData === 'string') {
            blob = createWavBlob(atob(audioData));
        } else {
            blob = audioData;
        }
        const url = URL.createObjectURL(blob);
        setAudioSrc(url);
        if (script) setGeneratedScript(script);
        setLoading(false);
        setEstimatedDuration(null);
        setGenerationStartTime(null);
        
        // Status update - Playback handled by effect
        setStatus('Ready to Play'); 
    };

    const calculateDurations = (topic: Topic, isRecap: boolean) => {
        const charCount = (topic.shortNotes || '').length;
        
        // Target Audio Duration (minutes)
        let targetDuration = 5;
        if (isRecap) {
            // Recaps are usually longer but still proportional
            targetDuration = Math.min(25, Math.max(10, Math.floor(charCount / 800)));
        } else {
            // Deep dives: Scale between 2 and 15 minutes based on content
            // Roughly 1 minute per 1200 characters of notes, min 2 mins
            targetDuration = Math.min(15, Math.max(2, Math.floor(charCount / 1200)));
        }

        // Estimated Generation Wait Time (seconds)
        // Base overhead + proportional time for script and TTS
        const estimatedWait = 45 + (targetDuration * 25);

        return { targetDuration, estimatedWait };
    };

    const playTopic = useCallback(async (topic: Topic, onUpdateTopic?: (t: Topic) => void) => {
        if (loading) return;
        
        // Mobile Autoplay Policy: Prime the context and element immediately
        ensureAudioContext();
        if (audioRef.current) {
            // Loading an empty source or calling load() signals intent to the browser
            audioRef.current.load();
        }
        shouldAutoPlayRef.current = true;

        // If already loaded, just toggle
        if (currentTopic?.id === topic.id && audioSrc) {
            if (!isPlaying) togglePlay();
            return;
        }

        // Init State
        setCurrentTopic(topic);
        setLoading(true);
        setIsPlaying(false);
        setAudioSrc(null);
        setCurrentTime(0);
        setDuration(0);
        setGeneratedScript(null);
        setEstimatedDuration(null);
        setError(null);
        setGenerationStartTime(Date.now()); // Set start time
        requestWakeLock(); // Pre-emptive lock for generation/loading phase

        // 1. Check In-Memory (Topic Object)
        if (topic.podcastAudio) {
            setStatus('Loading audio...');
            loadAudioBlob(topic.podcastAudio, topic.podcastScript);
            return;
        }

        // 2. Check IDB (Offline Cache)
        setStatus('Checking storage...');
        try {
            const savedAudio = await getAudioFromIDB(topic.id);
            if (savedAudio) {
                loadAudioBlob(savedAudio, topic.podcastScript);
                return;
            }
        } catch (e) {
            console.error("Storage check failed", e);
        }

        // 3. Generate Fresh
        // Check user preferences for auto-generate
        const prefs = getFeatureConfig('podcast');
        // By default, allow generation. If explicit 'autoGenerateOnNewTopic' is false, user might want a confirm
        // but for now, we treat clicking play as intent.
        
        const isRecap = topic.id.startsWith('subject-recap');
        setStatus(isRecap ? 'Synthesizing Subject Recap...' : 'Generating Deep Dive...');
        
        const { targetDuration, estimatedWait } = calculateDurations(topic, isRecap);
        setEstimatedDuration(estimatedWait);

        try {
            const context = isRecap 
                ? topic.shortNotes 
                : `Topic: ${topic.topicName}\n${topic.shortNotes}`;
            
            // Script Gen - FeatureID: 'podcast'
            const script = await generatePodcastScript(topic.topicName, context, defaultLanguage, targetDuration, 'podcast');
            setGeneratedScript(script);
            
            // Audio Gen - FeatureID: 'podcast'
            setStatus('Synthesizing Voices...');
            const audioData = await generatePodcastAudio(script, 'podcast');
            
            // Success Handling
            loadAudioBlob(audioData, script);
            
            // Cache in background
            saveAudioToIDB(topic.id, audioData).catch(e => console.warn("Failed to cache audio", e));
            
            // Update topic state if provided (non-recap)
            if (onUpdateTopic && !topic.id.startsWith('subject-recap')) {
                onUpdateTopic({
                    ...topic,
                    podcastScript: script,
                    hasSavedAudio: true
                });
            }

        } catch (e: any) {
            console.error("[Podcast] Generation Error:", e);
            setError(e.message || "Failed to generate podcast.");
            setStatus('Error');
            setLoading(false);
            setEstimatedDuration(null);
            setGenerationStartTime(null);
            shouldAutoPlayRef.current = false;
            releaseWakeLock(); // Release lock on error
        }
    }, [currentTopic, audioSrc, isPlaying, loading, defaultLanguage, togglePlay]);

    const downloadTopic = useCallback(async (topic: Topic, context: string, durationOverride: number, language: string, onSuccess?: (audioData: Blob | string, script: string) => void) => {
        if (downloadingIds.includes(topic.id)) return;
        
        const isRecap = topic.id.startsWith('subject-recap');
        const { targetDuration } = calculateDurations(topic, isRecap);
        const finalDuration = durationOverride || targetDuration;

        setDownloadingIds(prev => [...prev, topic.id]);
        requestWakeLock(); // Lock screen during download

        // Ensure permissions are granted before starting
        await requestNotificationPermission();

        // Use a fixed timestamp ID for this operation to allow updating
        const notifId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);

        // 1. Show "Ongoing" Notification
        await showLocalNotification("Generating Podcast", {
            body: `Creating audio for "${topic.topicName}". This may take a few minutes.`,
            tag: 'podcast-download',
            id: notifId,
            ongoing: true
        });
        
        try {
            const script = await generatePodcastScript(topic.topicName, context, language as any, finalDuration, 'podcast');
            const audioData = await generatePodcastAudio(script, 'podcast');
            
            if (audioData) {
                await saveAudioToIDB(topic.id, audioData);
                
                // 2. Update Notification to Success (Removes ongoing)
                await showLocalNotification("Podcast Ready", {
                    body: `Audio for "${topic.topicName}" is ready to listen.`,
                    tag: 'podcast-download',
                    id: notifId,
                    ongoing: false
                });

                if (onSuccess) onSuccess(audioData, script);
            }
        } catch (e: any) {
            console.error("Download failed", e);
            
            // 3. Update Notification to Error (Removes ongoing)
            await showLocalNotification("Download Failed", {
                body: `Could not generate podcast for "${topic.topicName}".`,
                tag: 'podcast-download',
                id: notifId,
                ongoing: false
            });

            alert(`Download failed: ${e.message}`);
        } finally {
            setDownloadingIds(prev => prev.filter(id => id !== topic.id));
            releaseWakeLock();
        }
    }, [downloadingIds]);

    const onTimeUpdate = () => {
        if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
    };
    
    const onLoadedMetadata = () => {
        if (audioRef.current) setDuration(audioRef.current.duration);
    };

    const onEnded = () => {
        setIsPlaying(false);
        releaseWakeLock(); // Release lock on finish
    };

    // AUTO-PLAY LOGIC
    // Triggers when audioSrc is set AND we have flagged an auto-play intent
    useEffect(() => {
        if (audioSrc && shouldAutoPlayRef.current && audioRef.current) {
            console.debug("[Podcast] Auto-playing generated/loaded content...");
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        setIsPlaying(true);
                        requestWakeLock(); // Ensure lock is active
                    })
                    .catch(error => {
                        console.warn("[Podcast] Auto-play prevented:", error);
                        setIsPlaying(false);
                        releaseWakeLock(); // Release if autoplay blocked
                        // Reset ref so we don't keep trying
                    });
            }
            shouldAutoPlayRef.current = false;
        }
    }, [audioSrc]);

    // --- MEDIA SESSION API (Notification Bar Controls) ---
    useEffect(() => {
        if (!('mediaSession' in navigator) || !currentTopic) return;

        // 1. Update Metadata
        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentTopic.topicName,
            artist: 'Deep Dive • Kittu & Kashish',
            album: currentTopic.subject,
            artwork: [
                { src: 'https://engram-space.vercel.app/brand/engram_logo/engram_logo_192.png', sizes: '192x192', type: 'image/png' },
                { src: 'https://engram-space.vercel.app/brand/engram_logo/engram_logo_512.png', sizes: '512x512', type: 'image/png' },
            ]
        });

        // 2. Set Action Handlers
        const handlers: [MediaSessionAction, () => void][] = [
            ['play', () => { togglePlay(); }],
            ['pause', () => { togglePlay(); }],
            ['seekbackward', () => { skip(-10); }],
            ['seekforward', () => { skip(10); }],
            ['stop', () => { reset(); }]
        ];

        for (const [action, handler] of handlers) {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (error) {
                console.warn(`MediaSession action "${action}" not supported.`);
            }
        }

        return () => {
            // Cleanup handlers
            for (const [action] of handlers) {
                try {
                    navigator.mediaSession.setActionHandler(action, null);
                } catch (e) {}
            }
        };
    }, [currentTopic, togglePlay, skip, reset]);

    // Update Playback State in MediaSession
    useEffect(() => {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }, [isPlaying]);

    // Update Position State in MediaSession
    useEffect(() => {
        if (!('mediaSession' in navigator) || !audioRef.current || isNaN(duration) || duration <= 0) return;
        
        try {
            navigator.mediaSession.setPositionState({
                duration: duration,
                playbackRate: audioRef.current.playbackRate || 1,
                position: currentTime
            });
        } catch (e) {
            // Some browsers/versions might fail on setPositionState if values are inconsistent
        }
    }, [currentTime, duration, isPlaying]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            releaseWakeLock();
        };
    }, []);

    return {
        state: { currentTopic, isPlaying, audioSrc, loading, status, currentTime, duration, generatedScript, estimatedDuration, downloadingIds, error, generationStartTime },
        controls: { playTopic, togglePlay, seek, skip, reset, downloadTopic },
        audioRef,
        audioProps: {
            onTimeUpdate,
            onLoadedMetadata,
            onEnded
        }
    };
};
