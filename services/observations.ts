
import { DailyObservation } from '../types';

export const ObservationsService = {
    getKey: (userId: string) => `engram_observations_${userId}`,

    getAll: (userId: string): DailyObservation[] => {
        try {
            const raw = localStorage.getItem(ObservationsService.getKey(userId));
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    },

    getByDate: (userId: string, dateISO: string): DailyObservation | undefined => {
        const all = ObservationsService.getAll(userId);
        return all.find(obs => obs.dateISO === dateISO);
    },

    save: (userId: string, observation: DailyObservation): void => {
        const all = ObservationsService.getAll(userId);
        const index = all.findIndex(obs => obs.dateISO === observation.dateISO);
        
        if (index >= 0) {
            all[index] = { ...observation, updatedAt: Date.now() };
        } else {
            all.push({ ...observation, createdAt: Date.now(), updatedAt: Date.now() });
        }
        
        localStorage.setItem(ObservationsService.getKey(userId), JSON.stringify(all));
    },

    saveAll: (userId: string, observations: DailyObservation[]): void => {
        localStorage.setItem(ObservationsService.getKey(userId), JSON.stringify(observations));
    },

    delete: (userId: string, dateISO: string): void => {
        const all = ObservationsService.getAll(userId);
        const filtered = all.filter(obs => obs.dateISO !== dateISO);
        localStorage.setItem(ObservationsService.getKey(userId), JSON.stringify(filtered));
    }
};
