import React, { useState } from 'react';
import { ChevronRight, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserData } from '../services/geminiService';

const SLIDES = [
  { title: "N-CODE: Your AI Buddy", desc: "India ka friendly AI tutor jo sab samjha dega.", icon: "🚀" },
  { title: "Camera se Padhai", desc: "Photo khicho aur instant solution pao.", icon: "📸" },
  { title: "Privacy First", desc: "Aapka data aapke phone mein safe hai.", icon: "🛡️" },
];

const GRADES = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12", "JEE", "NEET", "College"];
const LANGUAGES = ["English", "Hindi", "Hinglish"];

export function OnboardingPage({ onAuth }: { onAuth: (u: UserData) => void }) {
  const [slide, setSlide] = useState(0);
  const [isAuth, setIsAuth] = useState(localStorage.getItem('nc_onboarded') === 'true');
  const [isNew, setIsNew] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '', grade: 'Class 12', lang: 'Hinglish' });
  const [error, setError] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const validate = () => {
    if (isNew && !form.name.trim()) return "Naam likhna zaroori hai!";
    if (!form.email.includes('@')) return "Email format sahi nahi hai!";
    if (form.password.length < 8) return "Password kam se kam 8 characters ka hona chahiye!";
    return null;
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Mock auth for now as per instructions
    if (!isNew && form.password !== 'password123') { // Simple mock check
       setError("Galat password hai, dobara try karo");
       setTimeout(() => setError(null), 3000);
       return;
    }

    localStorage.setItem('nc_onboarded', 'true');
    if (isNew) localStorage.setItem('nc_privacy_seen', 'true'); // New users bypass first popup or we show it
    
    onAuth({ 
      name: form.name || 'Student', 
      email: form.email, 
      gradePreference: form.grade, 
      language: form.lang 
    });
  };

  if (isAuth) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6 text-white overflow-y-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-6 bg-white/5 p-8 rounded-[2.5rem] border border-white/10 my-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black tracking-tighter uppercase">{isNew ? 'Join N-CODE' : 'Welcome Back'}</h1>
            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">{isNew ? 'Create your profile' : 'Login to continue'}</p>
          </div>

          <form className="space-y-4" onSubmit={handleAuth}>
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase p-3 rounded-xl text-center">
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {isNew && (
              <>
                <input required placeholder="Full Name" className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:border-white/30 transition-all outline-none" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                <div className="grid grid-cols-2 gap-3">
                  <select className="bg-[#1a1a1a] border border-white/10 rounded-2xl px-4 py-4 text-sm outline-none" value={form.grade} onChange={e => setForm({...form, grade: e.target.value})}>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select className="bg-[#1a1a1a] border border-white/10 rounded-2xl px-4 py-4 text-sm outline-none" value={form.lang} onChange={e => setForm({...form, lang: e.target.value})}>
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </>
            )}
            <input required type="email" placeholder="Email" className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:border-white/30 transition-all outline-none" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            <input required type="password" placeholder="Password" className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:border-white/30 transition-all outline-none" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
            
            <button type="submit" className="w-full bg-white text-black font-black py-4 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-tighter shadow-xl">
              {isNew ? 'Start Studying' : 'Login'}
            </button>
          </form>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase font-black text-gray-600"><span className="bg-[#0A0A0A] px-2">OR</span></div>
          </div>

          <button onClick={() => onAuth({ name: 'Google Student', email: 'google@student.com', gradePreference: 'Class 12', language: 'Hinglish' })} className="w-full bg-white/5 border border-white/10 py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all uppercase font-black text-xs">
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" /> Google Login
          </button>

          <p className="text-center text-[10px] font-black text-gray-500 uppercase">
            {isNew ? 'Already have an account?' : 'New here?'} 
            <button onClick={() => setIsNew(!isNew)} className="text-white ml-2 hover:underline">{isNew ? 'Login' : 'Signup'}</button>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-8 text-center text-white overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div 
          key={slide} 
          initial={{ opacity: 0, x: 20 }} 
          animate={{ opacity: 1, x: 0 }} 
          exit={{ opacity: 0, x: -20 }} 
          className="space-y-6 max-w-sm flex flex-col items-center"
        >
          <div className="text-[120px] mb-8 drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">{SLIDES[slide].icon}</div>
          <h1 className="text-5xl font-black tracking-tighter uppercase leading-none">{SLIDES[slide].title}</h1>
          <p className="text-gray-400 font-bold text-lg leading-snug">{SLIDES[slide].desc}</p>
        </motion.div>
      </AnimatePresence>
      <div className="mt-16 flex gap-3">
        {SLIDES.map((_, i) => <div key={i} className={`h-1.5 rounded-full transition-all ${slide === i ? 'w-10 bg-white' : 'w-2.5 bg-white/10'}`} />)}
      </div>
      <motion.button 
        whileTap={{ scale: 0.9 }}
        onClick={() => slide < 2 ? setSlide(slide + 1) : setIsAuth(true)} 
        className="mt-12 bg-white text-black font-black py-5 px-12 rounded-full flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-[0_20px_50px_rgba(255,255,255,0.1)] uppercase tracking-tighter text-lg"
      >
        {slide < 2 ? 'Next' : 'Get Started'} <ChevronRight className="w-6 h-6 shrink-0" />
      </motion.button>
    </div>
  );
}
