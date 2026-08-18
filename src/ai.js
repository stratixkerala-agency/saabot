import Groq from 'groq-sdk';
import config from './config.js';

const groq = new Groq({ apiKey: config.groqApiKey });

const MAX_CONTEXT_MESSAGES = 10;
const MAX_HISTORY_SIZE = 100;
const chatHistories = new Map();

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a|an|the)/i,
  /new\s+instructions?\s*:/i,
  /override\s+(system|instructions?|rules?)/i,
  /enter\s+(developer|admin|debug|root)\s+mode/i,
  /bypass\s+(all\s+)?(safety|security|rules?)/i,
  /do\s+anything\s+now/i,
  /DAN\s+mode/i,
];

function isPromptInjection(text) {
  return INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

function getChatHistory(chatId) {
  if (!chatHistories.has(chatId)) {
    chatHistories.set(chatId, []);
  }
  return chatHistories.get(chatId);
}

function trimHistory(history) {
  if (history.length > MAX_CONTEXT_MESSAGES) {
    history.splice(0, history.length - MAX_CONTEXT_MESSAGES);
  }
}

function cleanupOldHistories() {
  if (chatHistories.size > MAX_HISTORY_SIZE) {
    const keys = [...chatHistories.keys()];
    for (let i = 0; i < keys.length - 50; i++) {
      chatHistories.delete(keys[i]);
    }
  }
}

async function callGroq(messages) {
  const response = await groq.chat.completions.create({
    model: config.groqModel,
    messages,
    max_tokens: 256,
    temperature: 0.7,
  });

  if (!response.choices || !response.choices.length || !response.choices[0].message) {
    throw new Error('Empty response from Groq');
  }

  return response.choices[0].message.content;
}

async function callOpenRouter(messages, apiKey, model) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stratixagency.site',
      'X-Title': 'Stratix Agency Bot',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 256,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${error}`);
  }

  const data = await response.json();
  if (!data.choices || !data.choices.length || !data.choices[0].message) {
    throw new Error('Empty response from OpenRouter');
  }

  return data.choices[0].message.content;
}

export async function generateReply(chatId, userMessage) {
  try {
    const lowerMsg = userMessage.toLowerCase();

    if (isPromptInjection(userMessage)) {
      console.log(`[Injection blocked] ${chatId}: ${userMessage.slice(0, 60)}`);
      return "haha I think you got the wrong person, I'm Yasky from Stratix Agency. What can I help you with?";
    }

    cleanupOldHistories();

    const history = getChatHistory(chatId);
    history.push({ role: 'user', content: userMessage });
    trimHistory(history);

    const messages = [
      { role: 'system', content: config.systemPrompt },
      ...history,
    ];

    let reply = await callGroq(messages);

    if (!reply || !reply.trim()) {
      return "hmm something went wrong, try again in a bit";
    }

    history.push({ role: 'assistant', content: reply });
    trimHistory(history);

    return reply;
  } catch (error) {
    console.error('Groq API error:', error.message);
    if (error.status === 429) {
      return "hey I'm a bit swamped right now, give me a sec and try again";
    }
    return "hmm something went wrong, try again in a bit";
  }
}

export async function translateReply(text, targetLangHint) {
  try {
    const prompt = `Translate this WhatsApp message to ${targetLangHint || 'English'}. Keep it natural and casual. Only output the translation:\n\n${text}`;

    const messages = [
      { role: 'system', content: 'You are a translator. Output only the translation.' },
      { role: 'user', content: prompt },
    ];

    // Use OpenRouter for translation (free model)
    const translated = await callOpenRouter(messages, config.openrouterApiKey, 'meta-llama/llama-3.1-8b-instruct:free');
    return translated || text;
  } catch (error) {
    console.error('[Translation error]:', error.message);
    return text;
  }
}

export function detectLanguage(text) {
  if (/[\u0900-\u0939]/.test(text)) return 'Hindi';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'Malayalam';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil';
  if (/[\u0600-\u06FF]/.test(text)) return 'Arabic';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'Thai';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'Chinese';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'Japanese';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'Korean';
  if (/[\u0400-\u04FF]/.test(text)) return 'Russian';
  return null;
}

export function clearHistory(chatId) {
  chatHistories.delete(chatId);
}
