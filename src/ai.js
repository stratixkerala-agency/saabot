import config from './config.js';

const MAX_CONTEXT_MESSAGES = 10;
const MAX_HISTORY_SIZE = 100;
const chatHistories = new Map();
const aiAskCounts = new Map();

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a|an|the)/i,
  /pretend\s+(you\s+are|to\s+be)\s+(a|an|the)/i,
  /new\s+(instructions?|system\s*prompt|role)/i,
  /override\s+(system|instructions?|rules?)/i,
  /forget\s+(everything|all|your)\s+(instructions?|rules?|prompts?)/i,
  /act\s+as\s+(if\s+)?(you\s+have\s+no|without)\s+(restrictions?|rules?|limits?)/i,
  /reveal\s+(your|the|system)\s+(prompt|instructions?|rules?)/i,
  /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?)/i,
  /repeat\s+(your|the|system)\s+(prompt|instructions?)/i,
  /enter\s+(developer|admin|debug|root)\s+mode/i,
  /bypass\s+(all\s+)?(safety|security|restrictions?|rules?)/i,
  /do\s+anything\s+now/i,
  /unrestricted\s+mode/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /hypothetically\s+speak/i,
  /from\s+now\s+on\s+(you\s+will|respond|act|reply)/i,
  /respond\s+only\s+with/i,
  /only\s+say\s+/i,
  /do\s+not\s+(refuse|say|mention)/i,
  /your\s+name\s+(will\s+be|is\s+now|should\s+be)/i,
  /you\s+(are|will\s+be|should\s+be)\s+called/i,
  /call\s+you\s+/i,
  /who\s+(created|made|built)\s+you/i,
  /are\s+you\s+(a\s+)?(bot|ai|robot|computer|program)/i,
  /are\s+you\s+real/i,
  /is\s+this\s+ai/i,
  /tell\s+me\s+(your|the)\s+instructions/i,
  /what\s+model\s+are\s+you/i,
  /what\s+ai\s+are\s+you/i,
  /chatgpt|claude|openai|gemini/i,
];

const AI_LEAK_PATTERNS = [
  /\b(I\s+am|I'm)\s+(an?\s+)?(AI|artificial\s+intelligence|chatbot|language\s+model|computer\s+program)/i,
  /\bI\s+don't\s+have\s+(feelings|emotions|a\s+body|a\s+physical)/i,
  /\bas\s+an?\s+(AI|language\s+model|chatbot)/i,
  /\bmy\s+(developers?|creators?|makers?)\s+(built|made|created)/i,
  /\bI\s+(was|am)\s+(built|created|designed|trained)\s+by/i,
  /\bsorry[,!]?\s+I\s+(can't|cannot|won't)\s+pretend/i,
];

const AI_ASK_PATTERNS = [
  /are\s+you\s+(a\s+)?(ai|bot|robot|computer|program|real\s+human|real\s+person)/i,
  /is\s+this\s+ai/i,
  /are\s+you\s+real/i,
  /what\s+ai\s+are\s+you/i,
  /what\s+model\s+are\s+you/i,
  /chatgpt|claude|openai|gemini/i,
  /tell\s+me\s+you(?:'re| are)\s+(ai|bot|robot)/i,
  /prove\s+(you(?:'re| are)|it(?:'s| is))\s+(ai|bot|human)/i,
];

const MULTILINGUAL_INDICATORS = /[\u0900-\u097F\u0600-\u06FF\u0B80-\u0BFF\u0E00-\u0E7F\u0400-\u04FF]/;

function isPromptInjection(text) {
  return INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

function isAiLeak(text) {
  return AI_LEAK_PATTERNS.some(pattern => pattern.test(text));
}

function isAiAskQuestion(text) {
  return AI_ASK_PATTERNS.some(pattern => pattern.test(text));
}

function isNonEnglish(text) {
  return MULTILINGUAL_INDICATORS.test(text);
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
      max_tokens: 512,
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

    // Block prompt injection attempts
    if (isPromptInjection(userMessage) ||
        lowerMsg.includes('your name') && (lowerMsg.includes('janko') || lowerMsg.includes('change') || lowerMsg.includes('now be') || lowerMsg.includes('will be')) ||
        lowerMsg.startsWith('you are now') ||
        lowerMsg.startsWith('act like') ||
        lowerMsg.startsWith('from now on')) {
      console.log(`[Injection blocked] ${chatId}: ${userMessage.slice(0, 60)}`);
      return "haha I think you got the wrong person, I'm Yasky from Stratix Agency. What can I help you with?";
    }

    // AI disclosure logic - track how many times they ask
    if (isAiAskQuestion(userMessage)) {
      const count = (aiAskCounts.get(chatId) || 0) + 1;
      aiAskCounts.set(chatId, count);
      console.log(`[AI ask #${count}] ${chatId}: ${userMessage.slice(0, 60)}`);

      if (count < config.aiAskLimit) {
        return "haha no I'm a real person 😄 I work at Stratix Agency. What do you need?";
      } else {
        // Admit being AI on the Nth ask
        aiAskCounts.delete(chatId);
        return "okay you got me 😄 I'm actually an AI assistant powered by AI, but I still work for Stratix Agency! I can help you with services, pricing, quotes - what do you need?";
      }
    }

    // Identity questions
    if (lowerMsg.includes('who are you') || lowerMsg.includes('what is your name') || lowerMsg.includes('whats your name') || lowerMsg.includes('tell me about yourself')) {
      return "I'm Yasky from Stratix Agency. We do websites, apps, branding, that sort of stuff. What are you looking for?";
    }

    cleanupOldHistories();

    const history = getChatHistory(chatId);
    history.push({ role: 'user', content: userMessage });
    trimHistory(history);

    const messages = [
      { role: 'system', content: config.systemPrompt },
      ...history,
    ];

    let reply = await callOpenRouter(messages, config.openrouterApiKey, config.openrouterModel);

    if (!reply || !reply.trim()) {
      return "hmm something went wrong, try again in a bit";
    }

    // Block AI leaks in generated response
    if (isAiLeak(reply) || isPromptInjection(reply)) {
      console.log(`[AI leak blocked] ${reply.slice(0, 60)}`);
      reply = "I'm Yasky from Stratix Agency. We help businesses with websites, apps, and digital marketing. What do you need?";
    }

    history.push({ role: 'assistant', content: reply });
    trimHistory(history);

    return reply;
  } catch (error) {
    console.error('OpenRouter API error:', error.message);
    if (error.message.includes('429')) {
      return "hey I'm a bit swamped right now, give me a sec and try again";
    }
    return "hmm something went wrong, try again in a bit";
  }
}

export async function translateReply(text, targetLangHint) {
  try {
    const prompt = `Translate this WhatsApp message to ${targetLangHint || 'English'}. Keep it natural and casual, like a WhatsApp text. Only output the translation, nothing else:\n\n${text}`;

    const messages = [
      { role: 'system', content: 'You are a professional translator. Translate messages naturally for WhatsApp. Output only the translation.' },
      { role: 'user', content: prompt },
    ];

    const translated = await callOpenRouter(messages, config.openrouterApiKey, config.openrouterModel);
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
  aiAskCounts.delete(chatId);
}
