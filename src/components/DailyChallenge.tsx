import React from 'react';
import { motion } from 'framer-motion';
import { X, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

export interface ChallengeQuestion {
  type: 'mcq' | 'fill' | 'short';
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
}

export interface DailyChallenge {
  id: string;
  date: string;
  questions: ChallengeQuestion[];
}

interface DailyChallengeProps {
  challenge: DailyChallenge;
  challengeCurrentIndex: number;
  setChallengeCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  challengeAnswers: string[];
  setChallengeAnswers: React.Dispatch<React.SetStateAction<string[]>>;
  challengeTimer: number;
  setConfirmModal: React.Dispatch<React.SetStateAction<any>>;
  completeChallenge: (score: number, timeSpent: number) => void;
  setIsChallengeMode: React.Dispatch<React.SetStateAction<boolean>>;
  submitChallengeAndShowResults: () => void;
}

export default function DailyChallenge({
  challenge,
  challengeCurrentIndex,
  setChallengeCurrentIndex,
  challengeAnswers,
  setChallengeAnswers,
  challengeTimer,
  setConfirmModal,
  completeChallenge,
  setIsChallengeMode,
  submitChallengeAndShowResults
}: DailyChallengeProps) {
  return (
    <motion.div key="challenge-mode-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col text-white">
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setConfirmModal({
                title: "Chhod Ke Jana Hai?",
                msg: "Agar abhi gaye to aaj ka attempt fail ho jayega.",
                confirmText: "Quit Karo",
                cancelText: "Pura Karunga",
                danger: true,
                action: () => {
                  completeChallenge(0, 600 - challengeTimer);
                  setIsChallengeMode(false);
                  setConfirmModal(null);
                }
              });
            }} 
            className="p-2 -ml-2 hover:bg-white/5 rounded-full"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
          <div className="leading-none">
            <h3 className="font-black text-xs uppercase tracking-wider text-purple-400">Daily Challenge</h3>
            <p className="text-[9px] text-gray-500 font-bold uppercase">Question {challengeCurrentIndex + 1} of 5</p>
          </div>
        </div>
        
        <div className={cn(
          "px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border flex items-center gap-2",
          challengeTimer < 60 
            ? "bg-red-500/10 border-red-500/30 text-red-500 animate-pulse" 
            : "bg-purple-500/10 border-purple-500/20 text-purple-400"
        )}>
          <Clock className="w-3.5 h-3.5" />
          {Math.floor(challengeTimer / 60)}:{(challengeTimer % 60) < 10 ? '0' : ''}{challengeTimer % 60}
        </div>
      </header>

      {/* Question Step Indicators */}
      <div className="grid grid-cols-5 gap-1 px-4 py-2 bg-white/5">
        {[0, 1, 2, 3, 4].map((idx) => (
          <div 
            key={`indicator-${idx}`} 
            className={cn(
              "h-1 rounded-full px-1 transition-all duration-300",
              idx === challengeCurrentIndex 
                ? "bg-purple-500" 
                : (challengeAnswers[idx]) 
                  ? "bg-purple-900" 
                  : "bg-white/10"
            )}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-8 flex flex-col justify-between max-w-sm mx-auto w-full">
        {/* Question card */}
        <div className="flex-1 flex flex-col justify-center py-4">
          <div className="bg-[#121212] border border-white/5 rounded-[2rem] p-6 space-y-6">
            <div className="space-y-2">
              <span className="text-[9px] px-2 py-1 bg-purple-500/10 text-purple-400 rounded-full uppercase font-black tracking-widest">
                {challenge.questions[challengeCurrentIndex].type.toUpperCase()}
              </span>
              <h2 className="text-sm font-black leading-relaxed text-white animate-fade-in">
                {challenge.questions[challengeCurrentIndex].question}
              </h2>
            </div>

            {/* Render options for MCQs */}
            {challenge.questions[challengeCurrentIndex].type === 'mcq' && challenge.questions[challengeCurrentIndex].options && (
              <div className="grid grid-cols-1 gap-2">
                {challenge.questions[challengeCurrentIndex].options?.map((opt, oIdx) => {
                  const optLetter = String.fromCharCode(65 + oIdx); // A, B, C, D
                  const isSelected = challengeAnswers[challengeCurrentIndex] === optLetter;
                  return (
                    <button
                      key={`option-${oIdx}`}
                      onClick={() => {
                        const updatedAnswers = [...challengeAnswers];
                        updatedAnswers[challengeCurrentIndex] = optLetter;
                        setChallengeAnswers(updatedAnswers);
                      }}
                      className={cn(
                        "w-full text-left p-4 rounded-xl text-xs font-black uppercase flex items-center gap-3 transition-all border border-white/5",
                        isSelected 
                          ? "bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-900/10" 
                          : "bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white"
                      )}
                    >
                      <span className={cn(
                        "w-6 h-6 rounded-lg font-black text-[10px] flex items-center justify-center border",
                        isSelected ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/5 text-gray-500"
                      )}>{optLetter}</span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Render for Fill in blanks */}
            {challenge.questions[challengeCurrentIndex].type === 'fill' && (
              <div className="space-y-2">
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Apna Uttar Likho</p>
                <input
                  type="text"
                  value={challengeAnswers[challengeCurrentIndex] || ''}
                  onChange={(e) => {
                    const updatedAnswers = [...challengeAnswers];
                    updatedAnswers[challengeCurrentIndex] = e.target.value;
                    setChallengeAnswers(updatedAnswers);
                  }}
                  placeholder="Yahan type karo..."
                  className="w-full bg-[#181818] border border-white/5 text-white p-4 rounded-xl text-xs font-bold outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20"
                />
              </div>
            )}

            {/* Render for Short Answer */}
            {challenge.questions[challengeCurrentIndex].type === 'short' && (
              <div className="space-y-2">
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Apna Uttar Likho (Keywords match honge)</p>
                <textarea
                  rows={3}
                  value={challengeAnswers[challengeCurrentIndex] || ''}
                  onChange={(e) => {
                    const updatedAnswers = [...challengeAnswers];
                    updatedAnswers[challengeCurrentIndex] = e.target.value;
                    setChallengeAnswers(updatedAnswers);
                  }}
                  placeholder="Ek ya do shabdon mein likhein..."
                  className="w-full bg-[#181818] border border-white/5 text-white p-4 rounded-xl text-xs font-bold outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 resize-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Progress buttons */}
        <div className="flex gap-3 pt-4 shrink-0">
          {challengeCurrentIndex > 0 ? (
            <button
              onClick={() => setChallengeCurrentIndex(prev => prev - 1)}
              className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              ← Peeche
            </button>
          ) : <div className="flex-1" />}

          {challengeCurrentIndex < 4 ? (
            <button
              disabled={!challengeAnswers[challengeCurrentIndex]}
              onClick={() => setChallengeCurrentIndex(prev => prev + 1)}
              className="flex-1 py-4 bg-purple-600 disabled:opacity-40 hover:bg-purple-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-purple-950/20"
            >
              Aage Chalo →
            </button>
          ) : (
            <button
              disabled={challengeAnswers.filter(Boolean).length < 5}
              onClick={submitChallengeAndShowResults}
              className="flex-1 py-4 bg-green-600 disabled:opacity-40 hover:bg-green-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-green-950/20"
            >
              Submit Karo 🚀
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
