
import { GoogleGenAI, Schema } from "@google/genai";

// -- USAGE LIMITS --
const FREE_LIMIT = 50; // Monthly
const USAGE_KEY = 'engram_usage_stats';

export const getUsageStats = () => {
    try {
        const customKey = localStorage.getItem('engram_custom_api_key');
        if (customKey) return { source: 'custom', count: 0, limit: Infinity };

        const raw = localStorage.getItem(USAGE_KEY);
        const stats = raw ? JSON.parse(raw) : { count: 0, month: new Date().getMonth() };
        
        // Reset if new month
        const currentMonth = new Date().getMonth();
        if (stats.month !== currentMonth) {
            return { count: 0, month: currentMonth, limit: FREE_LIMIT };
        }
        
        return { ...stats, limit: FREE_LIMIT };
    } catch {
        return { count: 0, limit: FREE_LIMIT, month: new Date().getMonth() };
    }
};

export const checkUsageLimit = () => {
    const stats = getUsageStats();
    if (stats.source === 'custom') return;
    if (stats.count >= stats.limit) {
        const error = new Error("Monthly AI quota reached (Free Tier). Add a custom API Key in Settings for unlimited access.");
        error.name = 'UsageLimitError';
        throw error;
    }
};

export const incrementUsage = () => {
    const stats = getUsageStats();
    if (stats.source === 'custom') return;
    
    stats.count++;
    localStorage.setItem(USAGE_KEY, JSON.stringify(stats));
};

// -- CLIENT FACTORY --
export const getAiClient = () => {
    const customKey = localStorage.getItem('engram_custom_api_key');
    
    // Priority: 1. Custom Key (LocalStorage) -> 2. Vite Env Var -> 3. Process Env (Fallback)
    // Cast import.meta to unknown then to any to avoid TS error about 'env' property
    const envKey = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : undefined);
    const apiKey = customKey || envKey; 
    
    if (!apiKey) {
        throw new Error("No API Key available. Please configure a custom key in Settings.");
    }
    
    return { 
        client: new GoogleGenAI({ apiKey }),
        isCustom: !!customKey
    };
};

export const validateApiKey = async (key: string): Promise<boolean> => {
    try {
        const ai = new GoogleGenAI({ apiKey: key });
        await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: 'test',
        });
        return true;
    } catch (e) {
        console.error("Key Validation Failed", e);
        return false;
    }
};

// -- CONFIG HELPERS --
export const getFeatureConfig = (featureId: string) => {
    try {
        const all = JSON.parse(localStorage.getItem('engram_ai_preferences') || '{}');
        return all[featureId] || {};
    } catch {
        return {};
    }
};

export const truncateContext = (text: string, maxLength: number = 10000) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...[truncated]";
};

// -- GENERIC CALLER --
export const callGeminiApiWithRetry = async (
    prompt: string,
    systemInstruction: string,
    responseSchema: Schema | null,
    images: { base64: string, mimeType: string }[] | null = null,
    tools: unknown[] | null = null,
    retries: number = 3,
    modelName: string = 'gemini-3-flash-preview',
    featureId: string = 'general'
): Promise<unknown> => {
    checkUsageLimit();
    const { client } = getAiClient();

    // Prepare contents
    let contents: string | { parts: { inlineData?: { mimeType: string, data: string }, text?: string }[] } = prompt;
    if (images && images.length > 0) {
        const parts: { inlineData?: { mimeType: string, data: string }, text?: string }[] = images.map(img => ({
            inlineData: { mimeType: img.mimeType, data: img.base64 }
        }));
        parts.push({ text: prompt });
        contents = { parts };
    }

    const config: Record<string, unknown> = {
        systemInstruction,
    };

    if (responseSchema) {
        config.responseMimeType = "application/json";
        config.responseSchema = responseSchema;
    }
    
    if (tools) {
        config.tools = tools;
    }

    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await client.models.generateContent({
                model: modelName,
                contents,
                config
            });
            
            incrementUsage(featureId);
            
            if (responseSchema) {
                const text = response.text || "{}";
                // Basic cleanup for JSON
                const jsonStr = text.replace(/```json|```/g, '').trim();
                return JSON.parse(jsonStr);
            }
            return response;
        } catch (e: unknown) {
            console.warn(`Attempt ${i + 1} failed`, e);
            lastError = e;
            if (e && typeof e === 'object' && (e as Error).name === 'UsageLimitError') throw e; // Don't retry quota errors
            if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 429) {
                // Rate limit, wait
                await new Promise(r => setTimeout(r, 2000 * (i + 1)));
                continue;
            }
            // For other errors, maybe retry
        }
    }
    throw lastError;
};

// -- FEATURE FUNCTIONS --

export const generatePodcastScript = async (
    topicName: string, 
    context: string, 
    language: 'English' | 'Hinglish', 
    durationMinutes: number,
    featureId: string = 'podcast'
): Promise<string> => {
    const prefs = getFeatureConfig(featureId);
    let model = 'gemini-3-flash-preview';
    if (prefs.model === 'pro') model = 'gemini-3.1-pro-preview';

    // Option A, B, D & 3: Hardened Technical Prompt
    const prompt = `You are an expert Engineering Professor and Podcast Producer. 
    Generate a comprehensive, deep-dive podcast script about "${topicName}".
    
    CONTEXT DATA:
    ${truncateContext(context, 20000)}
    
    CORE REQUIREMENTS:
    1. CHECKLIST VERIFICATION: First, identify every critical technical term, component, and principle in the context. You MUST explain every single one of these.
    2. PROPORTIONAL DEPTH: Adjust the depth based on the context provided. If the context is short (2-3 pages), keep the podcast concise and high-impact (around 2-4 mins). If it's long (7-8 pages), go into extreme detail (8-12 mins). Do NOT add "fluff" or repetitive banter just to hit a time limit.
    3. LECTURE STRUCTURE:
       - Introduction: High-level overview and real-world importance.
       - Component Breakdown: Detailed look at every part/term identified.
       - Working Principle: Step-by-step logic of how it works.
       - Technical Nuances: Mathematical derivations, efficiency, or engineering challenges.
       - Summary: Quick recap of "Must-Remember" points.
    4. SMART COMPRESSION: Use "Fast-Paced Insight" mode. 95% of the content must be high-value technical explanation.
    
    FORMATTING:
    - Language: ${language}. 
      * If Hinglish: This MUST feel like a natural conversation between two Indian engineering students. Use a mix of Hindi and English (Code-Switching). Use Hindi for the "connective tissue" (narrative, logic, reactions, analogies) but keep ALL technical terms, definitions, and core concepts in English. Avoid pure translation; make it sound like a real campus discussion.
    - Target Duration: Approximately ${durationMinutes} minutes. Respect this as a maximum; if the content is explained perfectly in less time, prioritize quality over length.
    - Speakers: Kittu (Male, enthusiastic professor-type) and Kashish (Female, insightful and detail-oriented).
    - Output: Just the script, with speaker names like "Kittu:" and "Kashish:".`;

    const response = await callGeminiApiWithRetry(prompt, "You are a technical podcast script writer for engineering students.", null, null, null, 2, model, featureId);
    return response.text || "";
};

export const generatePodcastAudio = async (script: string, featureId: string = 'podcast'): Promise<string> => {
    checkUsageLimit();
    const { client } = getAiClient();
    
    // Configured for Multi-Speaker (Kittu & Kashish)
    // Using flash preview tts as per request guidelines for tts
    const response = await client.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: { parts: [{ text: script }] },
        config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
                multiSpeakerVoiceConfig: {
                    speakerVoiceConfigs: [
                        {
                            speaker: 'Kittu',
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } // Deep/Male
                        },
                        {
                            speaker: 'Kashish',
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }   // Clear/Female
                        }
                    ]
                }
            },
        },
    });

    incrementUsage(featureId);
    
    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) throw new Error("No audio generated");
    
    return base64;
};

export const generateScoreAnalysis = async (name: string, score: number, level: number, studyLog: unknown[]) => {
    const prompt = `Analyze the study performance for ${name}. Score: ${score}, Level: ${level}.
    Topics count: ${studyLog.length}.
    Give a short, encouraging summary of their progress and one specific tip to improve.`;
    
    const response = await callGeminiApiWithRetry(prompt, "You are a friendly study coach.", null, null, null, 2, 'gemini-3-flash-preview', 'profile');
    return response.text;
};

export const chatWithNotes = async (history: { role: string, text: string }[], message: string, notes: string, subject: string, featureId: string) => {
    checkUsageLimit();
    const { client } = getAiClient();
    const prefs = getFeatureConfig(featureId);
    let model = 'gemini-3-flash-preview';
    if (prefs.model === 'pro') model = 'gemini-3.1-pro-preview';

    const systemInstruction = `You are a helpful tutor for ${subject}. 
    Base your answers on the following notes context, but you can add external knowledge if needed.
    Notes: ${truncateContext(notes, 20000)}
    ${prefs.persona ? `Persona: ${prefs.persona}` : ''}`;

    const chat = client.chats.create({
        model,
        config: { systemInstruction },
        history: history.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }))
    });

    const response = await chat.sendMessage({ message });
    incrementUsage(featureId);
    return response.text;
};

export const chatWithNotesStream = async (
    history: { role: string, text: string }[],
    message: string,
    notes: string,
    subject: string,
    featureId: string,
    onChunk: (text: string) => void
) => {
    checkUsageLimit();
    const { client } = getAiClient();
    const prefs = getFeatureConfig(featureId);
    let model = 'gemini-3-flash-preview';
    if (prefs.model === 'pro') model = 'gemini-3.1-pro-preview';

    const systemInstruction = `You are a helpful AI tutor for ${subject}.
    Base your answers on the following notes context, but you can add external knowledge if needed.
    
    FORMATTING RULES:
    - Use **Markdown** for formatting.
    - Use **Markdown Tables** for structured data, comparisons, or lists.
    - Use **LaTeX** for math equations (wrap in $ for inline or $$ for block).
    - Be concise, clear, and engaging.
    - If a diagram is requested, describe it clearly in text or use ASCII art if simple.
    
    Notes: ${truncateContext(notes, 20000)}
    ${prefs.persona ? `Persona: ${prefs.persona}` : ''}`;

    const chat = client.chats.create({
        model,
        config: { systemInstruction },
        history: history.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }))
    });

    const result = await chat.sendMessageStream({ message });
    incrementUsage(featureId);

    for await (const chunk of result) {
        const text = chunk.text;
        if (text) onChunk(text);
    }
};

export const detectMathStyle = (persona: string | undefined): string | null => {
    if (!persona) return null;
    if (persona.toLowerCase().includes('latex')) return 'latex';
    return null;
};
