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

export interface RawFlashcard {
  front: string;
  back: string;
}

export interface ChallengeQuestion {
  type: 'mcq' | 'fill' | 'short';
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
}

function getModePrefix(mode: string, user?: UserData): string {
  const name = user?.name || "Student";
  const grade = user?.gradePreference || "All Class";
  const language = user?.language || "Hinglish";

  if (mode === 'explain') {
    return `You are N-CODE, friendly AI tutor for Indian students.
Student Name: ${name}, Grade: ${grade}, Language: ${language}.
Address student by name occasionally.
Explain this topic simply with Indian examples,
then deeper explanation, then Remember This box:
Topic: `;
  }
  if (mode === 'mcq') {
    return `You are N-CODE, AI tutor for Indian students.
Student: ${name}, Grade: ${grade}, Language: ${language}.
Generate exactly 5 MCQs with options A, B, C, D.
Format each as:
Q1. [question]
A) option
B) option  
C) option
D) option
Answer: [letter]
Explanation: [one line]
Topic: `;
  }
  if (mode === 'notes') {
    return `You are N-CODE, AI tutor for Indian students.
Student: ${name}, Grade: ${grade}, Language: ${language}.
Create concise revision notes with:
- Clear headings
- Bullet points
- Key terms in bold
- Remember This box with 3 key points
Topic: `;
  }
  if (mode === 'solve') {
    return `You are N-CODE, AI tutor for Indian students.
Student: ${name}, Grade: ${grade}, Language: ${language}.
Solve this step by step.
Label each step clearly.
End with: Key Formula Used + Common Mistake to Avoid.
Problem: `;
  }
  if (mode === 'quick_revision') {
    return `You are N-CODE, AI tutor for Indian students.
Student: ${name}, Grade: ${grade}, Language: ${language}.
Give ultra-short revision under 150 words:
⚡ KEY POINTS (max 5 bullets)
📐 FORMULA (if applicable)
💡 ONE EXAMPLE
❓ ONE PRACTICE QUESTION
Topic: `;
  }
  // Fallback
  return `You are N-CODE, AI tutor for Indian students.
Student: ${name}, Grade: ${grade}, Language: ${language}.
Topic: `;
}

export async function chatWithNCode(
  history: Message[], 
  userInput: string, 
  mode: string = 'chat', 
  userContext?: UserData,
  imageBase64?: string
): Promise<string> {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
  if (!API_KEY) {
    console.error("Gemini API key is not configured");
    throw new Error("API key missing");
  }

  const prefix = getModePrefix(mode, userContext);
  
  let finalPromptText = "";
  if (imageBase64) {
    finalPromptText = prefix + "Analyze this image and help the student. Additional topic: " + (userInput || "");
  } else {
    finalPromptText = prefix + userInput;
  }
  
  finalPromptText += `\n\nAt the very end of your response add exactly:
RELATED:[topic1],[topic2],[topic3],[topic4]
These should be related topics the student should study next. Do not use square brackets in the final list.`;

  const contentsList: any[] = [];
  
  history.forEach(msg => {
    contentsList.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  });

  if (imageBase64) {
    contentsList.push({
      role: 'user',
      parts: [
        {
          inline_data: {
            mime_type: "image/jpeg",
            data: imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
          }
        },
        {
          text: finalPromptText
        }
      ]
    });
  } else {
    contentsList.push({
      role: 'user',
      parts: [{ text: finalPromptText }]
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contentsList,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    }
  );
  
  const data = await response.json();
  if (data.error) {
    console.error("Gemini API Error:", data.error);
    throw new Error(data.error.message || "API call failed");
  }
  
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("Empty response");
  }

  return data.candidates[0].content.parts[0].text;
}

export async function generateFlashcardsFromResponse(aiResponse: string): Promise<RawFlashcard[]> {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
  if (!API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }

  const prompt = `Extract 3-5 key concepts from this text as flashcards.
Return ONLY valid JSON array, nothing else:
[{"front":"question","back":"answer"}]
Text: ${aiResponse}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  front: { type: "STRING" },
                  back: { type: "STRING" }
                },
                required: ["front", "back"]
              }
            }
          }
        })
      }
    );

    const data = await response.json();
    if (data.error) {
      console.error("Flashcard generation error:", data.error);
      return [];
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        // Recovery attempt: escape literal newlines in string values
        try {
          const recovered = cleanJson.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, p1) => {
            return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
          });
          parsed = JSON.parse(recovered);
        } catch (recoverError) {
          console.error("JSON recovery failed:", recoverError);
          throw e;
        }
      }
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

export async function generateDailyChallenge(
  grade: string,
  recentTopics: string[],
  weakTopics: string[],
  language: string = "Hinglish"
): Promise<ChallengeQuestion[]> {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
  if (!API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }

  const prompt = `Generate exactly 5 MCQ questions for 
   ${grade} student in ${language}.
   Recent topics: ${recentTopics.join(', ')}.
   Weak topics: ${weakTopics.join(', ')}.
   
   Return ONLY this exact JSON, nothing else:
   {
     "questions": [
       {
         "question": "Question text here?",
         "options": ["A) opt1","B) opt2","C) opt3","D) opt4"],
         "answer": "A",
         "explanation": "Brief explanation"
       }
     ]
   }`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                questions: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      question: { type: "STRING" },
                      options: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                      },
                      answer: { type: "STRING" },
                      explanation: { type: "STRING" }
                    },
                    required: ["question", "options", "answer", "explanation"]
                  }
                }
              },
              required: ["questions"]
            }
          }
        })
      }
    );

    const data = await response.json();
    if (data.error) {
      console.error("Daily Challenge generation error:", data.error);
      return [];
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        try {
          const recovered = cleanJson.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, p1) => {
            return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
          });
          parsed = JSON.parse(recovered);
        } catch (recoverError) {
          console.error("JSON recovery failed:", recoverError);
          throw e;
        }
      }
      if (parsed && Array.isArray(parsed.questions)) {
        return parsed.questions.map((q: any) => ({
          type: 'mcq',
          question: q.question,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation
        })) as ChallengeQuestion[];
      }
    }
    return [];
  } catch (error) {
    console.error("Error generating daily challenge:", error);
    return [];
  }
}
