import { getAiClient, checkUsageLimit, incrementUsage } from './gemini';
import { Type, Schema } from "@google/genai";

export interface TestSeriesQuestion {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
}

export const fetchExamSubjects = async (exam: string, stream: string): Promise<string[]> => {
    checkUsageLimit();
    const { client } = getAiClient();

    const prompt = `You are an expert tutor and curriculum designer. 
List the core subjects/topics for the following competitive exam and stream.
Exam: ${exam}
Stream/Branch: ${stream}

Return ONLY a JSON array of strings representing the subjects. Keep the subject names concise and standard.`;

    const responseSchema: Schema = {
        type: Type.ARRAY,
        items: { type: Type.STRING }
    };

    try {
        const response = await client.models.generateContent({
            model: 'gemini-3-flash-preview',
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
        
        const subjects = JSON.parse(text);
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
    specificTopics?: string
): Promise<TestSeriesQuestion[]> => {
    checkUsageLimit();
    const { client } = getAiClient();

    const pastContextStr = pastQuestionsContext.length > 0 
        ? `\nIMPORTANT: Do NOT generate questions that are identical or highly similar to these past questions:\n${pastQuestionsContext.slice(-20).map((q, i) => `${i+1}. ${q}`).join('\n')}`
        : '';

    const specificTopicsStr = specificTopics && specificTopics.trim().length > 0
        ? `\nIMPORTANT: The user has requested to ONLY test the following specific topics: "${specificTopics}". Ensure ALL questions strictly focus on these topics.`
        : '';

    const prompt = `You are an expert examiner for the ${exam} exam (${stream} stream).
Generate a practice test for the subject: "${subject}".${specificTopicsStr}
Difficulty level: ${difficulty}.
Number of questions: EXACTLY ${numQuestions}. You MUST generate exactly ${numQuestions} questions, no more, no less.

The questions should closely match the pattern, style, and syllabus of the actual ${exam} exam.
Include a mix of conceptual and numerical questions if applicable to the subject.
${pastContextStr}

Return the output strictly as a JSON array of exactly ${numQuestions} objects. Each object must have:
- "question": The question text.
- "options": An array of exactly 4 string options.
- "correctAnswer": The exact string of the correct option.
- "explanation": A detailed explanation of why the answer is correct.`;

    const responseSchema: Schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                question: { type: Type.STRING },
                options: { 
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING }
            },
            required: ["question", "options", "correctAnswer", "explanation"]
        }
    };

    try {
        const response = await client.models.generateContent({
            model: 'gemini-3-flash-preview',
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
        
        const questions = JSON.parse(text);
        return Array.isArray(questions) ? questions : [];
    } catch (error) {
        console.error("Failed to generate exam quiz:", error);
        throw error;
    }
};
