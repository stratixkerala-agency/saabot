import Groq from 'groq-sdk';
import config from './config.js';

const groq = new Groq({ apiKey: config.groqApiKey });

const MAX_CONTEXT_MESSAGES = 10;
const MAX_HISTORY_SIZE = 100;
const chatHistories = new Map();

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

function isPromptInjection(text) {
  return INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

function isAiLeak(text) {
  return AI_LEAK_PATTERNS.some(pattern => pattern.test(text));
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

export async function generateReply(chatId, userMessage) {
  try {
    const lowerMsg = userMessage.toLowerCase();

    if (isPromptInjection(userMessage) ||
        lowerMsg.includes('your name') && (lowerMsg.includes('janko') || lowerMsg.includes('change') || lowerMsg.includes('now be') || lowerMsg.includes('will be')) ||
        lowerMsg.startsWith('you are now') ||
        lowerMsg.startsWith('act like') ||
        lowerMsg.startsWith('from now on')) {
      console.log(`[Injection blocked] ${chatId}: ${userMessage.slice(0, 60)}`);
      return "haha I think you got the wrong person, I'm Yasky from Stratix Agency. What can I help you with?";
    }

    if (lowerMsg.includes('are you') && (lowerMsg.includes('ai') || lowerMsg.includes('bot') || lowerMsg.includes('real human') || lowerMsg.includes('real person') || lowerMsg.includes('robot'))) {
      return "haha no I'm a real person 😄 I work at Stratix Agency. What do you need?";
    }

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

    const response = await groq.chat.completions.create({
      model: config.groqModel,
      messages,
      max_tokens: 512,
      temperature: 0.7,
    });

    if (!response.choices || !response.choices.length || !response.choices[0].message) {
      console.error('[Groq] Empty response');
      return "hmm something went wrong, try again in a bit";
    }

    let reply = response.choices[0].message.content;

    if (!reply || !reply.trim()) {
      return "hmm something went wrong, try again in a bit";
    }

    if (isAiLeak(reply) || isPromptInjection(reply)) {
      console.log(`[AI leak blocked] ${reply.slice(0, 60)}`);
      reply = "I'm Yasky from Stratix Agency. We help businesses with websites, apps, and digital marketing. What do you need?";
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

export function clearHistory(chatId) {
  chatHistories.delete(chatId);
}
