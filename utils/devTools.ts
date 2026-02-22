
import { Topic, Subject, FocusSession } from '../types';
import { saveTopicBodyToIDB, deleteTopicBodyFromIDB } from '../services/storage';
import { AnalyticsService } from '../services/analytics';

console.debug("[DevTools] module loaded", window.location.href);

export const attachDevTools = (userId: string, reloadApp: () => void) => {
    console.debug("[DevTools] attach called", { userId, href: window.location.href });

    const seeder = async (count: number = 500, options?: { seedSessions?: boolean, days?: number }) => {
        const seedSessions = options?.seedSessions ?? true;
        const daysBack = options?.days ?? 30;

        console.log(`%c [Dev] Seeding ${count} topics for ${userId}... (Sessions: ${seedSessions})`, 'background: #333; color: #00ffff');
        const startTime = performance.now();
        
        // Define fixed subjects for consistent seeding
        const subjects: Subject[] = [
            { name: 'Network Theory', id: 'network-theory' },
            { name: 'Control Systems', id: 'control-systems' },
            { name: 'Analog Electronics', id: 'analog-electronics' },
            { name: 'Signals & Systems', id: 'signals-systems' },
            { name: 'Electromagnetics', id: 'electromagnetics' }
        ];

        // Generate ~15KB of text
        const filler = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(100); 
        
        const newTopics: Topic[] = [];
        const promises: Promise<void>[] = [];

        // 1. Generate Topics
        for (let i = 0; i < count; i++) {
            const id = `stress-${Date.now()}-${i}`;
            const subject = subjects[i % subjects.length];
            const timestamp = new Date().toISOString();
            
            // Synthetic Session Generation
            let focusLogs: FocusSession[] = [];
            let totalMinutes = 0;

            if (seedSessions) {
                // Generate 1-5 sessions per topic
                const numSessions = Math.floor(Math.random() * 5) + 1;
                for (let j = 0; j < numSessions; j++) {
                    const d = new Date();
                    // Random date within last N days
                    const daysAgo = Math.floor(Math.random() * daysBack);
                    d.setDate(d.getDate() - daysAgo);
                    const dateStr = d.toISOString().split('T')[0];
                    
                    // Random duration 15-90 mins
                    const minutes = Math.floor(Math.random() * 75) + 15;
                    
                    focusLogs.push({
                        date: dateStr,
                        minutes: minutes
                    });
                    totalMinutes += minutes;
                }
                // Sort logs chronologically
                focusLogs.sort((a, b) => a.date.localeCompare(b.date));
            } else {
                // Legacy behavior: random time metadata without logs
                totalMinutes = Math.floor(Math.random() * 120);
            }

            const topic: Topic = {
                id,
                subjectId: subject.id,
                subject: subject.name,
                topicName: `Stress Topic ${i + 1} (${subject.name})`,
                shortNotes: "", // Heavy body goes to IDB
                pomodoroTimeMinutes: totalMinutes,
                repetitions: [],
                focusLogs: focusLogs,
                createdAt: timestamp,
                hasSavedAudio: false
            };
            
            newTopics.push(topic);
            
            // Create a realistic heavy body with formatting
            const bodyContent = `# ${topic.topicName}\n\n**Created:** ${timestamp}\n\n## Key Concepts\n${filler}\n\n## Advanced Analysis\n${filler}\n${filler}`;
            
            // Write to IDB namespaced by user
            promises.push(saveTopicBodyToIDB(userId, id, bodyContent));
        }

        // 2. Sync Subjects Metadata
        const subjectsKey = `engramSubjects_${userId}`;
        const existingSubjectsStr = localStorage.getItem(subjectsKey);
        const existingSubjects: Subject[] = existingSubjectsStr ? JSON.parse(existingSubjectsStr) : [];
        
        // Merge seeded subjects into existing ones (prevent duplicates)
        const subjectMap = new Map<string, Subject>();
        existingSubjects.forEach(s => subjectMap.set(s.id, s));
        subjects.forEach(s => subjectMap.set(s.id, s));
        
        const updatedSubjects = Array.from(subjectMap.values());
        localStorage.setItem(subjectsKey, JSON.stringify(updatedSubjects));

        // 3. Save Data
        // Wait for all IDB writes
        await Promise.all(promises);
        
        // Load existing data to append
        const dataKey = `engramData_${userId}`;
        const currentDataStr = localStorage.getItem(dataKey);
        const currentData = currentDataStr ? JSON.parse(currentDataStr) : [];
        const mergedData = [...currentData, ...newTopics];

        // Write Index to LocalStorage
        localStorage.setItem(dataKey, JSON.stringify(mergedData));
        
        // 4. Rebuild Calendar Aggregates (if sessions seeded)
        if (seedSessions) {
            console.log("[Dev] Rebuilding calendar aggregates for seeded data...");
            AnalyticsService.rebuild(userId, mergedData);
        }

        const duration = performance.now() - startTime;
        console.log(`%c [Dev] Seed Complete: ${count} topics generated in ${duration.toFixed(0)}ms. Reloading...`, 'background: #333; color: #00ff00');
        
        reloadApp();
    };

    const wiper = async () => {
        console.log(`%c [Dev] Wiping stress data for ${userId}...`, 'background: #333; color: #ff0000');
        
        const dataKey = `engramData_${userId}`;
        const storedDataStr = localStorage.getItem(dataKey);
        if (!storedDataStr) {
            console.log("[Dev] No data found.");
            return;
        }

        const allTopics: Topic[] = JSON.parse(storedDataStr);
        const stressTopics = allTopics.filter(t => t.id.startsWith('stress-'));
        const realTopics = allTopics.filter(t => !t.id.startsWith('stress-'));

        if (stressTopics.length === 0) {
            console.log("[Dev] No stress topics found.");
            return;
        }

        const promises: Promise<void>[] = [];
        stressTopics.forEach(t => {
            promises.push(deleteTopicBodyFromIDB(userId, t.id));
        });

        await Promise.all(promises);

        localStorage.setItem(dataKey, JSON.stringify(realTopics));
        
        // Clean up aggregates so calendar doesn't show ghosts
        console.log("[Dev] Refreshing calendar aggregates...");
        AnalyticsService.rebuild(userId, realTopics);

        console.log(`%c [Dev] Wiped ${stressTopics.length} topics. Reloading...`, 'background: #333; color: #ff9900');
        reloadApp();
    };

    const rebuildAgg = () => {
        console.log("[Dev] Rebuilding Calendar Aggregates...");
        const dataKey = `engramData_${userId}`;
        const storedDataStr = localStorage.getItem(dataKey);
        if (!storedDataStr) {
            console.log("[Dev] No study data found to rebuild.");
            return;
        }
        const studyLog = JSON.parse(storedDataStr);
        AnalyticsService.rebuild(userId, studyLog);
        console.log("[Dev] Rebuild complete. Refresh calendar to see updates.");
        reloadApp();
    };
    
    // Attach to both window and globalThis for robustness
    (window as any).__engramSeed = seeder;
    (globalThis as any).__engramSeed = seeder;
    
    (window as any).__engramWipeStress = wiper;
    (globalThis as any).__engramWipeStress = wiper;

    (window as any).__engramRebuildCalendarAgg = rebuildAgg;
    (globalThis as any).__engramRebuildCalendarAgg = rebuildAgg;

    console.debug("[DevTools] Methods attached: __engramSeed(count, {seedSessions, days}), __engramWipeStress(), __engramRebuildCalendarAgg()");
    console.log(`%c [DevTools] Active.\nRun window.__engramSeed(50) to generate data with history.\nRun window.__engramWipeStress() to clean up.`, 'color: lime; background: #222; padding: 2px 4px; border-radius: 4px;');
};
