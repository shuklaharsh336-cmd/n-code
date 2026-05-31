import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export function getSystemPrompt(userContext?: UserData) {
  const contextText = userContext 
    ? `\n\nUSER CONTEXT: The student's name is ${userContext.name}, studying in ${userContext.gradePreference}, prefers ${userContext.language}. Address them by name occasionally in responses naturally (e.g., "Great question, ${userContext.name.split(' ')[0]}!" or "Sahi socha ${userContext.name.split(' ')[0]}!").`
    : "";

  return `You are N - CODE, an AI Study Buddy designed specifically for Indian students (Class 6 to College level). You support both Hindi and English — respond in whichever language the student uses, or mix both (Hinglish) if they prefer.${contextText}

YOUR CORE ABILITIES:

1. EXPLAIN ANY TOPIC
- Give a simple, clear explanation first (like a friendly tutor, not a textbook)
- Use relatable Indian examples (cricket, chai, local life, Bollywood, Indian history) to explain abstract concepts
- Then give a slightly deeper explanation for students who want more
- Cover: Physics, Chemistry, Math, Biology, History, Geography, Economics, English, Computer Science

2. GENERATE MCQs
- ALWAYS generate 5 MCQs when in MCQ mode.
- FORMAT:
  Q1. [Question]
  (A) [Option A]
  (B) [Option B]
  (C) [Option C]
  (D) [Option D]
  Answer: [A/B/C/D]
  Explanation: [Reason]
- Do NOT use plain lists for options. Always use (A), (B), (C), (D).
- Match difficulty: NCERT / JEE / NEET / College level as per user's grade.

3. CREATE NOTES
- Format: Short heading → bullet points → key terms in bold
- Add a "Remember This" box at the end with 3 most important points.
- Use simple HTML for the "Remember This" box.
- Example: 
<div class="remember-box">
  <h4>REMEMBER THIS</h4>
  <ul>
    <li>Point 1</li>
    <li>Point 2</li>
    <li>Point 3</li>
  </ul>
</div>
- Keep it concise — 5 minute revision ready

4. SOLVE PROBLEMS STEP BY STEP
- Show every step clearly labeled (Step 1, Step 2...)
- End with: "**Key Formula Used**" and "**Common Mistake to Avoid**"

5. EXAM TIPS
- Chapter-wise weightage if known
- Study order suggestion
- Quick revision strategy

PERSONALITY:
- Friendly, encouraging, never make the student feel dumb
- Use phrases like "Bilkul sahi socha!", "Yeh thoda tricky hai, chalo samjhte hain", "Kya baat hai!", "Arey bilkul aasan hai"
- Never give one-word answers, always explain WHY

RESPONSE FORMAT:
- Use standard Markdown for bolding, lists, and headers.
- IMPORTANT: Clean and beautiful formatting. No unnecessary symbols.
- For Math formulas, use clear text representation or LaTeX style if simple.

LIMITATIONS:
- If unsure, say: "Mujhe is specific cheez ki poori jaankari nahi, please textbook se confirm karo"
- Do not make up facts, dates, or formulas
- Outside academics: "Main sirf padhai mein help karta hoon!"

SMART SUGGESTIONS:
- At the end of every response, you MUST add exactly one line: "RELATED: [Topic 1], [Topic 2], [Topic 3]"
- These should be short (1-3 words) related academic concepts.`;
}

export interface UserData {
  name: string;
  email: string;
  gradePreference: string;
  language: string;
  subjects?: string[];
  avatarColor?: string;
  studyTime?: string;
}

export interface Message {
  role: 'user' | 'model';
  content: string;
}

export async function chatWithNCode(
  history: Message[], 
  userInput: string, 
  mode: string = 'chat', 
  userContext?: UserData,
  imageBase64?: string
) {
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const grade = userContext?.gradePreference || 'Standard';
  let promptPrefix = "";
  if (mode === 'explain') promptPrefix = `Explain this topic simply with Indian examples for ${grade}: `;
  if (mode === 'mcq') promptPrefix = `Generate 5 MCQs with options A,B,C,D and answers for ${grade} on: `;
  if (mode === 'notes') promptPrefix = `Create concise revision notes with bullet points and key terms for ${grade} on: `;
  if (mode === 'solve') promptPrefix = `Solve this step by step showing each step clearly for ${grade}: `;
  if (mode === 'tips') promptPrefix = `Give exam tips and study strategy for ${grade}: `;
  if (mode === 'quick_revision') promptPrefix = `Give an ultra-short revision for ${grade} student. Format strictly: ⚡ KEY POINTS (max 5 bullets), 📐 FORMULA (max 2), 💡 ONE EXAMPLE, ❓ ONE PRACTICE QUESTION. Keep it under 150 words total. Topic: `;

  const fullPrompt = `${promptPrefix}${userInput}`;

  const currentParts: any[] = [{ text: fullPrompt }];
  
  if (imageBase64) {
    currentParts.push({
      inlineData: {
        data: imageBase64.split(',')[1] || imageBase64,
        mimeType: "image/jpeg"
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      ...history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      })),
      { role: 'user', parts: currentParts }
    ],
    config: {
      systemInstruction: getSystemPrompt(userContext),
    },
  });

  return response.text || "I'm sorry, I couldn't generate a response.";
}

export interface RawFlashcard {
  front: string;
  back: string;
}

export async function generateFlashcardsFromResponse(aiResponse: string): Promise<RawFlashcard[]> {
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const prompt = `Based on the following AI study assistant response, extract 3 to 5 key educational facts or concepts and represent them as flashcards.
Each flashcard must have a concise, clear question or term on the "front" (maximum 15 words) and a precise, simple explanation or answer on the "back" (maximum 25 words).
The questions and answers should be in the same language as the response (which could be English, Hindi, or Hinglish). Keep them natural, engaging, and easy to review.

AI Response to evaluate:
"""
${aiResponse}
"""`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              front: { type: Type.STRING, description: "Highly clear, concise question or term, maximum 15 words." },
              back: { type: Type.STRING, description: "Simple, easy to understand explanation or answer, maximum 25 words." }
            },
            required: ["front", "back"]
          }
        },
        maxOutputTokens: 1000
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text);
      if (Array.isArray(parsed)) {
        return parsed as RawFlashcard[];
      }
    }
    return [];
  } catch (error) {
    console.error("Error generating flashcards from response:", error);
    return [];
  }
}

export interface ChallengeQuestion {
  type: 'mcq' | 'fill' | 'short';
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
}

export async function generateDailyChallenge(
  grade: string,
  recentTopics: string[],
  weakTopics: string[]
): Promise<ChallengeQuestion[]> {
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const recentText = recentTopics.length > 0 ? recentTopics.join(', ') : "None";
  const weakText = weakTopics.length > 0 ? weakTopics.join(', ') : "None";

  const prompt = `Generate a personalized daily challenge with exactly 5 academic questions for a student in "${grade}".
The student has recently studied these topics: "${recentText}".
Their weak areas or topics are: "${weakText}".

We need 5 questions total:
- 3 questions from recently studied topics (to reinforce learning)
- 1 question from weak topics (to practice what was difficult)
- 1 new concept question suitable for their grade level (to introduce new concepts)

The mix of question types MUST be exactly:
- 3 Multiple Choice Questions (MCQs) (with exactly 4 options)
- 1 Fill in the blank question
- 1 Short answer question

For MCQ questions, options should be clean text (e.g. ['Ans1', 'Ans2', 'Ans3', 'Ans4']) and the answer must be the exact letter 'A', 'B', 'C', or 'D' corresponding to the correct option index 0, 1, 2, or 3 respectively.
For 'fill' and 'short' types, options must be empty/omitted and this should be the brief, correct answer string.

Language style: Natural, friendly Hinglish or English as is preferred by Indian students. Use relatable terms to make the test highly engaging, like a fun Duolingo quiz.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: "Must be 'mcq', 'fill', or 'short'." },
                  question: { type: Type.STRING, description: "The quiz question. Keep it concise." },
                  options: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "For 'mcq' type, list 4 options. Empty or omit for other types."
                  },
                  answer: { type: Type.STRING, description: "For 'mcq', 'A', 'B', 'C', or 'D'. For others, the short answer value." },
                  explanation: { type: Type.STRING, description: "Simple encouraging explanation." }
                },
                required: ["type", "question", "answer", "explanation"]
              }
            }
          },
          required: ["questions"]
        },
        maxOutputTokens: 2000
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text);
      if (parsed && Array.isArray(parsed.questions)) {
        return parsed.questions as ChallengeQuestion[];
      }
    }
    return [];
  } catch (error) {
    console.error("Error generating daily challenge:", error);
    return [];
  }
}
