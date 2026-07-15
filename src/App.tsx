import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { 
  Send, BookOpen, FileText, HelpCircle, Calculator, Zap, 
  User, MessageSquare, GraduationCap, Sparkles, Paperclip, 
  LogOut, Trash2, Shield, X, ChevronRight, 
  TrendingUp, Award, Camera, ArrowLeft, RefreshCcw,
  Copy, Save, Clock, Layers, Bookmark, Flame, Sun, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { chatWithNCode, Message, UserData, generateFlashcardsFromResponse, generateDailyChallenge } from './services/geminiService';
import { cn } from './lib/utils';
import { OnboardingPage } from './components/Onboarding';

// --- Types ---
type Mode = 'selection' | 'explain' | 'mcq' | 'notes' | 'solve' | 'tips' | 'exam_chat' | 'quick_revision';
type Tab = 'study' | 'library' | 'tips' | 'profile';

interface ChatSession {
  id: string;
  mode: Exclude<Mode, 'selection'>;
  topic: string;
  messages: Message[];
  suggestions?: string[];
  timestamp: number;
}

interface Exam {
  id: string;
  name: string;
  date: string;
  subject: string;
  addedOn: string;
}

interface LibraryData {
  savedNotes: { id: string; topic: string; content: string; date: string; type: string }[];
  recentChats: ChatSession[];
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  topic: string;
  subject: string;
  grade: string;
  nextReview: string; // YYYY-MM-DD
  interval: number;
  easeFactor: number;
  repetitions: number;
  createdAt: string;
}

export interface ChallengeQuestion {
  type: 'mcq' | 'fill' | 'short';
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
}

export interface DailyChallenge {
  date: string;
  questions: ChallengeQuestion[];
  done: boolean;
  score?: number;
  timeTaken?: string;
}

export interface ChallengeStreak {
  currentStreak: number;
  bestStreak: number;
  lastDoneDate?: string;
  badges: string[];
}

interface AppStats {
  topicsExplored: number;
  mcqsGenerated: number;
  notesSaved: number;
  dayStreak: number;
  bestStreak: number;
  lastStudyDate?: string;
  weakTopics: string[];
  studiesToday: number;
  milestones: number[]; // [7, 14, 30]
  flashcardsReviewedToday?: number;
}

// --- Lazy Load Overlay Components ---
const FlashcardReview = lazy(() => import('./components/FlashcardReview'));
const DailyChallenge = lazy(() => import('./components/DailyChallenge'));

// --- Future-proofing Safety & Storage Wrappers ---
const APP_VERSION = "1.0.0";
const STORAGE_KEYS = {
  profile: 'ncode_profile',
  user: 'nc_u',
  library: 'nc_l',
  stats: 'nc_s',
  exams: 'ncode_exams',
  flashcards: 'ncode_flashcards',
  challenge: 'ncode_daily_challenge',
  streak: 'ncode_challenge_streak',
  privacy: 'nc_privacy_seen',
  version: 'ncode_version',
  history: 'ncode_challenge_history',
  cache: 'ncode_cache',
  chats: 'savedChats',
  theme: 'ncode_theme'
};

const safeGet = (key: string, fallback: any = null) => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    return JSON.parse(item);
  } catch {
    return fallback;
  }
};

const safeSet = (key: string, value: any): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e: any) {
    if (e.name === 'QuotaExceededError') {
      try {
        const library = safeGet(STORAGE_KEYS.library, {});
        if (library.recentChats?.length > 5) {
          library.recentChats = library.recentChats.slice(0, 5);
          localStorage.setItem(STORAGE_KEYS.library, JSON.stringify(library));
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        }
      } catch {}
    }
    console.error('Storage error:', e);
    return false;
  }
};

const migrateData = () => {
  const currentVersion = safeGet(STORAGE_KEYS.version, '0.0.0');
  if (currentVersion === APP_VERSION) return;

  const oldUser = localStorage.getItem('nc_u');
  if (oldUser && !localStorage.getItem('ncode_profile')) {
    localStorage.setItem('ncode_profile', oldUser);
  }

  const profile = safeGet(STORAGE_KEYS.profile);
  if (profile) {
    const updated = {
      name: profile.name || 'Student',
      email: profile.email || '',
      gradePreference: profile.gradePreference || profile.grade || 'Class 10',
      language: profile.language || 'Hinglish',
      subjects: profile.subjects || [],
      avatarColor: profile.avatarColor || '#7F77DD',
      ...profile
    };
    safeSet(STORAGE_KEYS.profile, updated);
  }

  const stats = safeGet(STORAGE_KEYS.stats);
  if (stats) {
    const updated = {
      topicsExplored: 0,
      mcqsGenerated: 0,
      notesSaved: 0,
      dayStreak: 1,
      bestStreak: 1,
      weakTopics: [],
      studiesToday: 0,
      milestones: [],
      lastStudyDate: null,
      ...stats
    };
    safeSet(STORAGE_KEYS.stats, updated);
  }

  const library = safeGet(STORAGE_KEYS.library);
  if (library) {
    const updated = {
      recentChats: [],
      savedNotes: [],
      ...library
    };
    safeSet(STORAGE_KEYS.library, updated);
  }

  safeSet(STORAGE_KEYS.version, APP_VERSION);
};

const healthCheck = (): boolean => {
  try {
    migrateData();
    localStorage.setItem('ncode_health', 'ok');
    localStorage.removeItem('ncode_health');
    return true;
  } catch (err) {
    console.error('Health check failed:', err);
    return false;
  }
};

const getErrorMessage = (error: any): string => {
  const msg = error?.message || '';
  if (msg.includes('API_KEY_MISSING')) return "App setup incomplete hai. Admin se contact karo.";
  if (msg.includes('API_ERROR_429')) return "Thoda busy hoon abhi, 1 minute baad try karo 🔄";
  if (msg.includes('API_ERROR_403')) return "API key expired ho gayi. Admin se contact karo.";
  if (msg.includes('API_ERROR_500')) return "Google ka server down hai, thodi der baad try karo 🔄";
  if (msg.includes('EMPTY_RESPONSE')) return "Kuch mila nahi, thoda aur detail mein poochho 🤔";
  if (msg.includes('AbortError') || msg.includes('timeout')) return "Internet slow hai, dobara try karo 🔄";
  if (!navigator.onLine) return "Internet nahi hai, offline notes dekho 📚";
  return "Kuch gadbad hui, dobara try karo 🔄";
};

const sanitizeInput = (text: string): string => {
  return text
    .trim()
    .slice(0, 2000)
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '');
};

const cacheResponse = (key: string, response: string) => {
  const cache = safeGet(STORAGE_KEYS.cache, {});
  cache[key] = { response, timestamp: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > 50) {
    delete cache[keys[0]];
  }
  safeSet(STORAGE_KEYS.cache, cache);
};

const getCachedResponse = (key: string): string | null => {
  const cache = safeGet(STORAGE_KEYS.cache, {});
  return cache[key]?.response || null;
};

// --- App ---
export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [theme, setTheme] = useState<'deep-space' | 'paper'>(() => safeGet(STORAGE_KEYS.theme, 'deep-space'));

  const toggleTheme = () => {
    const nextTheme = theme === 'deep-space' ? 'paper' : 'deep-space';
    setTheme(nextTheme);
    safeSet(STORAGE_KEYS.theme, nextTheme);
  };

  const [activeTab, setActiveTab] = useState<Tab>('study');
  const [library, setLibrary] = useState<LibraryData>({ savedNotes: [], recentChats: [] });
  const [stats, setStats] = useState<AppStats>({ 
    topicsExplored: 0, 
    mcqsGenerated: 0, 
    notesSaved: 0, 
    dayStreak: 1, 
    bestStreak: 1, 
    weakTopics: [], 
    studiesToday: 0,
    milestones: []
  });
  const [exams, setExams] = useState<Exam[]>([]);

  // --- Spaced Repetition System states ---
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [completedReviewsCount, setCompletedReviewsCount] = useState(0);
  const [showReviewCompletedOverlay, setShowReviewCompletedOverlay] = useState(false);

  // --- Daily 10-Minute Challenge states ---
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [challengeStreak, setChallengeStreak] = useState<ChallengeStreak>({ currentStreak: 0, bestStreak: 0, badges: [] });
  const [challengeHistory, setChallengeHistory] = useState<Record<string, 'pass' | 'fail'>>({});
  
  const [isChallengeMode, setIsChallengeMode] = useState(false);
  const [challengeCurrentIndex, setChallengeCurrentIndex] = useState(0);
  const [challengeAnswers, setChallengeAnswers] = useState<string[]>([]);
  const [challengeTimer, setChallengeTimer] = useState(600); // 10 minutes
  const [challengeTimerActive, setChallengeTimerActive] = useState(false);
  const [showChallengeCompletedOverlay, setShowChallengeCompletedOverlay] = useState(false);
  const [challengeTimeTaken, setChallengeTimeTaken] = useState(0);
  const [isGeneratingChallenge, setIsGeneratingChallenge] = useState(false);

  const [currentMode, setCurrentMode] = useState<Mode>('selection');
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOnlineStatus, setShowOnlineStatus] = useState(false);
  const [showAddExam, setShowAddExam] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [newChatMode, setNewChatMode] = useState(false);
  
  const [confirmModal, setConfirmModal] = useState<{
    title: string, 
    msg: string, 
    confirmText?: string, 
    cancelText?: string, 
    danger?: boolean,
    action: () => void
  } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [milestoneReached, setMilestoneReached] = useState<number | null>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [nudge, setNudge] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(p => p.length > 0);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAttachedImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); setShowOnlineStatus(true); setTimeout(() => setShowOnlineStatus(false), 3000); };
    const handleOffline = () => { setIsOnline(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const SUGGESTIONS = ['Thermodynamics', 'Periodic Table', 'Trigonometry', 'Cell Biology', 'Indian History', 'Economics Intro', 'English Grammar'];
  const dailyFocus = SUGGESTIONS[new Date().getDate() % SUGGESTIONS.length];

  useEffect(() => {
    // Part 10 & Part 5: Health check and migration on startup
    const ok = healthCheck();
    if (!ok) {
      console.error("Storage/Startup health check failed!");
    }

    const u = safeGet(STORAGE_KEYS.profile) || safeGet(STORAGE_KEYS.user);
    const l = safeGet(STORAGE_KEYS.library);
    const s = safeGet(STORAGE_KEYS.stats);
    const e = safeGet(STORAGE_KEYS.exams);
    const privSeen = safeGet(STORAGE_KEYS.privacy);

    // Load Flashcards
    const fc = safeGet(STORAGE_KEYS.flashcards);
    if (fc) {
      setFlashcards(fc);
    }

    // Load Daily Challenge
    const chal = safeGet(STORAGE_KEYS.challenge);
    if (chal) {
      setChallenge(chal);
    }

    // Load Challenge Streak
    const chalStreak = safeGet(STORAGE_KEYS.streak);
    if (chalStreak) {
      setChallengeStreak(chalStreak);
    }

    // Load Challenge History
    const chalHist = safeGet(STORAGE_KEYS.history);
    if (chalHist) {
      setChallengeHistory(chalHist);
    }

    if (u) {
      setUser(u);
      if (privSeen !== 'true') setShowPrivacy(true);
    }
    if (l) setLibrary(l);
    
    // Exam cleanup and sorting
    if (e) {
      const today = new Date();
      today.setHours(0,0,0,0);
      const filtered = e
        .filter((ex: Exam) => new Date(ex.date) >= today)
        .sort((a: Exam, b: Exam) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setExams(filtered);
      safeSet(STORAGE_KEYS.exams, filtered);
    }

    if (s) {
      const parsed = s;
      
      // Streak Logic
      const now = new Date();
      const todayString = now.toDateString();
      const last = parsed.lastStudyDate ? new Date(parsed.lastStudyDate).toDateString() : null;
      
      if (last !== todayString) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = yesterday.toDateString();

        if (last === yesterdayString) {
          parsed.dayStreak += 1;
          // Check milestones
          const milestone = [7, 14, 30].find(m => parsed.dayStreak === m && !parsed.milestones?.includes(m));
          if (milestone) {
            setMilestoneReached(milestone);
            parsed.milestones = [...(parsed.milestones || []), milestone];
          }
        } else if (last !== null) {
          parsed.dayStreak = 1;
        }
        
        parsed.bestStreak = Math.max(parsed.bestStreak || 0, parsed.dayStreak);
        parsed.lastStudyDate = todayString;
        parsed.studiesToday = 0;
        parsed.flashcardsReviewedToday = 0;
      }
      setStats(parsed);
    }
  }, []);

  useEffect(() => {
    if (user) {
      safeSet(STORAGE_KEYS.profile, user);
      safeSet(STORAGE_KEYS.user, user);
    }
    const truncatedLibrary = {
      ...library,
      recentChats: library.recentChats ? library.recentChats.slice(0, 15) : [],
      savedNotes: library.savedNotes ? library.savedNotes.slice(0, 50) : []
    };
    safeSet(STORAGE_KEYS.library, truncatedLibrary);
    safeSet(STORAGE_KEYS.stats, stats);
    safeSet(STORAGE_KEYS.exams, exams);
    
    const truncatedFlashcards = flashcards ? flashcards.slice(-100) : [];
    safeSet(STORAGE_KEYS.flashcards, truncatedFlashcards);
    
    if (challenge) {
      safeSet(STORAGE_KEYS.challenge, challenge);
    }
    safeSet(STORAGE_KEYS.streak, challengeStreak);
    safeSet(STORAGE_KEYS.history, challengeHistory);
  }, [user, library, stats, exams, flashcards, challenge, challengeStreak, challengeHistory]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (currentMode !== 'selection' && !isTyping && Date.now() - lastActivity > 120000) {
        setNudge(`Still studying ${user?.name.split(' ')[0]}? Ask me anything!`);
        setTimeout(() => setNudge(null), 5000);
        setLastActivity(Date.now());
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [currentMode, isTyping, lastActivity, user]);

  useEffect(() => {
    saveChat();
  }, [activeTab]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, isTyping]);

  // --- Feature 2: Daily Challenge helper methods & hooks ---
  const formatTimeTaken = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isAnswerCorrect = (q: ChallengeQuestion, ans: string): boolean => {
    if (!ans) return false;
    if (q.type === 'mcq') {
      return ans.trim().toUpperCase() === q.answer.trim().toUpperCase();
    }
    return ans.trim().toLowerCase() === q.answer.trim().toLowerCase();
  };

  const completeChallenge = (score: number, elapsed: number) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    let newStreak = challengeStreak.currentStreak;
    let newBest = challengeStreak.bestStreak;
    
    if (challengeStreak.lastDoneDate === yesterdayStr) {
      newStreak += 1;
    } else if (challengeStreak.lastDoneDate !== todayStr) {
      newStreak = 1;
    }
    newBest = Math.max(newBest, newStreak);
    
    const badges = [...(challengeStreak.badges || [])];
    if (newStreak >= 3 && !badges.includes("Getting Started 🌱")) badges.push("Getting Started 🌱");
    if (newStreak >= 7 && !badges.includes("On Fire 🔥")) badges.push("On Fire 🔥");
    if (newStreak >= 14 && !badges.includes("Dedicated Student 📚")) badges.push("Dedicated Student 📚");
    if (newStreak >= 30 && !badges.includes("N-CODE Champion 🏆")) badges.push("N-CODE Champion 🏆");
    
    const updatedStreakObj: ChallengeStreak = {
      currentStreak: newStreak,
      bestStreak: newBest,
      lastDoneDate: todayStr,
      badges
    };
    setChallengeStreak(updatedStreakObj);
    safeSet(STORAGE_KEYS.streak, updatedStreakObj);
    
    const updatedHistory = {
      ...challengeHistory,
      [todayStr]: (score >= 3 ? 'pass' : 'fail') as 'pass' | 'fail'
    };
    setChallengeHistory(updatedHistory);
    safeSet(STORAGE_KEYS.history, updatedHistory);
    
    if (challenge) {
      const updatedChallenge: DailyChallenge = {
        ...challenge,
        done: true,
        score,
        timeTaken: formatTimeTaken(elapsed)
      };
      setChallenge(updatedChallenge);
      safeSet(STORAGE_KEYS.challenge, updatedChallenge);
    }
    
    // Process wrong questions to append to weakTopics
    if (challenge) {
      const wrongTopicsToInject: string[] = [];
      challenge.questions.forEach((q, idx) => {
        const userAnswer = challengeAnswers[idx] || '';
        const correct = isAnswerCorrect(q, userAnswer);
        if (!correct) {
          const summary = q.question.length > 30 ? q.question.slice(0, 30) + '...' : q.question;
          wrongTopicsToInject.push(summary);
        }
      });
      
      if (wrongTopicsToInject.length > 0) {
        setStats(p => {
          const updatedWeak = Array.from(new Set([...(p.weakTopics || []), ...wrongTopicsToInject]));
          return {
            ...p,
            weakTopics: updatedWeak
          };
        });
      }
    }
  };

  const submitChallengeAndShowResults = () => {
    setChallengeTimerActive(false);
    const elapsed = 600 - challengeTimer;
    setChallengeTimeTaken(elapsed);
    
    let scoreNum = 0;
    if (challenge) {
      challenge.questions.forEach((q, idx) => {
        const userAnswer = challengeAnswers[idx] || '';
        if (isAnswerCorrect(q, userAnswer)) {
          scoreNum++;
        }
      });
    }
    
    completeChallenge(scoreNum, elapsed);
    setIsChallengeMode(false);
    setShowChallengeCompletedOverlay(true);
  };

  const getLastSevenDaysHistory = () => {
    const dots = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      const status = challengeHistory[dStr];
      if (status === 'pass') {
        dots.push({ date: dStr, icon: "✅" });
      } else if (status === 'fail') {
        dots.push({ date: dStr, icon: "❌" });
      } else {
        dots.push({ date: dStr, icon: "⚪" });
      }
    }
    return dots;
  };

  const getCardsDueTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    return flashcards.filter(c => c.nextReview === tomorrowStr).length;
  };

  const getRetentionRate = () => {
    const attempted = flashcards.filter(c => c.repetitions > 0);
    if (attempted.length === 0) return 100;
    const highScore = attempted.filter(c => c.easeFactor >= 2.3).length;
    return Math.round((highScore / attempted.length) * 100);
  };

  // Timer for Daily Challenge
  useEffect(() => {
    let intervalId: any;
    if (isChallengeMode && challengeTimerActive && challengeTimer > 0) {
      intervalId = setInterval(() => {
        setChallengeTimer(t => {
          if (t <= 1) {
            clearInterval(intervalId);
            setChallengeTimerActive(false);
            submitChallengeAndShowResults();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalId);
  }, [isChallengeMode, challengeTimerActive, challengeTimer, challenge, challengeAnswers]);

  // Check and generate Daily Challenge
  useEffect(() => {
    const checkAndGenerateChallenge = async () => {
      if (!user) return;
      const todayStr = new Date().toISOString().split('T')[0];
      const saved = safeGet(STORAGE_KEYS.challenge);
      let needsGen = true;
      if (saved) {
        if (saved.date === todayStr) {
          needsGen = false;
        }
      }
      
      if (needsGen && !isGeneratingChallenge) {
        setIsGeneratingChallenge(true);
        try {
          const recent = library.recentChats.map(c => c.topic).slice(0, 5);
          const weak = stats.weakTopics.slice(0, 5);
          const questions = await generateDailyChallenge(user.gradePreference, recent, weak);
          if (questions && questions.length === 5) {
            const freshChallenge: DailyChallenge = {
              date: todayStr,
              questions,
              done: false
            };
            setChallenge(freshChallenge);
            safeSet(STORAGE_KEYS.challenge, freshChallenge);
          }
        } catch (err) {
          console.error("Failed to generate challenge", err);
        } finally {
          setIsGeneratingChallenge(false);
        }
      }
    };
    
    checkAndGenerateChallenge();
  }, [user, library.recentChats, stats.weakTopics]);

  const saveChat = () => {
    if (messages.length === 0 || currentMode === 'selection') return;
    const firstMsg = messages.find(m => m.role === 'user')?.content || "New Chat";
    const chatId = activeChatId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    if (!activeChatId) {
      setActiveChatId(chatId);
    }
    const session: ChatSession = {
      id: chatId,
      mode: currentMode as any,
      topic: firstMsg.slice(0, 40) + (firstMsg.length > 40 ? '...' : ''),
      messages: messages,
      suggestions: suggestions,
      timestamp: Date.now()
    };
    setLibrary(prev => ({ ...prev, recentChats: [session, ...prev.recentChats.filter(c => c.id !== session.id)].slice(0, 15) }));
  };

  const extractAndSaveFlashcards = async (responseText: string, topicName: string) => {
    try {
      const p = await generateFlashcardsFromResponse(responseText);
      if (p && p.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0,0,0,0);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const newCards: Flashcard[] = p.map(rf => ({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          front: rf.front,
          back: rf.back,
          topic: topicName || "General Concepts",
          subject: user?.subjects?.[0] || "General",
          grade: user?.gradePreference || "All Class",
          nextReview: tomorrowStr,
          interval: 1,
          easeFactor: 2.5,
          repetitions: 0,
          createdAt: todayStr
        }));

        setFlashcards(prev => {
          const updated = [...prev, ...newCards].slice(-100);
          safeSet(STORAGE_KEYS.flashcards, updated);
          return updated;
        });

        // Show toast
        setSuccessToast(`${newCards.length} flashcards saved! Review kal hogi ✅`);
        setTimeout(() => setSuccessToast(null), 3000);
      }
    } catch (err) {
      console.error("Failed to automatically generate flashcards in background:", err);
    }
  };

  const handleRateFlashcard = (cardId: string, rating: number) => {
    setFlashcards(prev => {
      const updated = prev.map(card => {
        if (card.id !== cardId) return card;
        
        let interval = card.interval;
        let easeFactor = card.easeFactor;
        
        if (rating === 1) {
          interval = 1;
        } else if (rating === 2) {
          interval = 1;
        } else if (rating === 3) {
          interval = card.repetitions === 0 ? 1 : Math.max(1, interval * easeFactor);
        } else if (rating === 4) {
          interval = card.repetitions === 0 ? 1 : Math.max(1, interval * easeFactor * 1.3);
        }
        
        easeFactor = easeFactor + (0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02));
        if (easeFactor < 1.3) easeFactor = 1.3;
        
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + Math.round(interval));
        targetDate.setHours(0,0,0,0);
        const nextReview = targetDate.toISOString().split('T')[0];

        return {
          ...card,
          interval,
          easeFactor,
          repetitions: card.repetitions + 1,
          nextReview
        };
      });
      
      const truncated = updated.slice(-100);
      safeSet(STORAGE_KEYS.flashcards, truncated);
      return truncated;
    });

    // Update stats flashcardsReviewedToday
    setStats(p => {
      const count = (p.flashcardsReviewedToday || 0) + 1;
      return {
        ...p,
        flashcardsReviewedToday: count
      };
    });
  };

  const handleReviewRating = (cardId: string, rating: number) => {
    handleRateFlashcard(cardId, rating);
    setCompletedReviewsCount(prev => prev + 1);
    
    const todayStrStr = new Date().toISOString().split('T')[0];
    const due = flashcards.filter(c => c.nextReview <= todayStrStr);

    if (currentReviewIndex + 1 < due.length) {
      setCurrentReviewIndex(prev => prev + 1);
      setShowAnswer(false);
    } else {
      setShowReviewCompletedOverlay(true);
      setIsReviewMode(false);
    }
  };

  const handleSend = async (override?: string) => {
    const text = sanitizeInput(override || input);
    if ((!text && !attachedImage) || isTyping) return;
    
    // Check image size if attached (mock check for base64 length)
    if (attachedImage && attachedImage.length > 5000000) { // Approx 4MB
      setErrorToast("Image thodi badi hai, compress karke try karo");
      setTimeout(() => setErrorToast(null), 3000);
      return;
    }

    setLastActivity(Date.now());
    const newMsg: Message = { role: 'user', content: text || (attachedImage ? "Please analyze this image." : "") };
    const updatedMessages = [...messages, newMsg];
    
    setMessages(updatedMessages);
    setSuggestions([]);
    setInput('');
    setIsTyping(true);
    const img = attachedImage;
    setAttachedImage(null);

    try {
      if (!isOnline) {
        const cached = getCachedResponse(text);
        if (cached) {
          let cleanedResp = cached;
          const relatedMatch = cached.match(/RELATED:\s*(.*)/i);
          if (relatedMatch) {
             const topics = relatedMatch[1].split(',').map(t => t.trim().replace(/[\[\]]/g, ''));
             setSuggestions(topics.slice(0, 4));
             cleanedResp = cached.replace(/RELATED:\s*(.*)/i, '').trim();
          }

          const modelMsg: Message = { role: 'model', content: cleanedResp + "\n\n*(Cached response — offline mode)*" };
          setMessages(prev => [...prev, modelMsg]);
          setIsTyping(false);
          return;
        }
        throw new Error("Offline");
      }

      // Filter out auto-greeting from history sent to API
      const apiHistory = messages.filter((msg, idx) => {
        if (idx === 0 && msg.role === 'model') return false;
        return true;
      });

      const resp = await chatWithNCode(apiHistory, text, currentMode, user!, img || undefined);
      
      if (!resp || resp.includes("I'm sorry, I couldn't generate a response")) {
        throw new Error("EMPTY_RESPONSE");
      }

      // Cache online response
      if (text) {
        cacheResponse(text, resp);
      }

      // Parse RELATED topics
      let cleanedResp = resp;
      const relatedMatch = resp.match(/RELATED:\s*(.*)/i);
      if (relatedMatch) {
         const topics = relatedMatch[1].split(',').map(t => t.trim().replace(/[\[\]]/g, ''));
         setSuggestions(topics.slice(0, 4));
         cleanedResp = resp.replace(/RELATED:\s*(.*)/i, '').trim();
      }

      const modelMsg: Message = { role: 'model', content: cleanedResp };
      setMessages(prev => [...prev, modelMsg]);

      // Automatically extract and save flashcards in background
      extractAndSaveFlashcards(cleanedResp, text);
      
      setStats(p => {
        const newStudies = p.studiesToday + 1;
        if (newStudies === 5) setCelebrate(true);
        return { 
          ...p, 
          topicsExplored: p.topicsExplored + 1,
          studiesToday: newStudies,
          mcqsGenerated: currentMode === 'mcq' ? p.mcqsGenerated + 5 : p.mcqsGenerated
        };
      });
    } catch (e: any) {
      console.error(e);
      const errorMsg = getErrorMessage(e);
      setMessages(prev => [...prev, { role: 'model', content: errorMsg }]);
    } finally {
      setIsTyping(false);
    }
  };

  const toggleVoice = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorToast("Chrome use karo voice ke liye");
      setTimeout(() => setErrorToast(null), 3000);
      return;
    }
    const r = new SpeechRecognition();
    r.lang = 'hi-IN';
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e: any) => {
      const t = Array.from(e.results)
        .map((res: any) => res[0].transcript).join('');
      setInput(t);
    };
    r.onend = () => setIsRecording(false);
    r.onerror = () => {
      setIsRecording(false);
      setErrorToast("Voice nahi suni, dobara try karo");
      setTimeout(() => setErrorToast(null), 3000);
    };
    r.start();
    setIsRecording(true);
    recognitionRef.current = r;
  };

  const speak = (text: string, index: number) => {
    if (isSpeaking === index) {
      window.speechSynthesis.cancel();
      setIsSpeaking(null);
      return;
    }
    window.speechSynthesis.cancel();
    const clean = text
      .replace(/<[^>]*>/g, '')
      .replace(/[*#`_]/g, '')
      .replace(/\s+/g, ' ').trim();
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 0.9;
    u.lang = 'hi-IN';
    const voices = window.speechSynthesis.getVoices();
    const hindi = voices.find(v => v.lang.includes('hi'));
    if (hindi) u.voice = hindi;
    u.onstart = () => setIsSpeaking(index);
    u.onend = () => setIsSpeaking(null);
    window.speechSynthesis.speak(u);
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) { setShowCamera(false); alert("Camera error"); }
  };

  const handleDownloadPDF = async (content: string, mode: Mode) => {
    setSuccessToast("PDF ban rahi hai... ⏳");
    try {
      const firstUserMsg = messages.find(msg => msg.role === 'user')?.content || "Notes";
      const topicName = firstUserMsg.slice(0, 30).trim();
      const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ /g, '');
      const filename = `N-CODE_${mode === 'quick_revision' ? 'Flashcard' : 'Notes'}_${topicName.replace(/\s+/g, '_')}_${dateStr}.pdf`;

      const doc = new jsPDF('p', 'mm', 'a4');
      const date = new Date().toLocaleDateString();
      
      doc.setFontSize(20);
      doc.setTextColor(127, 119, 221);
      doc.text('N-CODE — Smart Study Notes', 20, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Student: ${user?.name || "Student"}`, 20, 32);
      doc.text(`Grade: ${user?.gradePreference || "All Class"}`, 100, 32);
      doc.text(`Date: ${date}`, 20, 38);
      doc.text(`Topic: ${topicName}`, 20, 44);
      
      doc.setDrawColor(127, 119, 221);
      doc.line(20, 48, 190, 48);
      
      const cleanText = content
        .replace(/<[^>]*>/g, '')
        .replace(/[*#`]/g, '')
        .trim();
      
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      const lines = doc.splitTextToSize(cleanText, 170);
      
      let cursorY = 58;
      const pageHeight = doc.internal.pageSize.getHeight();
      
      for (let i = 0; i < lines.length; i++) {
        if (cursorY > pageHeight - 25) {
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text('Generated by N-CODE | Padhai ka Smart Saathi', 20, pageHeight - 10);
          doc.addPage();
          cursorY = 20;
          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
        }
        doc.text(lines[i], 20, cursorY);
        cursorY += 6;
      }
      
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        'Generated by N-CODE | Padhai ka Smart Saathi', 
        20, pageHeight - 10
      );
      
      doc.save(filename);
      setSuccessToast("PDF ready hai! ✅");
      setTimeout(() => setSuccessToast(null), 2000);

      // Save to library
      const newNote = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        topic: topicName,
        content: content,
        date: date,
        type: mode === 'quick_revision' ? 'FLASHCARD' : 'NOTES'
      };

      setLibrary(prev => {
        const updatedNotes = [newNote, ...prev.savedNotes].slice(0, 50);
        const updatedLib = { ...prev, savedNotes: updatedNotes };
        safeSet(STORAGE_KEYS.library, updatedLib);
        return updatedLib;
      });
    } catch (e) {
      console.error(e);
      setErrorToast("PDF nahi bani, dobara try karo 🔄");
      setTimeout(() => setErrorToast(null), 3000);
    }
  };

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      ctx?.drawImage(videoRef.current, 0, 0);
      setAttachedImage(canvasRef.current.toDataURL('image/jpeg'));
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      setShowCamera(false);
    }
  };

  const handleModeSelect = (m: Mode) => {
    setCurrentMode(m);
    setActiveChatId(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const firstName = user?.name.split(' ')[0] || "Buddy";
    const initialGreetings: Record<string, string> = {
      explain: `Namaste ${firstName}! Kaunsa topic explain karun aaj? Subject aur class batao — main seedha samjhata hoon! 🎯`,
      mcq: `Namaste ${firstName}! Kis topic pe MCQ chahiye? Grade aur subject batao — shuru karte hain! 📝`,
      notes: `Namaste ${firstName}! Kis cheez ke notes banau? Topic batao — revision ready kar deta hoon! 📒`,
      solve: `Namaste ${firstName}! Problem paste karo ya photo khicho — main step by step solve karta hoon! 🔢`,
      tips: `Namaste ${firstName}! Exam ki strategy banate hain. Kaunse exam ke liye tips chahiye?`,
      exam_chat: `Namaste ${firstName}! Main aapka exam coach hoon. Puchiye kya janna hai.`,
      quick_revision: `Namaste ${firstName}! Kaunsa topic? 5 minute mein revision ready! ⚡`
    };
    setMessages([{ role: 'model', content: initialGreetings[m] || "Namaste! Puchiye kya janna hai." }]);
  };

  if (!user) return <OnboardingPage onAuth={setUser} />;

  const nextExam = exams.length > 0 ? [...exams].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] : null;
  const getDaysLeft = (dateStr: string) => {
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const now = new Date();
    now.setHours(0,0,0,0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };
  const daysToExam = nextExam ? getDaysLeft(nextExam.date) : null;

  const todayStrStr = new Date().toISOString().split('T')[0];
  const dueCards = flashcards.filter(c => c.nextReview <= todayStrStr);
  const hour = new Date().getHours();
  const isEvening = hour >= 16;

  return (
    <div className={cn(
      "flex flex-col min-h-[100dvh] font-sans overflow-hidden transition-colors duration-300",
      theme === 'paper' ? "theme-paper bg-[#FAF9F6] text-gray-800" : "theme-deep-space bg-[#0A0A0A] text-gray-200"
    )}>
      <AnimatePresence>
        {!isOnline && (
          <motion.div key="offline-toast" initial={{ y: -50 }} animate={{ y: 0 }} exit={{ y: -50 }} className="fixed top-0 inset-x-0 h-6 bg-red-500 text-white text-[10px] font-black uppercase flex items-center justify-center z-[110]">
            Offline Mode — Showing saved content
          </motion.div>
        )}
        {showOnlineStatus && (
          <motion.div key="online-toast" initial={{ y: -50 }} animate={{ y: 0 }} exit={{ y: -50 }} className="fixed top-0 inset-x-0 h-6 bg-green-500 text-white text-[10px] font-black uppercase flex items-center justify-center z-[110]">
            Back online ✅
          </motion.div>
        )}
        {celebrate && (
          <motion.div key="celebrate-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-purple-600/20 backdrop-blur-sm">
            <div className="text-center space-y-4">
              <h1 className="text-6xl animate-bounce">🔥</h1>
              <h2 className="text-4xl font-black uppercase tracking-tighter">Day Champion!</h2>
              <p className="text-sm font-black uppercase tracking-widest">Aapne aaj 5 doubts solve kiye!</p>
              <button onClick={() => setCelebrate(false)} className="pointer-events-auto mt-8 px-8 py-4 bg-white text-black rounded-full font-black uppercase tracking-widest">Shukriya!</button>
            </div>
          </motion.div>
        )}
        {milestoneReached && (
          <ConfirmDialog 
            key="milestone-dialog"
            title="Milestone Reached! 🏆" 
            msg={`Badhai ho! Aapne ${milestoneReached} dino ka streak complete kiya hai! Keep it up.`} 
            onConfirm={() => setMilestoneReached(null)} 
            onCancel={() => setMilestoneReached(null)} 
          />
        )}
        {showPrivacy && (
          <div key="privacy-overlay" className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 text-center">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#121212] border border-white/10 p-8 rounded-[3rem] space-y-6 max-w-sm">
              <Shield className="w-16 h-16 text-green-500 mx-auto" />
              <h2 className="text-3xl font-black uppercase tracking-tighter">Your Data is Safe</h2>
              <p className="text-sm text-gray-500 leading-relaxed font-medium">N-CODE aapki privacy ka dhyan rakhta hai. Aapka saari progress aur history sirf aapke local device mein store hoti hai.</p>
              <button 
                onClick={() => { safeSet(STORAGE_KEYS.privacy, 'true'); setShowPrivacy(false); }} 
                className="w-full py-5 bg-white text-black rounded-3xl font-black uppercase tracking-widest text-xs"
              >
                I Understand & Start
              </button>
            </motion.div>
          </div>
        )}
        {errorToast && (
          <motion.div key="error-toast" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] bg-red-600 text-white px-6 py-3 rounded-full font-black uppercase text-[10px] tracking-widest shadow-2xl">
            {errorToast}
          </motion.div>
        )}
        {successToast && (
          <motion.div key="success-toast" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-6 py-3 rounded-full font-black uppercase text-[10px] tracking-widest shadow-2xl flex items-center gap-2">
            {successToast}
          </motion.div>
        )}
        {showAddExam && (
          <AddExamModal 
            key="add-exam-modal"
            onClose={() => setShowAddExam(false)} 
            onSave={(exam: Exam) => {
              if (exams.length >= 10) {
                setErrorToast("Maximum 10 exams hi add kar sakte ho!");
                setTimeout(() => setErrorToast(null), 3000);
                return;
              }
              const updatedExams = [...exams, exam].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
              setExams(updatedExams);
              setShowAddExam(false);
              setSuccessToast("Exam add ho gaya! ✅");
              setTimeout(() => setSuccessToast(null), 2000);
            }} 
          />
        )}
        {showEditProfile && (
          <EditProfileModal 
            key="edit-profile-modal"
            user={user} 
            onClose={() => setShowEditProfile(false)} 
            onSave={(updated) => {
              const sanitizedUser = {
                ...updated,
                name: sanitizeInput(updated.name),
                subjects: updated.subjects.map(s => sanitizeInput(s))
              };
              setUser(sanitizedUser);
              safeSet(STORAGE_KEYS.profile, sanitizedUser);
              safeSet(STORAGE_KEYS.user, sanitizedUser);
              setShowEditProfile(false);
              setSuccessToast("Profile update ho gaya! ✅");
              setTimeout(() => setSuccessToast(null), 3000);
            }} 
          />
        )}

        {/* Feature 1: Spaced Repetition Overlay Screen */}
        {isReviewMode && dueCards.length > 0 && (
          <Suspense fallback={<LoadingDots />}>
            <FlashcardReview
              dueCards={dueCards}
              currentReviewIndex={currentReviewIndex}
              setCurrentReviewIndex={setCurrentReviewIndex}
              showAnswer={showAnswer}
              setShowAnswer={setShowAnswer}
              setIsReviewMode={setIsReviewMode}
              handleReviewRating={handleReviewRating}
            />
          </Suspense>
        )}

        {/* Feature 1: Spaced Repetition Complete Overlay */}
        {showReviewCompletedOverlay && (
          <div key="review-completed-overlay" className="fixed inset-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-md flex items-center justify-center p-6 text-center select-none">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#121212] border border-white/5 p-8 rounded-[3rem] space-y-6 max-w-sm w-full shadow-2xl">
              <div className="w-16 h-16 bg-purple-500/10 text-purple-400 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
                🎉
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Review Complete!</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Shabash! Aapne saari cards review kar li hain.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 py-2">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-center">
                  <p className="text-[8px] font-black uppercase tracking-wider text-gray-500">Cards Done</p>
                  <p className="text-xl font-black text-white mt-1">{completedReviewsCount}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-center">
                  <p className="text-[8px] font-black uppercase tracking-wider text-gray-500">Retention Rate</p>
                  <p className="text-xl font-black text-green-400 mt-1">{getRetentionRate()}%</p>
                </div>
              </div>

              <div className="bg-purple-500/5 border border-purple-500/10 p-4 rounded-2xl text-center">
                <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Agle Scheduled Cards</p>
                <p className="text-xs text-white/70 font-bold mt-1">{getCardsDueTomorrow()} cards scheduled for tomorrow</p>
              </div>

              <button 
                onClick={() => {
                  setShowReviewCompletedOverlay(false);
                  setCompletedReviewsCount(0);
                }}
                className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]"
              >
                Vapas Study Page Pe Jao
              </button>
            </motion.div>
          </div>
        )}

        {/* Feature 2: Daily 10-Minute Challenge Overlay */}
        {isChallengeMode && challenge && (
          <Suspense fallback={<LoadingDots />}>
            <DailyChallenge
              challenge={challenge}
              challengeCurrentIndex={challengeCurrentIndex}
              setChallengeCurrentIndex={setChallengeCurrentIndex}
              challengeAnswers={challengeAnswers}
              setChallengeAnswers={setChallengeAnswers}
              challengeTimer={challengeTimer}
              setConfirmModal={setConfirmModal}
              completeChallenge={completeChallenge}
              setIsChallengeMode={setIsChallengeMode}
              submitChallengeAndShowResults={submitChallengeAndShowResults}
            />
          </Suspense>
        )}

        {/* Feature 2: Daily Challenge Completed Overlay */}
        {showChallengeCompletedOverlay && challenge && (
          <div key="challenge-completed-overlay" className="fixed inset-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-md flex items-center justify-center p-6 overflow-y-auto">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#121212] border border-white/5 p-6 rounded-[2.5rem] space-y-6 max-w-sm w-full shadow-2xl my-auto">
              <div className="text-center space-y-2">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center mx-auto text-3xl",
                  (challenge.score || 0) >= 3 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                )}>
                  {(challenge.score || 0) >= 3 ? "🏆" : "💪"}
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white">
                  {(challenge.score || 0) >= 3 ? "Brilliant Score!" : "Keep Improving!"}
                </h2>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                  {(challenge.score || 0) >= 3 ? "Aapne aaj kamaal kar diya!" : "Koi baat nahi, agli baar behter hoga!"}
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-4 rounded-xl text-center border border-white/5">
                  <p className="text-[8px] font-black text-gray-500 uppercase">Correct Answers</p>
                  <p className="text-lg font-black text-white mt-1">{challenge.score}/5</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl text-center border border-white/5">
                  <p className="text-[8px] font-black text-gray-500 uppercase">Time taken</p>
                  <p className="text-lg font-black text-white mt-1">{challenge.timeTaken || "0:00"}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl text-center border border-white/5">
                  <p className="text-[8px] font-black text-gray-500 uppercase">Current Streak</p>
                  <p className="text-lg font-black text-orange-400 mt-1">{challengeStreak.currentStreak} 🔥</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl text-center border border-white/5">
                  <p className="text-[8px] font-black text-gray-500 uppercase">Best Streak</p>
                  <p className="text-lg font-black text-purple-400 mt-1">{challengeStreak.bestStreak} 🔥</p>
                </div>
              </div>

              {/* Calendar Dots */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
                <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest text-center">Last 7 Days History</p>
                <div className="flex justify-center gap-2">
                  {getLastSevenDaysHistory().map((dot, idx) => (
                    <div key={`dot-${idx}`} className="text-lg" title={dot.date}>
                      {dot.icon}
                    </div>
                  ))}
                </div>
              </div>

              {/* Badges unlocked section */}
              {challengeStreak.badges.length > 0 && (
                <div className="bg-purple-500/5 border border-purple-500/10 p-4 rounded-xl space-y-2 text-center">
                  <p className="text-[8px] font-black text-purple-400 uppercase tracking-widest">Unlocked Badges 🎖️</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {challengeStreak.badges.slice(-2).map((badge, bIdx) => (
                      <span key={`badge-${bIdx}`} className="bg-purple-600/20 text-purple-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border border-purple-500/25">
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Explanations if some questions were incorrect */}
              {challenge.questions.some((q, idx) => !isAnswerCorrect(q, challengeAnswers[idx] || '')) && (
                <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                  <p className="text-[8px] font-black text-red-400 uppercase tracking-widest">Answers Review & Explanation</p>
                  <div className="space-y-3 max-h-[150px] overflow-y-auto pr-1">
                    {challenge.questions.map((q, idx) => {
                      const userAns = challengeAnswers[idx] || 'No Answer';
                      const correct = isAnswerCorrect(q, userAns);
                      if (correct) return null;
                      return (
                        <div key={`explanation-item-${idx}`} className="space-y-1 text-left border-l-2 border-red-500/50 pl-3 py-1 bg-red-500/5 rounded-r-lg">
                          <p className="text-[9px] text-gray-400 font-black">Q{idx + 1}: {q.question}</p>
                          <p className="text-[9px] text-red-400">Aapka jawab: <strong>{userAns}</strong></p>
                          <p className="text-[9px] text-green-400">Sahi jawab: <strong>{q.answer}</strong></p>
                          <p className="text-[9px] text-gray-500 leading-normal italic">{q.explanation}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <button 
                  onClick={() => {
                    const score = challenge.score || 0;
                    const text = `N-CODE Daily Challenge mein maine ${score}/5 score kiya! 🔥 Streak is ${challengeStreak.currentStreak} Days. Can you beat my score? Join N-CODE! 🚀`;
                    window.open(`whatsapp://send?text=${encodeURIComponent(text)}`);
                  }}
                  className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                >
                  WhatsApp pe Share Karo 🚀
                </button>
                <button 
                  onClick={() => setShowChallengeCompletedOverlay(false)}
                  className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl font-black uppercase tracking-widest text-[10px]"
                >
                  Vapas Study Page Pe Jao
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {confirmModal && <ConfirmDialog key="confirm-modal" {...confirmModal} onCancel={() => setConfirmModal(null)} />}
        {nudge && <Nudge key="nudge" text={nudge} />}
      </AnimatePresence>

      <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 bg-[#0A0A0A]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {currentMode !== 'selection' ? (
            <button onClick={() => { saveChat(); setCurrentMode('selection'); }} className="p-2 -ml-2 hover:bg-white/5 rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] text-white" style={{ backgroundColor: user.avatarColor || '#7F77DD' }}>{getInitials(user.name)}</div>}
          <div className="leading-none">
            <h1 className="font-black tracking-tighter uppercase">{currentMode === 'selection' ? 'N-CODE' : modeToLabel(currentMode)}</h1>
            <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Namaste, {user.name.split(' ')[0]}!</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 flex items-center justify-center transition-all duration-300"
            title={theme === 'deep-space' ? "Switch to Paper Light Mode" : "Switch to Deep Space Dark Mode"}
          >
            {theme === 'deep-space' ? (
              <Sun className="w-4 h-4 text-yellow-400" />
            ) : (
              <Moon className="w-4 h-4 text-purple-600" />
            )}
          </button>
          {currentMode !== 'selection' && (
            <button onClick={() => setConfirmModal({ title: "New Chat?", msg: "Current chat library mein save ho jayegi.", action: () => { saveChat(); handleModeSelect(currentMode); setConfirmModal(null); } })} className="text-[9px] font-black uppercase tracking-widest bg-white/5 px-3 py-2 rounded-full border border-white/5 flex items-center gap-2">
              <RefreshCcw className="w-3 h-3" /> New Chat
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'study' && (
            <motion.div key="study" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 h-full">
                {nextExam && daysToExam !== null && (
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={() => setActiveTab('tips')}
                    className="bg-gradient-to-r from-purple-900 to-indigo-900 p-6 rounded-[2.5rem] mb-4 flex items-center justify-between border border-white/10 shadow-2xl cursor-pointer group hover:scale-[1.02] transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                        <Clock className="w-6 h-6 text-purple-400 group-hover:rotate-12 transition-transform" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">⏳ {daysToExam} days to {nextExam.name}</p>
                        <h3 className="text-sm font-black uppercase">Aaj padho: <span className="text-purple-400 underline underline-offset-4 decoration-white/20">{dailyFocus}</span></h3>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-white/20 group-hover:translate-x-1 transition-transform" />
                  </motion.div>
                )}
                {currentMode === 'selection' && (
                  <div className="flex flex-col gap-4">
                    {/* Feature 2: Daily Challenge Banner */}
                    {challenge && (!challenge.done ? (
                      <div className={cn(
                        "p-6 rounded-[2rem] border flex items-center justify-between group cursor-pointer transition-all hover:scale-[1.01] active:scale-95 shadow-lg border-white/5",
                        isEvening 
                          ? "bg-gradient-to-r from-red-950/20 via-[#1A1115] to-[#121212] border-red-500/20" 
                          : "bg-gradient-to-r from-purple-950/20 via-[#13111A] to-[#121212] border-purple-500/10"
                      )}
                      onClick={() => {
                        setChallengeCurrentIndex(0);
                        setChallengeAnswers(Array(challenge.questions?.length || 5).fill(''));
                        setChallengeTimer(600);
                        setChallengeTimerActive(true);
                        setIsChallengeMode(true);
                      }}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 shadow-inner",
                            isEvening ? "bg-red-500/10 text-red-400" : "bg-purple-500/10 text-purple-400"
                          )}>
                            ⚡
                          </div>
                          <div>
                            <p className={cn(
                              "text-[8px] font-black uppercase tracking-widest leading-none",
                              isEvening ? "text-red-400" : "text-purple-400"
                            )}>
                              {isEvening ? "⏰ Din kharab na karo, challenge pura karo!" : "Aaj Ka Challenge Ready!"}
                            </p>
                            <h3 className="text-xs font-black uppercase text-white leading-tight mt-1">5 questions • 10 minutes</h3>
                            <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 leading-none">Your Streak: {challengeStreak.currentStreak || 0} 🔥</p>
                          </div>
                        </div>
                        <button className={cn(
                          "px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-md shrink-0 active:scale-95",
                          isEvening ? "bg-red-600 hover:bg-red-700 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"
                        )}>
                          Chalo Shuru Karein →
                        </button>
                      </div>
                    ) : (
                      <div className="bg-[#121212] border border-white/5 p-6 rounded-[2rem] flex items-center justify-between shadow-lg">
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 bg-green-500/10 text-green-400 rounded-xl flex items-center justify-center font-bold text-lg shrink-0">
                            ✓
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase text-green-400 tracking-widest leading-none">Aaj Ka Challenge Completed!</p>
                            <h3 className="text-xs font-black uppercase text-white/50 leading-tight mt-1">Sahi Jawab: {challenge.score}/5 Done ✨</h3>
                            <p className="text-[9px] text-gray-500 font-bold uppercase mt-1 leading-none">Streak: {challengeStreak.currentStreak || 0} 🔥</p>
                          </div>
                        </div>
                        <div className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0">
                          {challenge.score}/5 Correct
                        </div>
                      </div>
                    ))}

                    {/* Feature 1: Spaced Repetition System Banner */}
                    {dueCards.length > 0 ? (
                      <div 
                        onClick={() => {
                          setCurrentReviewIndex(0);
                          setShowAnswer(false);
                          setCompletedReviewsCount(0);
                          setIsReviewMode(true);
                        }}
                        className="cursor-pointer bg-gradient-to-r from-purple-950/20 via-[#13111A] to-[#121212] border border-purple-500/10 p-6 rounded-[2rem] flex items-center justify-between shadow-lg hover:scale-[1.01] active:scale-95 transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 bg-purple-500/10 text-purple-400 rounded-xl flex items-center justify-center font-bold text-lg shrink-0">
                            📚
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase text-purple-400 tracking-widest leading-none">Spaced Repetition Flashcards</p>
                            <h3 className="text-xs font-black uppercase text-white leading-tight mt-1">Aaj Ka Revision Ready</h3>
                            <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 leading-none">{dueCards.length} Cards pending to review</p>
                          </div>
                        </div>
                        <button className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 shadow-md">
                          Review Karo →
                        </button>
                      </div>
                    ) : (
                      <div className="bg-[#121212] border border-white/5 p-6 rounded-[2rem] flex items-center gap-4 shadow-lg">
                        <div className="w-11 h-11 bg-white/5 text-gray-400 rounded-xl flex items-center justify-center font-bold text-lg shrink-0">
                          ✨
                        </div>
                        <div>
                          <p className="text-[8px] font-black uppercase text-gray-500 tracking-widest leading-none">Spaced Repetition System</p>
                          <h4 className="text-xs font-black uppercase text-gray-400 mt-1 leading-tight">Koi reviews pending nahi hai!</h4>
                          <p className="text-[9px] text-gray-500 font-medium leading-none mt-1">Padhai chalu rakho, N-CODE flashcards banata rahega.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {currentMode === 'selection' ? (
                  <ModeGrid onSelect={handleModeSelect} streak={stats.dayStreak} />
                ) : (
                  <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-6 pb-40">
                    {messages.map((m, i) => (
                      <div key={`msg-${i}`} className="space-y-4">
                        <MsgBubble 
                          m={m} 
                          index={i}
                          isSpeaking={isSpeaking === i}
                          onSpeak={() => speak(m.content, i)}
                          mode={currentMode}
                          onDownloadPDF={handleDownloadPDF}
                          onSave={() => {
                            setLibrary(p => ({
                              ...p,
                              savedNotes: [{ id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, topic: `Note ${new Date().toLocaleTimeString()}`, content: m.content, date: new Date().toLocaleDateString(), type: currentMode.toUpperCase() }, ...p.savedNotes]
                            }));
                          }} 
                          onWrongAnswer={(topic) => setStats(s => ({ ...s, weakTopics: Array.from(new Set([...s.weakTopics, topic])) }))}
                        />
                        {i === messages.length - 1 && suggestions.length > 0 && !isTyping && (
                          <div className="flex flex-wrap gap-2 px-6">
                            {suggestions.map((s, idx) => (
                              <button key={`sugg-${idx}-${s}`} onClick={() => handleSend(s)} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-gray-400 hover:bg-white/10 hover:text-white transition-all">
                                + {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {isTyping && <LoadingDots />}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'library' && (
            <motion.div key="library" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 overflow-y-auto p-4 space-y-8 pb-32">
              <h2 className="text-3xl font-black uppercase tracking-tighter">Library</h2>
              
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-4">Recent Chats</h4>
                {library.recentChats.length === 0 && <p className="text-xs text-white/10 uppercase font-black ml-4">No recent chats</p>}
                <div className="space-y-4">
                  <AnimatePresence>
                    {library.recentChats.map((c, idx) => (
                      <motion.div 
                        key={c.id ? `chat-${c.id}-${idx}` : `chat-idx-${idx}`} 
                        layout
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0, x: -20 }}
                        onClick={() => { 
                          setCurrentMode(c.mode); 
                          setMessages(c.messages); 
                          setActiveChatId(c.id); 
                          setSuggestions(c.suggestions || []);
                          setActiveTab('study'); 
                        }} 
                        className="bg-white/5 border border-white/5 p-4 rounded-3xl flex items-center justify-between group cursor-pointer hover:bg-white/10 transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-white/5 rounded-2xl">{modeToIcon(c.mode)}</div>
                          <div>
                            <p className="text-sm font-black uppercase truncate max-w-[150px]">{c.topic}</p>
                            <p className="text-[9px] font-black text-white/20 uppercase">{new Date(c.timestamp).toLocaleDateString()} • {c.messages.length} messages</p>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setConfirmModal({ 
                              title: "Ye chat delete?", 
                              msg: "Yeh chat delete karna chahte ho? Wapas nahi aayegi.", 
                              confirmText: "Haan Delete Karo",
                              cancelText: "Raho Rehne Do",
                              danger: true,
                              action: () => { 
                                const updatedChats = library.recentChats.filter(x => x.id !== c.id);
                                const updatedLibrary = { ...library, recentChats: updatedChats };
                                setLibrary(updatedLibrary);
                                safeSet(STORAGE_KEYS.library, updatedLibrary);
                                safeSet(STORAGE_KEYS.chats, updatedChats);
                                setConfirmModal(null);
                                setSuccessToast("Chat delete ho gayi ✅");
                                setTimeout(() => setSuccessToast(null), 2000);
                              } 
                            }); 
                          }} 
                          className="p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-4">Saved Notes & Flashcards</h4>
                {library.savedNotes.length === 0 && <p className="text-xs text-white/10 uppercase font-black ml-4">No saved items</p>}
                <div className="space-y-4">
                  <AnimatePresence>
                    {library.savedNotes.map((n, idx) => (
                      <motion.div 
                        key={n.id ? `note-${n.id}-${idx}` : `note-idx-${idx}`} 
                        layout
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white/5 border border-white/5 p-5 rounded-3xl space-y-3 relative group"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">{n.type} • {n.date}</p>
                            <h3 className="text-sm font-black uppercase">{n.topic}</h3>
                          </div>
                          <button 
                            onClick={() => setConfirmModal({ 
                              title: "Delete Note?", 
                              msg: "Yeh note delete karna chahte ho? Wapas nahi aayegi.", 
                              confirmText: "Haan Delete Karo",
                              cancelText: "Raho Rehne Do",
                              danger: true,
                              action: () => { 
                                const updatedNotes = library.savedNotes.filter(x => x.id !== n.id);
                                const updatedLibrary = { ...library, savedNotes: updatedNotes };
                                setLibrary(updatedLibrary);
                                safeSet(STORAGE_KEYS.library, updatedLibrary);
                                setConfirmModal(null);
                                setSuccessToast("Note delete ho gayi ✅");
                                setTimeout(() => setSuccessToast(null), 2000);
                              } 
                            })} 
                            className="p-2 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-3 italic leading-relaxed markdown-body">
                          <SecureHTML content={n.content} />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'tips' && (
            <motion.div key="tips" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 overflow-y-auto p-4 space-y-8 pb-32">
              <div className="flex justify-between items-center px-4">
                <h2 className="text-3xl font-black tracking-tighter uppercase leading-none">Exams <br/><span className="text-white/20">& Tools</span></h2>
                <button 
                  onClick={() => setShowAddExam(true)} 
                  className="p-4 bg-purple-600 text-white rounded-full font-black uppercase text-[10px] tracking-widest shadow-lg shadow-purple-900/40 active:scale-95 transition-all"
                >
                  Add My Exam
                </button>
              </div>

              <div className="space-y-4 px-2">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">My Countdowns</h4>
                {exams.length === 0 ? (
                  <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-10 text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                      <Clock className="w-8 h-8 text-white/20" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black uppercase">Koi exam add nahi kiya abhi 📅</p>
                      <p className="text-[10px] font-bold text-gray-500 uppercase">Apna next exam add karo aur countdown shuru karo!</p>
                    </div>
                    <button 
                      onClick={() => setShowAddExam(true)}
                      className="px-8 py-4 bg-white/10 rounded-full font-black uppercase text-[10px] tracking-widest hover:bg-white/20 transition-all"
                    >
                      + Add First Exam
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {exams.map((ex, idx) => (
                      <ExamCountdownCard 
                        key={ex.id ? `exam-${ex.id}-${idx}` : `exam-idx-${idx}`} 
                        ex={ex} 
                        onDelete={() => {
                          setConfirmModal({
                            title: "Hata dein?",
                            msg: "Yeh exam hatana chahte ho?",
                            danger: true,
                            confirmText: "Haan, Hatao",
                            cancelText: "Cancel",
                            action: () => {
                              const updated = exams.filter(e => e.id !== ex.id);
                              setExams(updated);
                              setConfirmModal(null);
                              setSuccessToast("Exam hata diya ✅");
                              setTimeout(() => setSuccessToast(null), 2000);
                            }
                          });
                        }} 
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4 px-2">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">Smart Strategies</h4>
                <div className="space-y-4">
                  {EXAMS.map(e => <ExamCard key={e.title} e={e} onAsk={() => { setCurrentMode('exam_chat'); setMessages([]); handleSend(`Help me with ${e.title} strategies.`); setActiveTab('study'); }} />)}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 overflow-y-auto p-4 space-y-8 pb-32">
              <div className="p-8 bg-white/5 border border-white/10 rounded-[3rem] text-center space-y-4">
                <div 
                  className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-3xl font-black text-white shadow-2xl relative group"
                  style={{ backgroundColor: user.avatarColor || '#7F77DD' }}
                >
                  {getInitials(user.name)}
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter">{user.name}</h3>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{user.email}</p>
                  <p className="text-xs text-purple-400 font-bold uppercase mt-1">{user.gradePreference}</p>
                  <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mt-0.5">Language: {user.language}</p>
                </div>

                <div className="flex justify-center flex-wrap gap-2 pt-2">
                  <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-base font-black leading-none">{stats.topicsExplored}</p>
                    <p className="text-[8px] font-black uppercase text-white/20 tracking-widest">Topics</p>
                  </div>
                  <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-base font-black leading-none">{stats.mcqsGenerated}</p>
                    <p className="text-[8px] font-black uppercase text-white/20 tracking-widest">MCQs</p>
                  </div>
                  <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-base font-black leading-none">{library.savedNotes.length}</p>
                    <p className="text-[8px] font-black uppercase text-white/20 tracking-widest">Notes</p>
                  </div>
                  <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-base font-black leading-none">{stats.dayStreak}🔥</p>
                    <p className="text-[8px] font-black uppercase text-white/20 tracking-widest">Streak</p>
                  </div>
                </div>

                {user.subjects && user.subjects.length > 0 && (
                  <div className="pt-4">
                    <p className="text-[10px] font-black uppercase text-purple-400 tracking-widest">
                      {user.subjects.join(' • ')}
                    </p>
                  </div>
                )}

                <button 
                  onClick={() => setShowEditProfile(true)}
                  className="w-full mt-6 py-5 bg-purple-600 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-lg shadow-purple-900/40 active:scale-95 transition-all"
                >
                  Edit Profile
                </button>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-4">Mastery Stats</h4>
                <div className="grid grid-cols-2 gap-4">
                  <StatBox label="Topics Explored" val={stats.topicsExplored} icon={BookOpen} />
                  <StatBox label="MCQs Answered" val={stats.mcqsGenerated} icon={Award} />
                  <StatBox label="Best Streak" val={stats.bestStreak} icon={TrendingUp} />
                  <StatBox label="Notes Saved" val={library.savedNotes.length} icon={Save} />
                  <StatBox label="Total Flashcards" val={flashcards.length} icon={Layers} />
                  <StatBox label="Reviewed Today" val={stats.flashcardsReviewedToday || 0} icon={Bookmark} />
                  <StatBox label="Challenge Streak" val={challengeStreak.currentStreak} icon={Flame} />
                  <StatBox label="Challenge Best" val={challengeStreak.bestStreak} icon={TrendingUp} />
                </div>
              </div>

              {stats.weakTopics.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center ml-4">
                    <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Weak Topics (Revise)</h4>
                    <button onClick={() => setStats(s => ({ ...s, weakTopics: [] }))} className="text-[8px] font-black text-white/20 uppercase tracking-widest mr-4">Clear All</button>
                  </div>
                  <div className="space-y-3">
                    {stats.weakTopics.slice(0, 5).map((t, idx) => (
                      <div key={`weak-${idx}-${t}`} className="bg-white/5 border border-white/5 p-4 rounded-3xl flex justify-between items-center group">
                        <p className="text-[10px] font-black uppercase truncate max-w-[150px]">{t}</p>
                        <button onClick={() => { setCurrentMode('quick_revision'); handleSend(t); setActiveTab('study'); }} className="px-4 py-2 bg-white text-black rounded-full text-[8px] font-black uppercase">Revise</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-4">Performance Report</h4>
                <button onClick={() => {
                  const report = `*N-CODE Performance Report*\n\nStudent: ${user.name}\nGrade: ${user.gradePreference}\nStreak: ${stats.dayStreak} Days\nTopics Studied: ${stats.topicsExplored}\nWeak Areas: ${stats.weakTopics.length > 0 ? stats.weakTopics.join(', ') : 'None'}\n\nKeep growing! #NCODEChampion`;
                  const url = `whatsapp://send?text=${encodeURIComponent(report)}`;
                  window.open(url);
                }} className="w-full py-5 bg-white/5 border border-white/10 rounded-[2.5rem] flex items-center justify-center gap-3 group transition-all hover:bg-white/10">
                  <Award className="w-5 h-5 text-purple-500" />
                  <span className="text-xs font-black uppercase tracking-widest">Share Report to Parents</span>
                </button>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-4">App Settings</h4>
                <button onClick={() => alert("To install N-CODE:\n\n1. Open in Browser (not iframe)\n2. Tap 'Share' button (iOS) or 3 dots (Android)\n3. Select 'Add to Home Screen'.")} className="w-full py-5 bg-white/5 border border-white/10 rounded-[2.5rem] flex items-center justify-center gap-3">
                  <GraduationCap className="w-5 h-5 text-amber-500" />
                  <span className="text-xs font-black uppercase tracking-widest">Install N-CODE App</span>
                </button>
              </div>

              <button onClick={() => setConfirmModal({ title: "Logout?", msg: "Aapki saari learning history reset ho jayegi.", action: () => { localStorage.clear(); window.location.reload(); } })} className="w-full py-5 bg-red-500/10 text-red-500 rounded-3xl font-black uppercase tracking-[0.2em] border border-red-500/10">Sign Out</button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {activeTab === 'study' && currentMode !== 'selection' && (
        <div className="fixed bottom-24 inset-x-4 max-w-xl mx-auto z-40 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-4">Current Mode:</span>
            <div className="bg-white/10 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter text-white flex items-center gap-1.5 border border-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {modeToLabel(currentMode)}
            </div>
          </div>
          {attachedImage && (
            <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
              <img src={attachedImage} className="w-full h-full object-cover" />
              <button onClick={() => setAttachedImage(null)} className="absolute top-1 right-1 bg-black/50 p-1 rounded-full"><X className="w-3 h-3" /></button>
            </div>
          )}
          <form className="bg-white/10 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-1 flex items-center gap-1 shadow-2xl" onSubmit={e => { e.preventDefault(); handleSend(); }}>
            <button type="button" onClick={toggleVoice} className={cn("p-4 transition-all rounded-full", isRecording ? "text-red-500 bg-red-500/10" : "text-gray-400 hover:bg-white/5")}>
              <div className="w-5 h-5 flex items-center justify-center">
                {isRecording ? <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)]" /> : <MessageSquare className="w-5 h-5"/>}
              </div>
            </button>
            <button type="button" onClick={() => document.getElementById('camera-capture-input')?.click()} className="p-4 text-gray-400">
              <Camera className="w-5 h-5"/>
              <input 
                id="camera-capture-input" 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                onChange={handleCameraCapture} 
              />
            </button>
            <button type="button" onClick={() => document.getElementById('fl')?.click()} className="p-4 text-gray-400"><Paperclip className="w-5 h-5"/><input id="fl" type="file" className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if(f){ const r=new FileReader(); r.onload=()=>setAttachedImage(r.result as string); r.readAsDataURL(f); }}} /></button>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder={getPlaceholder(currentMode)} className="flex-1 bg-transparent py-4 text-sm outline-none px-2 font-bold focus:text-white" />
            <button type="submit" disabled={(!input.trim() && !attachedImage) || isTyping} className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-all", input || attachedImage ? "bg-white text-black" : "bg-white/5 text-white/20")}><Send className="w-5 h-5"/></button>
          </form>
        </div>
      )}

      <nav className="h-20 border-t border-white/5 flex items-center justify-around bg-[#0A0A0A]/90 backdrop-blur-xl shrink-0">
        <NavBtn icon={BookOpen} label="Study" active={activeTab === 'study'} onClick={() => setActiveTab('study')} />
        <NavBtn icon={GraduationCap} label="Library" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
        <NavBtn icon={Zap} label="Tips" active={activeTab === 'tips'} onClick={() => setActiveTab('tips')} />
        <NavBtn icon={User} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
      </nav>
    </div>
  );
}

function NavBtn({ icon: Icon, label, active, onClick }: any) {
  return (
    <motion.button 
      whileTap={{ scale: 0.9 }}
      onClick={onClick} 
      className={cn("flex flex-col items-center gap-1 transition-all", active ? "text-white" : "text-gray-600")}
    >
      <Icon className={cn("w-5 h-5", active && "stroke-[3px]")} />
      <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
    </motion.button>
  );
}

function StatBox({ label, val, icon: Icon }: any) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-white/5 border border-white/5 p-5 rounded-[2rem] space-y-1"
    >
      <Icon className="w-5 h-5 text-white/20 mb-2" />
      <p className="text-2xl font-black">{val}</p>
      <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">{label}</p>
    </motion.div>
  );
}

function ModeGrid({ onSelect, streak }: any) {
  const modes = [
    { id: 'explain', title: 'Explain Topic', icon: Sparkles, color: 'text-amber-400', desc: 'Samajhna aasaan hai' },
    { id: 'mcq', title: 'Make MCQs', icon: HelpCircle, color: 'text-blue-400', desc: 'Mock Tests ready' },
    { id: 'notes', title: 'Quick Notes', icon: FileText, color: 'text-green-400', desc: 'Exam ready points' },
    { id: 'solve', title: 'Solve It', icon: Calculator, color: 'text-rose-400', desc: 'Photo/Equation solve' },
    { id: 'quick_revision', title: 'Quick Revision', icon: Zap, color: 'text-purple-400', desc: 'Sirf 5 min hai' }
  ];
  return (
    <div className="p-0 space-y-8 h-full">
      <div className="flex justify-between items-center mt-4">
        <h2 className="text-4xl font-black tracking-tighter uppercase leading-none">Padhai <br/><span className="text-white/20">Chalu Karein?</span></h2>
        <div className="bg-white/5 px-4 py-3 rounded-full border border-white/10 flex items-center gap-2">
          <span className="text-xl">🔥</span>
          <span className="text-sm font-black italic">{streak}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 overflow-y-auto pb-40">
        {modes.map(m => (
          <button key={m.id} onClick={() => onSelect(m.id)} className="bg-white/5 p-6 rounded-[2rem] border border-white/5 flex items-center gap-6 group hover:border-white/20 transition-all text-left">
            <div className={cn("p-4 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform", m.color)}><m.icon className="w-8 h-8"/></div>
            <div><h3 className="text-xl font-black uppercase tracking-tight">{m.title}</h3><p className="text-[10px] text-gray-500 font-bold uppercase">{m.desc}</p></div>
          </button>
        ))}
      </div>
    </div>
  );
}

const MsgBubble = React.memo(function MsgBubble({ m, index, isSpeaking, onSpeak, onSave, mode, onWrongAnswer, onDownloadPDF }: { m: Message, index: number, isSpeaking: boolean, onSpeak: () => void, onSave: () => void, mode: Mode, onWrongAnswer: (t: string) => void, onDownloadPDF: (content: string, mode: Mode) => void }) {
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string>>({});
  const [showExplanations, setShowExplanations] = useState<Record<number, boolean>>({});
  const isUser = m.role === 'user';
  
  const parseMCQ = (text: string) => {
    const questions: any[] = [];
    const qBlocks = text.split(/Q\d+\.?/i);
    qBlocks.forEach(block => {
      if (!block.trim()) return;
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 3) return;
      
      const question = lines[0];
      const optionsList = lines.filter(l => /^[A-D](\)|\.|\s)/i.test(l) || /^\([A-D]\)/i.test(l));
      
      const answerLine = lines.find(l => l.toLowerCase().startsWith('answer:'));
      const answer = answerLine ? answerLine.split(':')[1]?.trim().toUpperCase().charAt(0) : null;
      
      const expLine = lines.find(l => l.toLowerCase().startsWith('explanation:'));
      const explanation = expLine ? expLine.split(':')[1]?.trim() : null;
      
      if (question && optionsList.length === 4) {
        const optionsDict: Record<string, string> = {};
        optionsList.forEach(opt => {
          const cleanOpt = opt.replace(/^[A-D](\)|\.|\s)\s*/i, '').replace(/^\([A-D]\)\s*/i, '').trim();
          const match = opt.match(/^([A-D])/i) || opt.match(/^\(([A-D])\)/i);
          if (match) {
            const letter = match[1].toUpperCase();
            optionsDict[letter] = cleanOpt;
          }
        });
        if (Object.keys(optionsDict).length === 4) {
          questions.push({ question, options: optionsDict, answer, explanation });
        }
      }
    });
    return questions;
  };

  const mcqs = mode === 'mcq' && !isUser ? parseMCQ(m.content) : [];

  const handleMCQ = (qIdx: number, opt: string, correctOpt: string | null, questionText: string) => {
    if (selectedOptions[qIdx]) return;
    setSelectedOptions(prev => ({ ...prev, [qIdx]: opt }));
    setShowExplanations(prev => ({ ...prev, [qIdx]: true }));
    if (correctOpt && opt !== correctOpt) {
      onWrongAnswer(questionText);
    }
  };

  const getCleanedContent = () => {
    if (mode === 'mcq' && !isUser) {
      return m.content
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          if (/^[A-D](\)|\.)/i.test(trimmed) || /^\([A-D]\)/i.test(trimmed)) return false;
          if (trimmed.toLowerCase().startsWith('answer:')) return false;
          if (trimmed.toLowerCase().startsWith('explanation:')) return false;
          if (trimmed.toLowerCase().startsWith('topic:')) return false;
          return true;
        })
        .join('\n');
    }
    return m.content;
  };

  const copyToClipboard = () => {
    const cleanText = m.content.replace(/[*#]/g, '').replace(/RELATED: .*/i, '').trim();
    navigator.clipboard.writeText(cleanText);
    alert("Clean text copy ho gaya! ✅");
  };

  const shareChat = () => {
    const text = `N-CODE Challenge! 🚀\n\nQuestion: ${m.content.slice(0, 100)}...\n\nCan you solve it? Join N-CODE!`;
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    window.open(url);
  };

  const saveAsFlashcard = () => {
    onSave();
    alert("Saved to Library as a Flashcard! ⚡");
  };

  return (
    <div className={cn("max-w-[85%] flex flex-col gap-1", isUser ? "ml-auto" : "mr-auto")}>
      <div className={cn("px-6 py-4 rounded-[3rem] text-sm leading-relaxed border shadow-xl relative group", isUser ? "bg-white/10 text-white border-white/10 rounded-tr-none" : "bg-[#1a1a1a] text-gray-300 border-white/5 rounded-tl-none")}>
        <div className="markdown-body">
          {isUser ? (
            <p>{m.content}</p>
          ) : (
            <SecureHTML content={getCleanedContent()} />
          )}
          
          {mode === 'quick_revision' && !isUser && (
            <div className="space-y-2 mt-4">
              <button onClick={saveAsFlashcard} className="w-full py-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95">
                <Zap className="w-3 h-3 text-purple-400" /> Save as Flashcard
              </button>
              <button onClick={() => onDownloadPDF(m.content, mode)} className="w-full py-3 bg-purple-600 text-white rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all active:scale-95">
                <FileText className="w-3 h-3" /> 📄 Flashcard PDF Banao
              </button>
            </div>
          )}

          {mode === 'notes' && !isUser && (
            <button onClick={() => onDownloadPDF(m.content, mode)} className="mt-4 w-full py-3 bg-purple-600 text-white rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all active:scale-95 shadow-lg shadow-purple-900/20">
              <FileText className="w-3 h-3" /> 📄 PDF Download Karo
            </button>
          )}

          {mcqs.length > 0 && (
            <div className="mt-8 space-y-8">
              {mcqs.map((q, qIdx) => (
                <div key={qIdx} className="space-y-4 p-4 bg-white/5 rounded-3xl border border-white/5">
                  <p className="font-black text-white italic">Q. {q.question}</p>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(q.options).map(([key, val]) => (
                      <button 
                        key={key} 
                        disabled={!!selectedOptions[qIdx]}
                        onClick={() => handleMCQ(qIdx, key, q.answer, q.question)}
                        className={cn(
                          "p-4 rounded-2xl text-left text-xs font-bold transition-all border flex items-center gap-3",
                          selectedOptions[qIdx] === key 
                            ? (key === q.answer ? "bg-green-500/20 border-green-500 text-green-500" : "bg-red-500/20 border-red-500 text-red-500")
                            : (selectedOptions[qIdx] && key === q.answer ? "bg-green-500/20 border-green-500 text-green-500" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10")
                        )}
                      >
                        <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">{key}</span>
                        {val as string}
                      </button>
                    ))}
                  </div>
                  {showExplanations[qIdx] && q.explanation && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="pt-4 border-t border-white/5 space-y-2">
                      <p className="text-[10px] font-black uppercase text-white/40">Explanation</p>
                      <p className="text-xs italic text-gray-400 font-medium">{q.explanation}</p>
                      <button onClick={shareChat} className="w-full py-3 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        Challenge a Friend (WhatsApp)
                      </button>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {!isUser && (
          <div className="absolute top-1/2 -right-12 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
            <button onClick={copyToClipboard} title="Copy" className="p-2 bg-white/5 rounded-full hover:bg-white/10"><Copy className="w-3 h-3"/></button>
            <button onClick={onSave} title="Save to Library" className="p-2 bg-white/5 rounded-full hover:bg-white/10"><Save className="w-3 h-3"/></button>
            <button onClick={onSpeak} title="Listen" className={cn("p-2 bg-white/5 rounded-full hover:bg-white/10", isSpeaking && "animate-pulse bg-purple-500/20")}><MessageSquare className="w-3 h-3"/></button>
          </div>
        )}
      </div>
    </div>
  );
});

function SecureHTML({ content }: { content: string }) {
  const sanitized = DOMPurify.sanitize(marked.parse(content) as string, {
    ALLOWED_TAGS: ['div', 'p', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'span', 'br'],
    ALLOWED_ATTR: ['class']
  });
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}

function LoadingDots() {
  return (
    <div className="flex flex-col gap-2 px-6">
      <div className="flex gap-2 items-center text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
        <motion.div className="flex gap-1">
          <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-2 h-2 bg-purple-500 rounded-full"/>
          <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-purple-500 rounded-full"/>
          <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-purple-500 rounded-full"/>
        </motion.div>
        N-CODE thinking...
      </div>
    </div>
  );
}

function ExamCard({ e, onAsk }: any) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-6 space-y-4" onClick={() => setOpen(!open)}>
      <div className="flex justify-between items-center"><h3 className="text-2xl font-black uppercase tracking-tighter">{e.title}</h3><TrendingUp className="w-5 h-5 text-white/20" /></div>
      {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-4 pt-4 border-t border-white/5 text-xs text-gray-400 font-bold leading-relaxed">{e.content}<button onClick={(ex) => { ex.stopPropagation(); onAsk(); }} className="w-full py-4 mt-2 bg-white text-black rounded-2xl font-black uppercase">Ask AI Strategy</button></motion.div>}
    </div>
  );
}

function ExamCountdownCard({ ex, onDelete }: { ex: Exam, onDelete: () => void, key?: string }) {
  const getDaysLeft = (dateStr: string) => {
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const now = new Date();
    now.setHours(0,0,0,0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };
  const daysLeft = getDaysLeft(ex.date);
  
  let colorClass = "from-green-600 to-emerald-600";
  let borderClass = "border-green-500/20";
  if (daysLeft < 7) {
    colorClass = "from-red-600 to-rose-600";
    borderClass = "border-red-500/20";
  } else if (daysLeft < 30) {
    colorClass = "from-orange-600 to-amber-600";
    borderClass = "border-orange-500/20";
  }

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("p-6 rounded-[2.5rem] border bg-gradient-to-br flex flex-col justify-between relative overflow-hidden", colorClass, borderClass)}
    >
      <div className="relative z-10 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="text-2xl font-black uppercase tracking-tighter text-white">🎯 {ex.name}</h4>
            <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">📅 {new Date(ex.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="bg-black/20 backdrop-blur-md px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white/80">
            {ex.subject}
          </div>
        </div>
        
        <div className="flex justify-between items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Countdown</p>
            <p className="text-3xl font-black uppercase italic text-white leading-none">⏳ {daysLeft} Days <span className="text-sm not-italic opacity-60">remaining</span></p>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }} 
            className="p-3 bg-black/20 hover:bg-black/40 rounded-2xl text-white/60 hover:text-white transition-all active:scale-90"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12">
        <Clock className="w-32 h-32 text-white" />
      </div>
    </motion.div>
  );
}

function AddExamModal({ onClose, onSave }: { onClose: () => void, onSave: (ex: Exam) => void, key?: string }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [subject, setSubject] = useState('All Subjects');

  const handleSave = () => {
    if (!name.trim() || !date) {
      alert("Sahi naam aur future date daalo");
      return;
    }
    const examDate = new Date(date);
    const today = new Date();
    today.setHours(0,0,0,0);
    if (examDate < today) {
      alert("Sahi naam aur future date daalo");
      return;
    }

    onSave({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      date,
      subject,
      addedOn: new Date().toISOString()
    });
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-center justify-center p-6" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-[#121212] border border-white/10 p-8 rounded-[3rem] w-full max-w-sm space-y-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="space-y-1 text-center">
          <h3 className="text-3xl font-black tracking-tighter uppercase">Naya Exam Add Karein</h3>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Apna countdown shuru karein</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Exam ka Naam</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="JEE Main, NEET, CBSE Boards..." 
              className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-purple-500 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Exam ki Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-purple-500 transition-all text-white inverted-scheme"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Subject</label>
            <select 
              value={subject} 
              onChange={e => setSubject(e.target.value)} 
              className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-purple-500 transition-all appearance-none"
            >
              <option value="All Subjects">All Subjects</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
              <option value="Math">Math</option>
              <option value="Biology">Biology</option>
            </select>
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button onClick={onClose} className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-purple-900/40 active:scale-95 transition-all">
            Save Karo
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function EditProfileModal({ user, onClose, onSave }: { user: UserData, onClose: () => void, onSave: (u: UserData) => void, key?: string }) {
  const [name, setName] = useState(user.name);
  const [grade, setGrade] = useState(user.gradePreference);
  const [language, setLanguage] = useState(user.language);
  const [subjects, setSubjects] = useState<string[]>(user.subjects || []);
  const [avatarColor, setAvatarColor] = useState(user.avatarColor || '#7F77DD');

  const GRADES = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12 (NCERT)', 'JEE Level', 'NEET Level', 'College Level'];
  const LANGUAGES = ['Hindi', 'English', 'Hinglish'];
  const SUBJECT_LIST = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Economics', 'English', 'Computer Science'];
  const COLORS = [
    { name: 'Purple', hex: '#7F77DD' },
    { name: 'Blue', hex: '#3B82F6' },
    { name: 'Green', hex: '#10B981' },
    { name: 'Orange', hex: '#F59E0B' },
    { name: 'Pink', hex: '#EC4899' },
    { name: 'Red', hex: '#EF4444' }
  ];

  const handleSave = () => {
    if (!name.trim()) {
      alert("Naam toh daalo yaar!");
      return;
    }
    onSave({
      ...user,
      name,
      gradePreference: grade,
      language,
      subjects,
      avatarColor
    });
  };

  const toggleSubject = (s: string) => {
    if (subjects.includes(s)) {
      setSubjects(subjects.filter(x => x !== s));
    } else {
      setSubjects([...subjects, s]);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="bg-[#121212] border-t sm:border border-white/10 p-8 rounded-t-[2.5rem] sm:rounded-[3rem] w-full max-w-lg space-y-8 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="space-y-1 text-center">
          <h3 className="text-3xl font-black tracking-tighter uppercase">Edit Profile</h3>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Apni pehchan update karein</p>
        </div>

        <div className="space-y-6">
          {/* Avatar Color */}
          <div className="space-y-4">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Avatar Color</label>
            <div className="flex justify-center gap-4">
              {COLORS.map(c => (
                <button 
                  key={c.hex} 
                  onClick={() => setAvatarColor(c.hex)}
                  className={cn("w-10 h-10 rounded-full border-4 transition-all relative flex items-center justify-center", avatarColor === c.hex ? "border-white scale-110" : "border-transparent opacity-60")}
                  style={{ backgroundColor: c.hex }}
                >
                  {avatarColor === c.hex && <div className="w-2 h-2 bg-white rounded-full" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Full Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Apna naam likho" 
              className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-purple-500 transition-all font-sans"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Grade / Class</label>
            <select 
              value={grade} 
              onChange={e => setGrade(e.target.value)} 
              className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-purple-500 transition-all appearance-none"
            >
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Preferred Language</label>
            <div className="grid grid-cols-3 gap-2">
              {LANGUAGES.map(l => (
                <button 
                  key={l} 
                  onClick={() => setLanguage(l)}
                  className={cn("py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", language === l ? "bg-purple-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Subjects of Interest</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_LIST.map(s => (
                <button 
                  key={s} 
                  onClick={() => toggleSubject(s)}
                  className={cn("px-4 py-2 rounded-full text-[9px] font-black uppercase transition-all border", subjects.includes(s) ? "bg-purple-600 border-purple-600 text-white" : "bg-white/5 border-white/5 text-gray-500 hover:border-white/20")}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          <button onClick={handleSave} className="w-full py-5 bg-purple-600 hover:bg-purple-700 text-white rounded-3xl font-black uppercase text-xs tracking-widest shadow-lg shadow-purple-900/40 active:scale-95 transition-all">
            Save Karo
          </button>
          <button onClick={onClose} className="w-full py-5 bg-white/5 hover:bg-white/10 rounded-3xl font-black uppercase text-[10px] tracking-widest transition-all">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ConfirmDialog({ title, msg, onConfirm, onCancel, confirmText = "Confirm", cancelText = "Back", danger = false }: any) {
  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#121212] border border-white/10 p-8 rounded-[3rem] w-full max-w-sm space-y-6"
      >
        <h3 className="text-2xl font-black tracking-tighter uppercase">{title}</h3>
        <p className="text-sm font-medium text-gray-500">{msg}</p>
        <div className="flex gap-4">
          <button onClick={onCancel} className="flex-1 py-4 bg-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest">
            {cancelText}
          </button>
          <button 
            onClick={onConfirm} 
            className={cn(
              "flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95",
              danger ? "bg-red-600 text-white" : "bg-white text-black"
            )}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Nudge({ text }: { text: string, key?: string }) {
  return <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[60] bg-white text-black px-6 py-3 rounded-full font-black uppercase text-[10px] tracking-widest shadow-2xl">{text}</motion.div>;
}

const modeToLabel = (m: string) => ({ explain: 'Explain Mode', mcq: 'MCQ Practice', notes: 'Quick Notes', solve: 'Solve It', tips: 'Exam Strategies', exam_chat: 'Exam Coach', quick_revision: 'Quick Revision' }[m as any] || 'N-CODE');
const getPlaceholder = (m: string) => ({ explain: 'Kaunsa topic explain karun?', mcq: 'Kiska MCQ banau?', notes: 'Kis cheez ke notes chahiye?', solve: 'Paste logic ya photo khicho', quick_revision: 'Topic daalo for 5-min revision' }[m as any] || 'Ask N-CODE anything...');
const modeToIcon = (m: string) => ({ explain: <Sparkles className="w-4 h-4"/>, mcq: <HelpCircle className="w-4 h-4"/>, notes: <FileText className="w-4 h-4"/>, solve: <Calculator className="w-4 h-4"/>, tips: <TrendingUp className="w-4 h-4"/>, quick_revision: <Zap className="w-4 h-4"/> }[m as any] || <MessageSquare className="w-4 h-4"/>);
const EXAMS = [{ title: 'JEE MAINS', content: 'Physics focus on Modern Physics. Maths Calculus is key. Keep accuracy high.' }, { title: 'NEET UG', content: 'Biology NCERT is Gita/Bible/Quran here. Focus on Chem bonding and organic.' }, { title: 'CBSE XII', content: 'Follow NCERT exercise direct questions. Answer writing format is critical for 5-markers.' }];
