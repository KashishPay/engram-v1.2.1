
let audioCtx: AudioContext | null = null;

export const ensureAudioContext = () => {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    } catch (e) {
        console.warn("AudioContext setup failed", e);
    }
};

export const playCompletionCue = async () => {
    // 1. Vibration
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }

    // 2. Beep
    if (!audioCtx) return;
    
    try {
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        // A5 (880Hz) - Sharp, clear beep
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        
        // Envelope: Fast attack, quick decay
        gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.1, audioCtx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
        
        // Cleanup
        setTimeout(() => {
            osc.disconnect();
            gain.disconnect();
        }, 600);
        
    } catch (e) {
        console.error("Audio cue failed", e);
    }
};
