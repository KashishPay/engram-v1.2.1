
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const isNative = Capacitor.isNativePlatform();

export const triggerHaptic = {
    // Light tick (for tabs, toggles, small interactions)
    selection: async () => {
        if (isNative) {
            // Only fire selectionChanged for a crisp single tick. 
            // Calling start/end in sequence is unnecessary for simple taps.
            await Haptics.selectionChanged();
        } else {
            // Web fallback (very subtle)
            if (navigator.vibrate) navigator.vibrate(5);
        }
    },

    // Physical thud (for buttons, start/stop, confirm)
    impact: async (style: 'Light' | 'Medium' | 'Heavy' = 'Medium') => {
        if (isNative) {
            const styles = {
                Light: ImpactStyle.Light,
                Medium: ImpactStyle.Medium,
                Heavy: ImpactStyle.Heavy
            };
            await Haptics.impact({ style: styles[style] });
        } else {
            // Web fallback
            const durations = { Light: 10, Medium: 20, Heavy: 40 };
            if (navigator.vibrate) navigator.vibrate(durations[style]);
        }
    },

    // Status notification (success, error, warning)
    notification: async (type: 'Success' | 'Warning' | 'Error') => {
        if (isNative) {
            const types = {
                Success: NotificationType.Success,
                Warning: NotificationType.Warning,
                Error: NotificationType.Error
            };
            await Haptics.notification({ type: types[type] });
        } else {
            // Web fallback patterns
            if (navigator.vibrate) {
                if (type === 'Success') navigator.vibrate([30, 50, 30]);
                if (type === 'Warning') navigator.vibrate([50, 50, 50]);
                if (type === 'Error') navigator.vibrate([50, 100, 50, 100, 50]);
            }
        }
    }
};
