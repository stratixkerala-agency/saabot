import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { generateReply, detectLanguage, translateReply } from './ai.js';
import { generateQuoteFromConversation } from './invoice.js';
import { typingDelay, canSendMessage, recordMessage, apiCooldown } from './antiBan.js';
import { setOnline, setQr, logConversation } from './server.js';
import { updateProfile, getProfile } from './profiles.js';

const STATE_FILE = './bot-state.json';
const CONTACTS_FILE = './contacts-seen.json';
const AUTH_DIR = './sessions';
const pendingQuotes = new Map(); // chatId -> { service, name }

function loadState() {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch { return { enabled: true }; }
  }
  return { enabled: true };
}
function saveState(state) {
  try { writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch {}
}
let botState = loadState();

function loadContacts() {
  if (existsSync(CONTACTS_FILE)) {
    try { return JSON.parse(readFileSync(CONTACTS_FILE, 'utf-8')); } catch { return {}; }
  }
  return {};
}
function saveContacts(c) {
  try { writeFileSync(CONTACTS_FILE, JSON.stringify(c, null, 2)); } catch {}
}
let contactsSeen = loadContacts();

const WELCOME_MSG = `hey! welcome to Stratix Agency, I'm Yasky.

what can I help you with?
1. services
2. pricing
3. careers/jobs
4. talk to someone

or just ask me anything`;

function getChatId(msg) {
  const jid = msg.key.remoteJid;
  if (jid === 'status@broadcast') return null;
  if (jid.endsWith('@g.us')) return null;
  if (jid.endsWith('@newsletter')) return null;
  return jid;
}

function extractAndStoreProfile(chatId, text) {
  const lower = text.toLowerCase();
  const current = getProfile(chatId);

  // Extract name if not already collected
  if (!current.name) {
    const namePatterns = [
      /(?:my name is|i'm|im|i am)\s+([A-Z][a-z]+)/i,
      /(?:call me|this is)\s+([A-Z][a-z]+)/i,
    ];
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1].length > 1) {
        updateProfile(chatId, { name: match[1].trim(), step: 'has_name' });
        console.log(`[Profile] name captured: ${match[1].trim()}`);
        break;
      }
    }
  }

  // Extract service if not already collected
  if (!current.service) {
    if (/website|web\s*dev|landing\s*page/i.test(text) && !/ai|ecom|auto/i.test(text)) {
      updateProfile(chatId, { service: 'website', step: 'has_service' });
    } else if (/ai|chatbot|automation|intelligent/i.test(text) && !/ecom/i.test(text)) {
      updateProfile(chatId, { service: 'website + ai', step: 'has_service' });
    } else if (/ecommerce|ecom|shop|store/i.test(text)) {
      updateProfile(chatId, { service: 'ecommerce', step: 'has_service' });
    } else if (/marketing|ads|meta|influencer|shoot/i.test(text)) {
      updateProfile(chatId, { service: 'marketing', step: 'has_service' });
    } else if (/auto|sales\s*agent|messaging/i.test(text)) {
      updateProfile(chatId, { service: 'ai automation', step: 'has_service' });
    }
  }

  // Extract business type if not already collected
  if (!current.business) {
    const bizPatterns = [
      /(?:business|store|shop|company|brand)\s+(?:is|does|sells| deals?)\s+(.{10,50})/i,
      /(?:i|we)\s+(?:sell|deal|run|have)\s+(.{10,50})/i,
      /(?:my|our)\s+(?:business|store|shop)\s+(?:is|does)\s+(.{10,50})/i,
    ];
    for (const pattern of bizPatterns) {
      const match = text.match(pattern);
      if (match) {
        updateProfile(chatId, { business: match[1].trim().slice(0, 50) });
        console.log(`[Profile] business captured: ${match[1].trim().slice(0, 50)}`);
        break;
      }
    }
  }

  // Extract budget if not already collected
  if (!current.budget) {
    const budgetMatch = text.match(/(\d[\d,]*)\s*(?:k|inr|rs|₹|lakh|lac)/i);
    if (budgetMatch) {
      updateProfile(chatId, { budget: budgetMatch[0] });
      console.log(`[Profile] budget captured: ${budgetMatch[0]}`);
    }
  }
}

async function startBot() {
  if (process.env.RESET_SESSIONS === 'true') {
    try { require('fs').rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
    console.log('[Sessions cleared]');
  }
  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ['Yasky Bot', 'Safari', '3.0'],
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      setQr(qr);
      console.log('\n--- Scan QR code from dashboard ---');
    }

    if (connection === 'open') {
      setOnline(true);
      console.log('\n✓ Yasky is online!');
      console.log(`  Status: ${botState.enabled ? 'ON' : 'OFF'}\n`);
    }

    if (connection === 'close') {
      setOnline(false);
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log('[Disconnected]:', reason);

      if (reason === DisconnectReason.loggedOut) {
        console.log('[Logged out — clearing sessions]');
        try { require('fs').rmSync(AUTH_DIR, { recursive: true }); } catch {}
        setTimeout(() => startBot(), 3000);
      } else {
        console.log('[Reconnecting in 3s...]');
        setTimeout(() => startBot(), 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        // Ignore ALL own messages - only process incoming
        if (msg.key.fromMe) {
          const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
          const lower = text.toLowerCase().trim();
          if (lower === 'bot on') { botState.enabled = true; saveState(botState); console.log('[Bot ON]'); }
          if (lower === 'bot off') { botState.enabled = false; saveState(botState); console.log('[Bot OFF]'); }
          return;
        }

        if (!botState.enabled) return;

        const chatId = getChatId(msg);
        if (!chatId) return;

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        if (!text) return;
        const trimmed = text.trim();
        if (!trimmed) return;

        console.log(`[MSG] from: ${chatId} body: ${trimmed.slice(0, 50)}`);

        if (trimmed.length > 500) {
          await sock.sendMessage(chatId, { text: 'that was a bit long, can you keep it shorter?' });
          return;
        }

        // Anti-spam: skip if last message was < 3 seconds ago
        const contact = contactsSeen[chatId];
        if (contact) {
          const lastMsg = contact.lastMessageTime ? new Date(contact.lastMessageTime) : null;
          const now = new Date();
          if (lastMsg && (now - lastMsg) < 3000) {
            console.log(`[Spam blocked] ${chatId}`);
            return;
          }
        }

        // First message - send welcome
        const isFirstMessage = !contactsSeen[chatId];
        if (isFirstMessage) {
          contactsSeen[chatId] = { firstSeen: new Date().toISOString(), messageCount: 0, lastMessageTime: new Date().toISOString() };
          saveContacts(contactsSeen);
          console.log(`[New contact]: ${chatId}`);
          await sock.sendMessage(chatId, { text: WELCOME_MSG });
          logConversation(chatId, trimmed, WELCOME_MSG);
          return;
        }

        contactsSeen[chatId].messageCount = (contactsSeen[chatId].messageCount || 0) + 1;
        contactsSeen[chatId].lastMessageTime = new Date().toISOString();
        saveContacts(contactsSeen);

        console.log(`[Message from ${chatId}]: ${trimmed}`);

        if (!canSendMessage()) { console.log('[Rate limited]'); return; }

        // Extract and store user details from message
        extractAndStoreProfile(chatId, trimmed);

        const lowerText = trimmed.toLowerCase();

        // Check if user has a pending quote they're responding to
        if (pendingQuotes.has(chatId)) {
          const pending = pendingQuotes.get(chatId);
          if (/\b(yes|yeah|yep|sure|send|please|haan|aa|sheriy|kuranj)\b/i.test(lowerText)) {
            pendingQuotes.delete(chatId);
            
            // Re-detect ALL services from full conversation before generating
            const history = getChatHistory(chatId);
            const fullConv = history.map(m => m.content).join(' ').toLowerCase() + ' ' + lowerText;
            
            const services = [];
            if (/website|site|web\s*dev/i.test(fullConv)) services.push('website');
            if (/ecommerce|ecom|shop|store/i.test(fullConv)) services.push('ecommerce');
            if (/video|ads|reel|shoot|production/i.test(fullConv)) services.push('video production');
            if (/market|social|meta|promot/i.test(fullConv)) services.push('marketing');
            if (/ai|chatbot|intelligent/i.test(fullConv)) services.push('ai');
            if (/automation|auto|sales\s*agent|messaging/i.test(fullConv)) services.push('ai automation');
            if (/whatsapp|msg|message/i.test(fullConv)) services.push('whatsapp automation');
            if (/saas|workflow|hospital|management|custom|system/i.test(fullConv)) services.push('saas');
            if (/brand|logo|identity/i.test(fullConv)) services.push('branding');
            if (/graphic|design|poster|flyer/i.test(fullConv)) services.push('graphic designing');
            if (/seo|search/i.test(fullConv)) services.push('seo');
            
            const finalService = services.length > 1 ? services[0] + ' + ' + services.slice(1).join(' + ') : services[0] || pending.service;

            await typingDelay();
            await sock.sendMessage(chatId, { text: `generating your ${finalService} quote, one sec...` });
            try {
              const pdfBuffer = await generateQuoteFromConversation(chatId, finalService, null, pending.name);
              await sock.sendMessage(chatId, {
                document: pdfBuffer,
                fileName: `Stratix-${finalService.replace(/\s+/g, '-')}-Quote.pdf`,
                mimetype: 'application/pdf',
                caption: `here's your ${finalService} quote! take a look and let me know if you want to go ahead`
              });
              recordMessage();
              logConversation(chatId, trimmed, `[Quote sent: ${finalService}]`);
              continue;
            } catch (err) {
              console.error('[Quote error]:', err.message);
              await sock.sendMessage(chatId, { text: 'hmm something went wrong generating the quote, try again in a bit' });
              continue;
            }
          } else if (/\b(no|nah|nope|illa)\b/i.test(lowerText)) {
            pendingQuotes.delete(chatId);
            await typingDelay();
            await sock.sendMessage(chatId, { text: 'no worries! let me know if you need anything else' });
            continue;
          }
        }

        // Only trigger quote on EXPLICIT requests like "send quote", "generate quote", "get me a quote"
        if (/\b(send|generate|get|make|create)\s+(me\s+)?(a\s+)?(quote|invoice|pdf|bill)\b/i.test(lowerText)) {
          await typingDelay();

          const profile = getProfile(chatId);
          const clientName = profile?.name || 'Customer';

          // Detect ALL services from full conversation context
          const history = getChatHistory(chatId);
          const fullConv = history.map(m => m.content).join(' ').toLowerCase() + ' ' + lowerText;

          const services = [];
          if (/website|site|web\s*dev/i.test(fullConv)) services.push('website');
          if (/ecommerce|ecom|shop|store/i.test(fullConv)) services.push('ecommerce');
          if (/video|ads|reel|shoot|production/i.test(fullConv)) services.push('video production');
          if (/market|social|meta|ads|promot/i.test(fullConv)) services.push('marketing');
          if (/ai|chatbot|intelligent/i.test(fullConv)) services.push('ai');
          if (/automation|auto|sales\s*agent|messaging/i.test(fullConv)) services.push('ai automation');
          if (/whatsapp|msg|message/i.test(fullConv)) services.push('whatsapp automation');
          if (/saas|workflow|hospital|management|custom|system/i.test(fullConv)) services.push('saas');
          if (/brand|logo|identity/i.test(fullConv)) services.push('branding');
          if (/graphic|design|poster|flyer/i.test(fullConv)) services.push('graphic designing');
          if (/seo|search/i.test(fullConv)) services.push('seo');

          // Use first service or combine
          const service = services.length > 1 ? services[0] + ' + ' + services.slice(1).join(' + ') : services[0] || 'website';

          await sock.sendMessage(chatId, { text: `generating your ${service} quote, one sec...` });
          try {
            const pdfBuffer = await generateQuoteFromConversation(chatId, service, null, clientName);
            await sock.sendMessage(chatId, {
              document: pdfBuffer,
              fileName: `Stratix-${service.replace(/\s+/g, '-')}-Quote.pdf`,
              mimetype: 'application/pdf',
              caption: `here's your ${service} quote! take a look and let me know if you want to go ahead`
            });
            recordMessage();
            logConversation(chatId, trimmed, `[PDF quote sent: ${service}]`);
            console.log(`[Quote PDF sent] ${service} to ${chatId}`);
            continue;
          } catch (err) {
            console.error('[Quote error]:', err.message);
            await sock.sendMessage(chatId, { text: 'hmm something went wrong generating the quote, try again in a bit' });
            continue;
          }
        }

        await typingDelay();

        // Generate reply (Groq - no cooldown needed)
        let reply = await generateReply(chatId, trimmed);

        // Always strip any leaked markers from reply
        if (reply) {
          reply = reply.replace(/\[GENERATE_QUOTE[^\]]*\]/gi, '').trim();
        }

        // Check if AI response indicates interest - ask if they want a quote
        if (reply && !pendingQuotes.has(chatId) && /\b(quote|send.*quote|interested|price|pricing|cost|rate|package)\b/i.test(reply)) {
          // Detect service from conversation
          let service = 'website';
          if (/ecommerce|ecom|shop|store/i.test(lowerText + ' ' + reply)) service = 'ecommerce';
          else if (/ai|chatbot|intelligent/i.test(lowerText + ' ' + reply)) service = 'website + ai';
          else if (/market|ads|meta|social/i.test(lowerText + ' ' + reply)) service = 'marketing';
          else if (/auto|sales\s*agent|messaging/i.test(lowerText + ' ' + reply)) service = 'ai automation';

          const profile = getProfile(chatId);
          const clientName = profile?.name || 'Customer';

          // Check if they mentioned multiple services
          const fullConv = lowerText + ' ' + reply;
          const wantsWebsite = /website/i.test(fullConv);
          const wantsMarketing = /market|social|ads/i.test(fullConv);

          if (wantsWebsite && wantsMarketing) {
            service = 'website + marketing';
          }

          // Ask if they want a quote
          pendingQuotes.set(chatId, { service, name: clientName });
          reply += '\n\nwant me to send you a quote?';
        }

        // Translate if non-English (OpenRouter - add cooldown)
        const detectedLang = detectLanguage(trimmed);
        if (detectedLang && reply) {
          await apiCooldown();
          reply = await translateReply(reply, detectedLang);
        }

        if (!reply) continue;

        await sock.sendMessage(chatId, { text: reply });
        recordMessage();
        logConversation(chatId, trimmed, reply);
        console.log(`[Replied]: ${reply.slice(0, 80)}...`);
      } catch (err) {
        console.error('[Message error]:', err.message);
      }
    }
  });

  console.log('Starting Yasky...');
}

process.on('SIGINT', () => {
  console.log('\n[Shutting down...]');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught]:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('[Unhandled]:', err?.message || err);
});

startBot().catch(err => { console.error('Fatal:', err); process.exit(1); });
