
export interface QuizOption {
  A: string;
  B: string;
  C: string;
  D: string;
  [key: string]: string;
}

export interface QuizQuestion {
  question: string;
  options: QuizOption;
  correct_answer_letter: string;
  explanation: string;
}

export interface QuizAttemptQuestion extends QuizQuestion {
  questionText?: string; // Mapped from question
  correctAnswer?: string; // Mapped from correct_answer_letter
  userSelected: string;
}

export interface QuizAttempt {
  timeTakenSeconds: number;
  score: number;
  isFallbackQuiz: boolean;
  questions: QuizAttemptQuestion[];
}

export interface Repetition {
  dateCompleted: string;
  nextReviewDate: string;
  quizCompleted: boolean;
  score: number;
  totalQuestions: number;
  quizAttempt: QuizAttempt;
}

export interface FocusSession {
    date: string;
    minutes: number;
}

export interface Topic {
  id: string;
  subjectId: string;
  subject: string;
  topicName: string;
  shortNotes: string;
  hasNotes?: boolean; // Flag indicating notes are stored in IndexedDB
  podcastScript?: string; // The text script for the podcast
  podcastAudio?: string; // Base64 audio string (optional, generally transient now)
  hasSavedAudio?: boolean; // Flag indicating audio is stored in IndexedDB
  isMarkedDifficult?: boolean; // Flag for difficult topics folder
  isJourneyPaused?: boolean; // Flag to disable spaced repetition pop quizzes
  sourcePageCount?: number; // Number of original source pages stored in IDB
  pomodoroTimeMinutes: number;
  focusLogs?: FocusSession[];
  repetitions: Repetition[];
  createdAt: string;
  updatedAt?: string;
}

export interface Subject {
  id: string;
  name: string;
  updatedAt?: string;
}

export interface GeminiQuizResponse {
  pop_quiz: QuizQuestion[];
}

export interface DateTimeSettings {
    timeFormat: 'system' | '12h' | '24h';
    startDayOfWeek: 'sunday' | 'monday' | 'saturday';
    additionalCalendar: 'none' | 'indian' | 'chinese' | 'hijri';
    showWeekNumbers: boolean;
    week1Definition: 'default' | 'first4day' | 'firstFullWeek';
    countdownMode: boolean;
}

export interface ReminderConfig {
    time: string; // "HH:MM"
    label?: string; // Custom label for this specific time
}

export interface NotificationSettings {
    enabled: boolean;
    reminders: ReminderConfig[];
}

export interface Habit {
    id: string;
    name: string;
    completedDates: string[]; // ISO Date strings YYYY-MM-DD
    updatedAt?: string;
}

export interface ChatMessage {
    id?: string;
    role: 'user' | 'model' | 'ad';
    text: string;
    timestamp?: number;
    adContent?: {
        imageUrl?: string;
        title?: string;
        description?: string;
        link?: string;
    };
}

export interface User {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
}

export interface UserProfile {
    name: string;
    avatar: string | null; // Base64 data URI
    username?: string; // Unique handle from Supabase
    can_use_global_sync?: boolean; // Flag to allow global sync feature
}

export interface DailyObservation {
  id: string;             // uuid or `${dateISO}-${createdAt}`
  dateISO: string;        // 'YYYY-MM-DD'
  lack: string[];         // bullets: "What I lack"
  learn: string[];        // bullets: "What I need to learn"
  remember: string[];     // bullets: "What I need to remember"
  notes?: string;         // optional free text
  images?: string[];      // Array of Image IDs stored in IndexedDB
  mood?: number;          // 1–5
  createdAt: number;      // epoch ms
  updatedAt: number;      // epoch ms
}

export interface FlashCard {
    id: string;
    front: string;
    back: string;
    subject?: string;
    topicName?: string;
    createdAt?: string;
    lastResult?: 'known' | 'unknown';
    isAd?: boolean;
}

// Global variable declarations for Canvas/Runtime environment
declare global {
  interface Window {
    __app_id?: string;
  }
}

// --- Session Logs (Separation Architecture) ---

export type ISODateString = string; // e.g., "2026-01-09"

export interface BaseSession {
  minutes: number;
  date: ISODateString;
  time?: string; // Display time e.g. "10:30 am"
  createdAt: number; // epoch ms
  sessionLabel?: string; // Optional user-defined name for the session
}

export interface PomodoroSession extends BaseSession {
  type: 'POMODORO';
  topicName: 'General Focus';
  subject: 'General';
}

export interface TopicSession extends BaseSession {
  type: 'TOPIC';
  topicName: string;   // concrete topic
  subject: string;     // concrete subject
}

export type SessionLog = PomodoroSession | TopicSession;
