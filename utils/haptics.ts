
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const isNative = Capacitor.isNativePlatform();

export const triggerHaptic = {
    // Light tick (for tabs, toggles, small interactions)
    selection: async () => {
        try {
            if (isNative) {
                if (Capacitor.getPlatform() === 'android') {
                    await Haptics.impact({ style: ImpactStyle.Light });
                } else {
                    await Haptics.selectionChanged();
                }
            } else {
                if (navigator.vibrate) navigator.vibrate(5);
            }
        } catch (e) {
            console.debug('Haptics failed:', e);
        }
    },

    // Physical thud (for buttons, start/stop, confirm)
    impact: async (style: 'Light' | 'Medium' | 'Heavy' = 'Medium') => {
        try {
            if (isNative) {
                const styles = {
                    Light: ImpactStyle.Light,
                    Medium: ImpactStyle.Medium,
                    Heavy: ImpactStyle.Heavy
                };
                await Haptics.impact({ style: styles[style] });
            } else {
                const durations = { Light: 10, Medium: 20, Heavy: 40 };
                if (navigator.vibrate) navigator.vibrate(durations[style]);
            }
        } catch (e) {
            console.debug('Haptics failed:', e);
        }
    },

    // Status notification (success, error, warning)
    notification: async (type: 'Success' | 'Warning' | 'Error') => {
        try {
            if (isNative) {
                const types = {
                    Success: NotificationType.Success,
                    Warning: NotificationType.Warning,
                    Error: NotificationType.Error
                };
                await Haptics.notification({ type: types[type] });
            } else {
                if (navigator.vibrate) {
                    if (type === 'Success') navigator.vibrate([30, 50, 30]);
                    if (type === 'Warning') navigator.vibrate([50, 50, 50]);
                    if (type === 'Error') navigator.vibrate([50, 100, 50, 100, 50]);
                }
            }
        } catch (e) {
            console.debug('Haptics failed:', e);
        }
    }
};
