import { getAiClient, checkUsageLimit, incrementUsage } from './gemini';
import { Type, Schema } from "@google/genai";
import { jsonrepair } from 'jsonrepair';

export interface TestSeriesQuestion {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
}

const safeParseJSON = (text: string) => {
    try {
        // Strip out thinking process from reasoning models
        const textWithoutThink = text.replace(/<think>[\s\S]*?<\/think>/g, '');
        // Find the first '[' and last ']' to extract array if it's wrapped in markdown
        const match = textWithoutThink.match(/\[[\s\S]*\]/);
        const jsonString = match ? match[0] : textWithoutThink;
        try {
            return JSON.parse(jsonString);
        } catch {
            // Fallback to jsonrepair for truncated or malformed JSON
            return JSON.parse(jsonrepair(jsonString));
        }
    } catch {
        console.error("JSON Repair failed");
        throw new Error("Unable to parse the generated response.");
    }
};

export const fetchExamSubjects = async (exam: string, stream: string, language: string = "English"): Promise<string[]> => {
    checkUsageLimit();
    const { client, isCustom } = getAiClient();
    
    // ...

    const languageStr = language !== 'English' ? `\nReturn the names of the subjects translated to the requested language: ${language}.` : '';

    const prompt = `You are an expert tutor and curriculum designer. 
List the core subjects/topics for the following competitive exam and stream.
Exam: ${exam}
Stream/Branch: ${stream}${languageStr}

Return ONLY a JSON array of strings representing the subjects. Keep the subject names concise and standard.`;

    const responseSchema: Schema = {
        type: Type.ARRAY,
        items: { type: Type.STRING }
    };

    try {
        const response = await client.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.2
            }
        });

        incrementUsage();
        const text = response.text;
        if (!text) throw new Error("Empty response from Gemini");
        
        const subjects = safeParseJSON(text);
        return Array.isArray(subjects) ? subjects : [];
    } catch (error) {
        console.error("Failed to fetch exam subjects:", error);
        throw error;
    }
};

export const generateExamQuiz = async (
    exam: string, 
    stream: string, 
    subject: string, 
    difficulty: string, 
    numQuestions: number, 
    pastQuestionsContext: string[],
    specificTopics?: string,
    language: string = "English"
): Promise<TestSeriesQuestion[]> => {
    checkUsageLimit();
        const { client, isCustom } = getAiClient();

    const pastContextStr = pastQuestionsContext.length > 0 
        ? `\nIMPORTANT: Do NOT generate questions that are identical or highly similar to these past questions:\n${pastQuestionsContext.slice(-20).map((q, i) => `${i+1}. ${q}`).join('\n')}`
        : '';

    const specificTopicsStr = specificTopics && specificTopics.trim().length > 0
        ? `\nIMPORTANT: The user has requested to ONLY test the following specific topics: "${specificTopics}". Ensure ALL questions strictly focus on these topics.`
        : '';

    let languageStr = '';
    const languageKeywords = ["language", "english", "hindi", "punjabi", "bengali", "tamil", "telugu", "marathi", "gujarati", "urdu", "kannada", "odia", "malayalam", "sanskrit"];
    const isLanguageSubject = subject !== "All Subjects" && languageKeywords.some(keyword => subject.toLowerCase().includes(keyword));

    if (isLanguageSubject) {
        languageStr = `\nIMPORTANT: Since this is a test of "${subject}", the questions, options, and explanations MUST be in the original script and language of "${subject}" itself, overriding any user preferred language. For example, if it's a Punjabi language test, use Gurmukhi script.`;
    } else if (language !== 'English') {
        languageStr = `\nIMPORTANT: The entire test (questions, options, and explanations) MUST be generated in ${language}. Use the appropriate script and vocabulary for ${language}.`;
    }

    // If requesting many questions, chunking or increasing limit logic might be needed, but 8192 usually covers up to ~30 questions.
    const subjectPrompt = subject === "All Subjects" 
        ? "the entire syllabus encompassing all relevant subjects for this exam"
        : `the subject: "${subject}"`;

    const prompt = `You are an expert examiner for the ${exam} exam (${stream} stream).
Generate a practice test for ${subjectPrompt}.${specificTopicsStr}${languageStr}
Difficulty level: ${difficulty}.
Number of questions: EXACTLY ${numQuestions}. You MUST generate exactly ${numQuestions} questions, no more, no less.

The questions should closely match the pattern, style, and syllabus of the actual ${exam} exam.
Include a mix of conceptual and numerical questions if applicable to the subject.
${pastContextStr}

Return the output strictly as a JSON array of exactly ${numQuestions} objects. Each object must have:
- "question": The question text.
- "stepByStepReasoning": Work out the correct answer step-by-step internally here FIRST before generating options.
- "options": An array of exactly 4 string options.
- "correctAnswer": The exact string of the correct option.
- "explanation": A detailed, polished explanation of why the answer is correct (do NOT include self-corrections like "Wait..." here, just the final clear explanation).`;

    const responseSchema: Schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                question: { type: Type.STRING },
                stepByStepReasoning: { type: Type.STRING },
                options: { 
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING }
            },
            required: ["question", "stepByStepReasoning", "options", "correctAnswer", "explanation"]
        }
    };

    try {
        const response = await client.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.7,
                maxOutputTokens: 8192
            }
        });

        incrementUsage();
        const text = response.text;
        if (!text) throw new Error("Empty response from Gemini");
        
        const questions = safeParseJSON(text);
        return Array.isArray(questions) ? questions : [];
    } catch (error) {
        console.error("Failed to generate exam quiz:", error);
        throw error;
    }
};
