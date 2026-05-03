import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, BookOpen, FileText, HelpCircle, Calculator, Zap, 
  User, MessageSquare, GraduationCap, Sparkles, Paperclip, 
  LogOut, Trash2, Shield, X, ChevronRight, 
  TrendingUp, Award, Camera, ArrowLeft, RefreshCcw,
  Copy, Save, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { chatWithNCode, Message, UserData } from './services/geminiService';
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
}

// --- App ---
export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
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
    const u = localStorage.getItem('ncode_profile') || localStorage.getItem('nc_u');
    const l = localStorage.getItem('nc_l');
    const s = localStorage.getItem('nc_s');
    const e = localStorage.getItem('ncode_exams');
    const privSeen = localStorage.getItem('nc_privacy_seen');

    if (u) {
      setUser(JSON.parse(u));
      if (privSeen !== 'true') setShowPrivacy(true);
    }
    if (l) setLibrary(JSON.parse(l));
    
    // Exam cleanup and sorting
    if (e) {
      const parsedExams: Exam[] = JSON.parse(e);
      const today = new Date();
      today.setHours(0,0,0,0);
      const filtered = parsedExams
        .filter(ex => new Date(ex.date) >= today)
        .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setExams(filtered);
      localStorage.setItem('ncode_exams', JSON.stringify(filtered));
    }

    if (s) {
      const parsed = JSON.parse(s);
      
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
      }
      setStats(parsed);
    }
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('ncode_profile', JSON.stringify(user));
      localStorage.setItem('nc_u', JSON.stringify(user));
    }
    localStorage.setItem('nc_l', JSON.stringify(library));
    localStorage.setItem('nc_s', JSON.stringify(stats));
    localStorage.setItem('ncode_exams', JSON.stringify(exams));
  }, [user, library, stats, exams]);

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

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, isTyping]);

  const saveChat = () => {
    if (messages.length === 0 || currentMode === 'selection') return;
    const firstMsg = messages.find(m => m.role === 'user')?.content || "New Chat";
    const session: ChatSession = {
      id: activeChatId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      mode: currentMode as any,
      topic: firstMsg.slice(0, 40) + (firstMsg.length > 40 ? '...' : ''),
      messages: messages,
      suggestions: suggestions,
      timestamp: Date.now()
    };
    setLibrary(prev => ({ ...prev, recentChats: [session, ...prev.recentChats.filter(c => c.id !== session.id)].slice(0, 15) }));
  };

  const handleSend = async (override?: string) => {
    const text = (override || input).trim();
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
      if (!isOnline) throw new Error("Offline");

      // Filter out auto-greeting from history sent to API
      const apiHistory = messages.filter((msg, idx) => {
        if (idx === 0 && msg.role === 'model') return false;
        return true;
      });

      const resp = await chatWithNCode(apiHistory, text, currentMode, user!, img || undefined);
      
      if (!resp || resp.includes("I'm sorry, I couldn't generate a response")) {
        throw new Error("Empty response");
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
      let errorMsg = "Kuch gadbad hui, dobara try karo 🔄";
      if (!isOnline) errorMsg = "Offline ho? Saved notes check karo!";
      if (e.message === "Empty response") errorMsg = "Kuch mila nahi, thoda aur detail mein poochho";
      
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
    if (!SpeechRecognition) return alert("Browser voice support nahi hai.");
    
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'hi-IN'; // Supports Hindi/English/Hinglish to some extent
    recognitionRef.current.continuous = false;
    
    recognitionRef.current.onstart = () => setIsRecording(true);
    recognitionRef.current.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev + ' ' + transcript);
      setIsRecording(false);
    };
    recognitionRef.current.onerror = () => setIsRecording(false);
    recognitionRef.current.onend = () => setIsRecording(false);
    
    recognitionRef.current.start();
  };

  const speak = (text: string, index: number) => {
    if (isSpeaking === index) {
      window.speechSynthesis.cancel();
      setIsSpeaking(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#]/g, ''));
    utterance.rate = 0.9;
    utterance.onstart = () => setIsSpeaking(index);
    utterance.onend = () => setIsSpeaking(null);
    window.speechSynthesis.speak(utterance);
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
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);

      // Create a hidden div to render the content for html2canvas
      const element = document.createElement('div');
      element.style.width = `${contentWidth}mm`;
      element.style.padding = '20px';
      element.style.background = 'white';
      element.style.color = 'black';
      element.style.fontFamily = 'Arial, sans-serif';
      element.className = 'markdown-body pdf-export';
      
      // Inject Styles for PDF
      const style = document.createElement('style');
      style.innerHTML = `
        .pdf-export { font-size: 12px; line-height: 1.6; }
        .pdf-export h3, .pdf-export h4 { color: #7F77DD; margin-top: 15px; margin-bottom: 5px; font-size: 16px; text-transform: uppercase; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .pdf-export p { margin-bottom: 10px; }
        .pdf-export ul, .pdf-export ol { padding-left: 20px; margin-bottom: 10px; }
        .pdf-export li { margin-bottom: 5px; }
        .pdf-export strong { font-weight: bold; }
        .pdf-export .remember-box { background: #f3f0ff; border-left: 4px solid #7F77DD; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .pdf-export .remember-box h4 { color: #7F77DD; margin-top: 0; font-size: 14px; border: none; }
        .pdf-header { border-bottom: 2px solid #7F77DD; padding-bottom: 10px; margin-bottom: 20px; }
        .pdf-footer { border-top: 1px solid #eee; margin-top: 30px; padding-top: 10px; text-align: center; font-size: 10px; color: #666; }
      `;
      document.head.appendChild(style);

      const headerHtml = `
        <div class="pdf-header">
          <h2 style="color: #7F77DD; margin: 0; font-size: 24px;">N-CODE — Smart Study Notes</h2>
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 5px;">
            <span>Student: <strong>${user?.name}</strong></span>
            <span>Grade: <strong>${user?.gradePreference}</strong></span>
            <span>Date: <strong>${new Date().toLocaleDateString()}</strong></span>
          </div>
          <p style="margin-top: 10px; font-size: 14px;">Topic: <strong>${topicName}</strong></p>
        </div>
      `;

      const footerHtml = `
        <div class="pdf-footer">
          Generated by N-CODE | Padhai ka Smart Saathi
        </div>
      `;

      const sanitizedHtml = DOMPurify.sanitize(marked.parse(content) as string);
      element.innerHTML = headerHtml + sanitizedHtml + footerHtml;
      document.body.appendChild(element);

      await doc.html(element, {
        callback: function (doc) {
          doc.save(filename);
          document.body.removeChild(element);
          document.head.removeChild(style);
          setSuccessToast("PDF ready hai! ✅");
          setTimeout(() => setSuccessToast(null), 2000);
          
          // Also save to library
          setLibrary(p => ({
            ...p,
            savedNotes: [{ 
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, 
              topic: topicName, 
              content: content, 
              date: new Date().toLocaleDateString(), 
              type: mode.toUpperCase() + " (PDF)" 
            }, ...p.savedNotes]
          }));
        },
        x: 0,
        y: 0,
        width: pageWidth,
        windowWidth: 800 // Use a fixed window width for consistency
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

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#0A0A0A] text-gray-200 font-sans overflow-hidden">
      <AnimatePresence>
        {!isOnline && (
          <motion.div initial={{ y: -50 }} animate={{ y: 0 }} exit={{ y: -50 }} className="fixed top-0 inset-x-0 h-6 bg-red-500 text-white text-[10px] font-black uppercase flex items-center justify-center z-[110]">
            Offline Mode — Showing saved content
          </motion.div>
        )}
        {showOnlineStatus && (
          <motion.div initial={{ y: -50 }} animate={{ y: 0 }} exit={{ y: -50 }} className="fixed top-0 inset-x-0 h-6 bg-green-500 text-white text-[10px] font-black uppercase flex items-center justify-center z-[110]">
            Back online ✅
          </motion.div>
        )}
        {celebrate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-purple-600/20 backdrop-blur-sm">
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
            title="Milestone Reached! 🏆" 
            msg={`Badhai ho! Aapne ${milestoneReached} dino ka streak complete kiya hai! Keep it up.`} 
            onConfirm={() => setMilestoneReached(null)} 
            onCancel={() => setMilestoneReached(null)} 
          />
        )}
        {showPrivacy && (
          <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 text-center">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#121212] border border-white/10 p-8 rounded-[3rem] space-y-6 max-w-sm">
              <Shield className="w-16 h-16 text-green-500 mx-auto" />
              <h2 className="text-3xl font-black uppercase tracking-tighter">Your Data is Safe</h2>
              <p className="text-sm text-gray-500 leading-relaxed font-medium">N-CODE aapki privacy ka dhyan rakhta hai. Aapka saari progress aur history sirf aapke local device mein store hoti hai.</p>
              <button 
                onClick={() => { localStorage.setItem('nc_privacy_seen', 'true'); setShowPrivacy(false); }} 
                className="w-full py-5 bg-white text-black rounded-3xl font-black uppercase tracking-widest text-xs"
              >
                I Understand & Start
              </button>
            </motion.div>
          </div>
        )}
        {errorToast && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] bg-red-600 text-white px-6 py-3 rounded-full font-black uppercase text-[10px] tracking-widest shadow-2xl">
            {errorToast}
          </motion.div>
        )}
        {successToast && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-6 py-3 rounded-full font-black uppercase text-[10px] tracking-widest shadow-2xl flex items-center gap-2">
            {successToast}
          </motion.div>
        )}
        {showAddExam && (
          <AddExamModal 
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
            user={user} 
            onClose={() => setShowEditProfile(false)} 
            onSave={(updated) => {
              setUser(updated);
              setShowEditProfile(false);
              setSuccessToast("Profile update ho gaya! ✅");
              setTimeout(() => setSuccessToast(null), 2000);
            }} 
          />
        )}
        {showCamera && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-12 flex justify-center gap-8 items-center px-8">
              <button onClick={() => setShowCamera(false)} className="p-4 bg-white/10 rounded-full"><X /></button>
              <button onClick={capture} className="w-20 h-20 bg-white rounded-full p-2 border-4 border-white/20"><div className="w-full h-full border-2 border-black rounded-full" /></button>
            </div>
          </motion.div>
        )}
        {confirmModal && <ConfirmDialog {...confirmModal} onCancel={() => setConfirmModal(null)} />}
        {nudge && <Nudge text={nudge} />}
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
        {currentMode !== 'selection' && (
          <button onClick={() => setConfirmModal({ title: "New Chat?", msg: "Current chat library mein save ho jayegi.", action: () => { saveChat(); handleModeSelect(currentMode); setConfirmModal(null); } })} className="text-[9px] font-black uppercase tracking-widest bg-white/5 px-3 py-2 rounded-full border border-white/5 flex items-center gap-2">
            <RefreshCcw className="w-3 h-3" /> New Chat
          </button>
        )}
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
                    {library.recentChats.map(c => (
                      <motion.div 
                        key={c.id} 
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
                                localStorage.setItem('nc_l', JSON.stringify(updatedLibrary));
                                localStorage.setItem('savedChats', JSON.stringify(updatedChats));
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
                    {library.savedNotes.map(n => (
                      <motion.div 
                        key={n.id} 
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
                                localStorage.setItem('nc_l', JSON.stringify(updatedLibrary));
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
                    {exams.map(ex => (
                      <ExamCountdownCard 
                        key={ex.id} 
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
            <button type="button" onClick={startCamera} className="p-4 text-gray-400"><Camera className="w-5 h-5"/></button>
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

function MsgBubble({ m, index, isSpeaking, onSpeak, onSave, mode, onWrongAnswer, onDownloadPDF }: { m: Message, index: number, isSpeaking: boolean, onSpeak: () => void, onSave: () => void, mode: Mode, onWrongAnswer: (t: string) => void, onDownloadPDF: (content: string, mode: Mode) => void }) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const isUser = m.role === 'user';
  
  // MCQ Parsing: Look for Q1, Q2 etc and options (A) (B) (C) (D)
  const mcqs = mode === 'mcq' && !isUser ? m.content.split(/Q\d\./).filter(q => q.includes('(A)')).map(q => {
    const lines = q.split('\n');
    const question = lines[0].trim();
    const options: Record<string, string> = {};
    ['A', 'B', 'C', 'D'].forEach(o => {
      const line = lines.find(l => l.includes(`(${o})`));
      if (line) options[o] = line.split(`(${o})`)[1].trim();
    });
    const answerMatch = q.match(/Answer:\s*([A-D])/i);
    const answer = answerMatch ? answerMatch[1].toUpperCase() : null;
    const explanationMatch = q.match(/Explanation:\s*(.*)/i);
    const explanation = explanationMatch ? explanationMatch[1].trim() : null;
    return { question, options, answer, explanation };
  }) : [];

  const handleMCQ = (opt: string, correctOpt: string | null, questionText: string) => {
    if (selectedOption) return;
    setSelectedOption(opt);
    setShowExplanation(true);
    if (correctOpt && opt !== correctOpt) {
      onWrongAnswer(questionText);
    }
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
            <SecureHTML content={m.content} />
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
                        disabled={!!selectedOption}
                        onClick={() => handleMCQ(key, q.answer, q.question)}
                        className={cn(
                          "p-4 rounded-2xl text-left text-xs font-bold transition-all border flex items-center gap-3",
                          selectedOption === key 
                            ? (key === q.answer ? "bg-green-500/20 border-green-500 text-green-500" : "bg-red-500/20 border-red-500 text-red-500")
                            : (selectedOption && key === q.answer ? "bg-green-500/20 border-green-500 text-green-500" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10")
                        )}
                      >
                        <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">{key}</span>
                        {val}
                      </button>
                    ))}
                  </div>
                  {showExplanation && q.explanation && (
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
}

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

function ExamCountdownCard({ ex, onDelete }: { ex: Exam, onDelete: () => void }) {
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

function AddExamModal({ onClose, onSave }: { onClose: () => void, onSave: (ex: Exam) => void }) {
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

function EditProfileModal({ user, onClose, onSave }: { user: UserData, onClose: () => void, onSave: (u: UserData) => void }) {
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

function Nudge({ text }: { text: string }) {
  return <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[60] bg-white text-black px-6 py-3 rounded-full font-black uppercase text-[10px] tracking-widest shadow-2xl">{text}</motion.div>;
}

const modeToLabel = (m: string) => ({ explain: 'Explain Mode', mcq: 'MCQ Practice', notes: 'Quick Notes', solve: 'Solve It', tips: 'Exam Strategies', exam_chat: 'Exam Coach', quick_revision: 'Quick Revision' }[m as any] || 'N-CODE');
const getPlaceholder = (m: string) => ({ explain: 'Kaunsa topic explain karun?', mcq: 'Kiska MCQ banau?', notes: 'Kis cheez ke notes chahiye?', solve: 'Paste logic ya photo khicho', quick_revision: 'Topic daalo for 5-min revision' }[m as any] || 'Ask N-CODE anything...');
const modeToIcon = (m: string) => ({ explain: <Sparkles className="w-4 h-4"/>, mcq: <HelpCircle className="w-4 h-4"/>, notes: <FileText className="w-4 h-4"/>, solve: <Calculator className="w-4 h-4"/>, tips: <TrendingUp className="w-4 h-4"/>, quick_revision: <Zap className="w-4 h-4"/> }[m as any] || <MessageSquare className="w-4 h-4"/>);
const EXAMS = [{ title: 'JEE MAINS', content: 'Physics focus on Modern Physics. Maths Calculus is key. Keep accuracy high.' }, { title: 'NEET UG', content: 'Biology NCERT is Gita/Bible/Quran here. Focus on Chem bonding and organic.' }, { title: 'CBSE XII', content: 'Follow NCERT exercise direct questions. Answer writing format is critical for 5-markers.' }];
