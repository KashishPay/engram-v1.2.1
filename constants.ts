
import { Type, Schema } from '@google/genai';
import { Subject } from './types';
import { 
    Calendar, CheckSquare, LayoutGrid, Target, MapPin, Search, Settings, 
    Home, BookOpenText, PieChart, PenTool,
    CloudRain, Waves, Flame, Coffee 
} from 'lucide-react';

// Spaced Repetition Intervals (in days)
export const SPACING_INTERVALS = [1, 3, 7, 15, 30];

// Ambient Sounds for Focus
export const AMBIENT_SOUNDS = [
    { 
        id: 'nature', 
        name: 'Heavy Rain', 
        size: '~1 MB', 
        icon: CloudRain, 
        description: 'Ambient rain sounds.',
        url: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg' 
    },
    {
        id: 'ocean', 
        name: 'Ocean Waves', 
        size: '~2 MB', 
        icon: Waves, 
        description: 'Waves crashing on beach.', 
        url: 'https://actions.google.com/sounds/v1/water/waves_crashing_on_rock_beach.ogg'
    },
    {
        id: 'fire', 
        name: 'Crackling Fire', 
        size: '~1 MB', 
        icon: Flame, 
        description: 'Cozy fireplace sounds.', 
        url: 'https://actions.google.com/sounds/v1/ambiences/fire.ogg'
    },
    {
        id: 'cafe', 
        name: 'Coffee Shop', 
        size: '~1 MB', 
        icon: Coffee, 
        description: 'Background chatter.', 
        url: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg'
    }
];

// Theme Definitions with Accessibility Tokens
export const APP_THEMES = [
    { id: 'indigo', name: 'Default', color: 'bg-indigo-500', contrastText: 'text-white' },
    { id: 'teal', name: 'Teal', color: 'bg-teal-500', contrastText: 'text-white' },
    { id: 'cyan', name: 'Turquoise', color: 'bg-cyan-500', contrastText: 'text-gray-900' },
    { id: 'lime', name: 'Matcha', color: 'bg-lime-500', contrastText: 'text-gray-900' },
    { id: 'amber', name: 'Sunshine', color: 'bg-amber-500', contrastText: 'text-gray-900' },
    { id: 'rose', name: 'Peach', color: 'bg-rose-500', contrastText: 'text-white' },
    { id: 'violet', name: 'Lilac', color: 'bg-violet-500', contrastText: 'text-white' },
    { id: 'slate', name: 'Pearl', color: 'bg-slate-500', contrastText: 'text-white' },
];

// Map for quick lookup of theme properties in views
export const THEME_CONFIG: Record<string, { bg: string, text: string, lightBg: string, contrastText: string }> = {
    indigo: { bg: 'bg-indigo-500', text: 'text-indigo-600', lightBg: 'bg-indigo-100', contrastText: 'text-white' },
    teal: { bg: 'bg-teal-500', text: 'text-teal-600', lightBg: 'bg-teal-100', contrastText: 'text-white' },
    cyan: { bg: 'bg-cyan-500', text: 'text-cyan-600', lightBg: 'bg-cyan-100', contrastText: 'text-gray-900' },
    lime: { bg: 'bg-lime-500', text: 'text-lime-600', lightBg: 'bg-lime-100', contrastText: 'text-gray-900' },
    amber: { bg: 'bg-amber-500', text: 'text-amber-600', lightBg: 'bg-amber-100', contrastText: 'text-gray-900' },
    rose: { bg: 'bg-rose-500', text: 'text-rose-600', lightBg: 'bg-rose-100', contrastText: 'text-white' },
    violet: { bg: 'bg-violet-500', text: 'text-violet-600', lightBg: 'bg-violet-100', contrastText: 'text-white' },
    slate: { bg: 'bg-slate-500', text: 'text-slate-600', lightBg: 'bg-slate-100', contrastText: 'text-white' },
};

// Fallback for unknown themes
export const getThemeDetails = (id: string) => THEME_CONFIG[id] || THEME_CONFIG['indigo'];

// Tab Bar Configuration
export const TAB_ITEMS = [
    { id: 'home', label: 'Home', description: 'Dashboard', icon: Home, isCore: true },
    { id: 'subjects', label: 'Subjects', description: 'Manage topics', icon: BookOpenText, isCore: true },
    { id: 'profile', label: 'Profile', description: 'Stats', icon: PieChart, isCore: false },
    { id: 'calendar', label: 'Calendar', description: 'Manage your task with five calendar views.', icon: Calendar, isCore: false },
    { id: 'task', label: 'Task', description: 'Manage your task with lists and filters.', icon: CheckSquare, isCore: false }, 
    { id: 'matrix', label: 'Eisenhower Matrix', description: "Focus on what's important and urgent.", icon: LayoutGrid, isCore: false },
    { id: 'pomodoro', label: 'Pomodoro', description: 'Use the Pomo timer or stopwatch to keep focus.', icon: Target, isCore: false },
    { id: 'habit', label: 'Habit Tracker', description: 'Develop a habit and keep track of it.', icon: MapPin, isCore: false },
    { id: 'observations', label: 'Observations', description: 'Daily log of what you lack, learn, and remember.', icon: PenTool, isCore: false },
    { id: 'search', label: 'Search', description: 'Do a quick search easily.', icon: Search, isCore: false },
    { id: 'settings', label: 'Settings', description: 'Make changes to the current settings.', icon: Settings, isCore: true }, 
];

// Initial Subject Data
export const INITIAL_SUBJECTS: Subject[] = [
    { id: 'network', name: 'Network Theory' },
    { id: 'control', name: 'Control Systems' },
    { id: 'machines', name: 'Electrical Machines' },
    { id: 'power', name: 'Power Systems' },
    { id: 'analog', name: 'Analog Electronics' },
];

export const QUIZ_SYSTEM_INSTRUCTION = `You are an expert educational content generator specializing in crafting high-quality, multiple-choice quizzes. Your goal is to generate 10 questions automatically based ONLY on the provided short notes. The quiz must consist of exactly 10 questions. Each question must have 4 options (A, B, C, D) and only one correct answer. You must challenge the user's mindful thinking by including questions that require external knowledge of other electrical engineering concepts related to the provided topic.

CRITICAL INSTRUCTIONS:
1. Output MUST be valid JSON only.
2. Do NOT include any introductory text, markdown headers, or code block delimiters (like \`\`\`json).
3. Do NOT include internal reasoning, 'thinking' steps, or system instruction repetitions inside the JSON string values (e.g. in the 'explanation' field).
4. The 'explanation' field must contain ONLY the educational explanation for the answer.`;

export const FALLBACK_QUIZ_INSTRUCTION = (subject: string) => `The user has provided very minimal notes for the topic. Generate a 10-question quiz (following the standard JSON schema) focusing on fundamental and broad concepts within the subject area of '${subject}' to ensure the user can still complete a repetition cycle. Make the questions slightly conceptual or motivational, related to study habits and core principles of ${subject}.`;

export const QUIZ_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    pop_quiz: {
      type: Type.ARRAY,
      description: "An array containing exactly 10 multiple-choice quiz questions.",
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING, description: "The multiple-choice question text." },
          options: {
            type: Type.OBJECT,
            properties: {
              A: { type: Type.STRING },
              B: { type: Type.STRING },
              C: { type: Type.STRING },
              D: { type: Type.STRING }
            }
          },
          correct_answer_letter: { type: Type.STRING, description: "The letter (A, B, C, or D) corresponding to the correct option." },
          explanation: { type: Type.STRING, description: "A brief explanation of why the correct answer is right and why the others are wrong." }
        },
        required: ["question", "options", "correct_answer_letter", "explanation"]
      }
    }
  },
  required: ["pop_quiz"]
};

export const FLASHCARD_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    flashcards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          front: { type: Type.STRING, description: "The term, question, or concept on the front of the flashcard." },
          back: { type: Type.STRING, description: "The definition, answer, or explanation on the back of the flashcard." }
        },
        required: ["front", "back"]
      }
    }
  },
  required: ["flashcards"]
};
