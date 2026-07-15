import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface Flashcard {
  id: string;
  topic: string;
  front: string;
  back: string;
}

interface FlashcardReviewProps {
  dueCards: Flashcard[];
  currentReviewIndex: number;
  setCurrentReviewIndex: React.Dispatch<React.SetStateAction<number>>;
  showAnswer: boolean;
  setShowAnswer: React.Dispatch<React.SetStateAction<boolean>>;
  setIsReviewMode: React.Dispatch<React.SetStateAction<boolean>>;
  handleReviewRating: (cardId: string, rating: number) => void;
}

export default function FlashcardReview({
  dueCards,
  currentReviewIndex,
  setCurrentReviewIndex,
  showAnswer,
  setShowAnswer,
  setIsReviewMode,
  handleReviewRating
}: FlashcardReviewProps) {
  if (dueCards.length === 0 || currentReviewIndex >= dueCards.length) return null;
  const currentCard = dueCards[currentReviewIndex];

  return (
    <motion.div key="review-mode-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col text-white">
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsReviewMode(false)} className="p-2 -ml-2 hover:bg-white/5 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </button>
          <div className="leading-none">
            <h3 className="font-black text-xs uppercase tracking-wider text-purple-400">Flashcard Review</h3>
            <p className="text-[9px] text-gray-500 font-bold uppercase">{currentReviewIndex + 1} of {dueCards.length} left</p>
          </div>
        </div>
        <div className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-1.5 rounded-full font-black uppercase">
          Sm-2 Mode
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1 bg-white/5 w-full relative">
        <div 
          className="h-full bg-purple-50 transition-all duration-300"
          style={{ width: `${((currentReviewIndex + (showAnswer ? 0.5 : 0)) / dueCards.length) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-8 flex flex-col justify-between max-w-md mx-auto w-full">
        {/* Flashcard Area */}
        <div className="flex-1 flex items-center justify-center py-6">
          <div 
            onClick={() => setShowAnswer(p => !p)}
            className={cn(
              "w-full aspect-[4/5] max-h-[350px] bg-[#121212] border border-white/5 rounded-[2.5rem] p-8 flex flex-col justify-between cursor-pointer relative shadow-2xl overflow-hidden hover:border-purple-500/30 transition-all duration-500 select-none",
              showAnswer ? "shadow-purple-950/10 border-purple-500/20" : ""
            )}
          >
            <div className="absolute top-4 right-6 text-[8px] font-black tracking-widest text-[#7F77DD] py-1 px-2.5 bg-purple-600/10 rounded-full uppercase">
              {currentCard.topic}
            </div>

            <div className="flex-1 flex flex-col justify-center items-center text-center p-2">
              {!showAnswer ? (
                <div className="space-y-4">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Question</p>
                  <h2 className="text-sm font-black text-white leading-relaxed">{currentCard.front}</h2>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[8px] font-black uppercase tracking-widest text-purple-400">Answer</p>
                  <p className="text-xs font-medium text-gray-300 leading-relaxed">{currentCard.back}</p>
                </div>
              )}
            </div>

            <div className="text-center">
              <p className="text-[8px] font-black uppercase text-gray-500 tracking-widest">
                {showAnswer ? "Tap to Flip back" : "Tap to Flip & Answer"}
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4 pt-6 shrink-0">
          {!showAnswer ? (
            <button 
              onClick={() => setShowAnswer(true)} 
              className="w-full py-5 bg-purple-600 hover:bg-purple-700 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-lg shadow-purple-900/15"
            >
              Flip Karo 🔄
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-[9px] font-black uppercase text-gray-500 text-center tracking-wider mb-1">Aapko kitna yaad tha?</p>
              <div className="grid grid-cols-4 gap-2">
                <button 
                  onClick={() => handleReviewRating(currentCard.id, 1)} 
                  className="py-4 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-2xl text-[9px] font-black uppercase tracking-wider flex flex-col items-center gap-1 border border-red-500/10"
                >
                  <span className="text-sm">❌</span> Forgot
                </button>
                <button 
                  onClick={() => handleReviewRating(currentCard.id, 2)} 
                  className="py-4 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 rounded-2xl text-[9px] font-black uppercase tracking-wider flex flex-col items-center gap-1 border border-amber-500/10"
                >
                  <span className="text-sm">🤨</span> Hard
                </button>
                <button 
                  onClick={() => handleReviewRating(currentCard.id, 3)} 
                  className="py-4 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-2xl text-[9px] font-black uppercase tracking-wider flex flex-col items-center gap-1 border border-blue-500/10"
                >
                  <span className="text-sm font-semibold">👍</span> Good
                </button>
                <button 
                  onClick={() => handleReviewRating(currentCard.id, 4)} 
                  className="py-4 bg-green-600/10 hover:bg-green-600/20 text-green-400 rounded-2xl text-[9px] font-black uppercase tracking-wider flex flex-col items-center gap-1 border border-green-500/10"
                >
                  <span className="text-sm">🥳</span> Easy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
