
import { Topic } from '../types';

interface CalendarAggregates {
    version: number;
    updatedAt: number;
    // Map: "YYYY-MM-DD" -> total minutes
    dailyTotalMinutes: Record<string, number>; 
    // Map: "YYYY-MM-DD" -> topicId -> minutes
    dailyTopicMinutes: Record<string, Record<string, number>>; 
    // Map: "YYYY-MM-DD" -> subjectId -> minutes
    dailySubjectMinutes: Record<string, Record<string, number>>; 
}

const CURRENT_VERSION = 1;

export const AnalyticsService = {
    getKey: (userId: string) => `engramCalendarAgg_${userId}`,

    getAggregates: (userId: string): CalendarAggregates | null => {
        try {
            const raw = localStorage.getItem(AnalyticsService.getKey(userId));
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    },

    saveAggregates: (userId: string, data: CalendarAggregates) => {
        localStorage.setItem(AnalyticsService.getKey(userId), JSON.stringify(data));
    },

    /**
     * Incrementally updates aggregates. 
     * Call this whenever a session is logged.
     */
    trackSession: (userId: string, topicId: string, subjectId: string, date: string, minutes: number) => {
        if (!userId || !topicId) return;

        let agg = AnalyticsService.getAggregates(userId);
        
        // If missing or version mismatch, initialize fresh structure.
        // We do NOT rebuild here to avoid performance hit during write.
        // Rebuild should be triggered on app load if needed.
        if (!agg || agg.version !== CURRENT_VERSION) {
            agg = {
                version: CURRENT_VERSION,
                updatedAt: Date.now(),
                dailyTotalMinutes: {},
                dailyTopicMinutes: {},
                dailySubjectMinutes: {}
            };
        }

        agg.updatedAt = Date.now();

        // 1. Daily Total
        agg.dailyTotalMinutes[date] = (agg.dailyTotalMinutes[date] || 0) + minutes;

        // 2. Topic Total
        if (!agg.dailyTopicMinutes[date]) agg.dailyTopicMinutes[date] = {};
        agg.dailyTopicMinutes[date][topicId] = (agg.dailyTopicMinutes[date][topicId] || 0) + minutes;

        // 3. Subject Total
        if (subjectId) {
            if (!agg.dailySubjectMinutes[date]) agg.dailySubjectMinutes[date] = {};
            agg.dailySubjectMinutes[date][subjectId] = (agg.dailySubjectMinutes[date][subjectId] || 0) + minutes;
        }

        AnalyticsService.saveAggregates(userId, agg);
    },

    trackEvent: (userId: string, event: string, payload?: any) => {
        // Minimal telemetry hook - prints to debug for now
        // Can be extended to send to an analytics endpoint
        if (process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost') {
            console.debug(`[Analytics] Event: ${event}`, { userId, ...payload });
        }
    },

    /**
     * Full scan of studyLog to rebuild aggregates.
     * Use this for migration or data integrity repair.
     */
    rebuild: (userId: string, studyLog: Topic[]) => {
        console.time(`[Analytics] Rebuild ${userId}`);
        const agg: CalendarAggregates = {
            version: CURRENT_VERSION,
            updatedAt: Date.now(),
            dailyTotalMinutes: {},
            dailyTopicMinutes: {},
            dailySubjectMinutes: {}
        };

        studyLog.forEach(topic => {
            if (topic.focusLogs && Array.isArray(topic.focusLogs)) {
                topic.focusLogs.forEach(log => {
                    const date = log.date; // YYYY-MM-DD
                    const min = log.minutes;

                    agg.dailyTotalMinutes[date] = (agg.dailyTotalMinutes[date] || 0) + min;

                    if (!agg.dailyTopicMinutes[date]) agg.dailyTopicMinutes[date] = {};
                    agg.dailyTopicMinutes[date][topic.id] = (agg.dailyTopicMinutes[date][topic.id] || 0) + min;

                    if (topic.subjectId) {
                        if (!agg.dailySubjectMinutes[date]) agg.dailySubjectMinutes[date] = {};
                        agg.dailySubjectMinutes[date][topic.subjectId] = (agg.dailySubjectMinutes[date][topic.subjectId] || 0) + min;
                    }
                });
            }
        });

        AnalyticsService.saveAggregates(userId, agg);
        console.timeEnd(`[Analytics] Rebuild ${userId}`);
        return agg;
    }
};
