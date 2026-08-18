import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { generateReply, detectLanguage, translateReply } from './ai.js';
import { generateQuoteFromConversation } from './invoice.js';
import { typingDelay, canSendMessage, recordMessage } from './antiBan.js';
import { setOnline, setQr, logConversation } from './server.js';

const STATE_FILE = './bot-state.json';
const CONTACTS_FILE = './contacts-seen.json';
const AUTH_DIR = './sessions';

// Invoice conversation state per chat
const invoiceStates = new Map();

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

function getSender(msg) {
  if (msg.key.fromMe) return 'me';
  return msg.key.participant || msg.key.remoteJid;
}

function isInvoiceRequest(text) {
  const lower = text.toLowerCase();
  return /\b(quote|invoice|bill|price\s*list|pricing|generate.*quote|send.*quote|send.*invoice|pdf|receipt|estimate)\b/.test(lower);
}

function isInvoiceConfirm(text) {
  const lower = text.toLowerCase();
  return /\b(yes|yeah|sure|ok|okay|please|generate|send|do\s*it)\b/.test(lower);
}

async function handleInvoiceFlow(chatId, text, sock) {
  const state = invoiceStates.get(chatId);

  if (!state) {
    // Check if user wants a quote
    if (isInvoiceRequest(text)) {
      invoiceStates.set(chatId, { step: 'ask_name', timestamp: Date.now() });
      return "sure! I'll generate a quote for you. what's your name?";
    }
    return null;
  }

  // Clear stale states (older than 5 minutes)
  if (Date.now() - state.timestamp > 300000) {
    invoiceStates.delete(chatId);
    return null;
  }

  const lower = text.toLowerCase();

  // Cancel invoice flow
  if (/\b(cancel|never\s*mind|forget\s*it|stop|no\s*thanks)\b/.test(lower)) {
    invoiceStates.delete(chatId);
    return "no worries! let me know if you need anything else";
  }

  switch (state.step) {
    case 'ask_name':
      state.clientName = text.trim();
      state.step = 'ask_service';
      state.timestamp = Date.now();
      return `got it ${state.clientName}! what service do you need a quote for?\n\n1. website (₹20K)\n2. website + AI (₹35K)\n3. ecommerce (₹55K+)\n4. AI automation (₹6K/mo)\n5. marketing (₹15K/mo)`;

    case 'ask_service':
      let service = 'website';
      let serviceName = 'Website Package';

      if (/1|website|web/i.test(text) && !/ai|ecom|auto/i.test(text)) {
        service = 'website';
        serviceName = 'Website Package';
      } else if (/2|website.*ai|ai.*website/i.test(text)) {
        service = 'website + ai';
        serviceName = 'Website + AI Package';
      } else if (/3|ecommerce|ecommerce/i.test(text)) {
        service = 'ecommerce';
        serviceName = 'Ecommerce + AI Package';
      } else if (/4|automation|auto|ai\s*auto/i.test(text)) {
        service = 'ai automation';
        serviceName = 'AI Automation';
      } else if (/5|marketing|meta|ads|influencer/i.test(text)) {
        service = 'marketing';
        serviceName = 'Marketing Services';
      } else {
        service = text.trim().toLowerCase();
        serviceName = text.trim();
      }

      state.service = service;
      state.serviceName = serviceName;
      state.step = 'confirm';
      state.timestamp = Date.now();
      return `got it - ${serviceName}. want me to generate the quote now? (say yes or no)`;

    case 'confirm':
      if (isInvoiceConfirm(text)) {
        invoiceStates.delete(chatId);
        await sock.sendMessage(chatId, { text: 'one sec, generating your quote...' });

        try {
          const pdfBuffer = await generateQuoteFromConversation(
            chatId,
            state.service,
            null,
            state.clientName
          );

          await sock.sendMessage(chatId, {
            document: pdfBuffer,
            fileName: `Stratix-Quote-${state.clientName.replace(/\s+/g, '-')}.pdf`,
            mimetype: 'application/pdf',
            caption: `here's your quote for ${state.serviceName}! take a look and let me know if you want to go ahead 😊`
          });
        } catch (err) {
          console.error('[Invoice error]:', err.message);
          await sock.sendMessage(chatId, { text: 'hmm something went wrong generating the quote, try again in a bit' });
        }
        return null;
      } else {
        invoiceStates.delete(chatId);
        return "no worries! just say 'quote' when you're ready";
      }

    default:
      invoiceStates.delete(chatId);
      return null;
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
        if (msg.key.fromMe) {
          const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
          const lower = text.toLowerCase().trim();
          if (lower === 'bot on') { botState.enabled = true; saveState(botState); console.log('[Bot ON]'); return; }
          if (lower === 'bot off') { botState.enabled = false; saveState(botState); console.log('[Bot OFF]'); return; }
        }

        if (!botState.enabled) return;

        const chatId = getChatId(msg);
        if (!chatId) return;

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        if (!text) return;
        const trimmed = text.trim();
        if (!trimmed) return;

        console.log(`[MSG] from: ${chatId} body: ${trimmed.slice(0, 50)}`);

        if (trimmed.length > 1000) {
          await sock.sendMessage(chatId, { text: 'that was a bit long, can you keep it shorter?' });
          return;
        }

        const contact = contactsSeen[chatId];
        if (contact) {
          const lastMsg = contact.lastMessageTime ? new Date(contact.lastMessageTime) : null;
          const now = new Date();
          if (lastMsg && (now - lastMsg) < 5000) {
            console.log(`[Spam blocked] ${chatId}`);
            return;
          }
        }

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

        // Check invoice flow first
        const invoiceReply = await handleInvoiceFlow(chatId, trimmed, sock);
        if (invoiceReply) {
          await typingDelay();
          await sock.sendMessage(chatId, { text: invoiceReply });
          recordMessage();
          logConversation(chatId, trimmed, invoiceReply);
          console.log(`[Invoice flow]: ${invoiceReply.slice(0, 80)}`);
          continue;
        }

        // Detect language for multilingual support
        const detectedLang = detectLanguage(trimmed);
        const needsTranslation = detectedLang !== null;

        await typingDelay();

        // Generate reply
        let reply = await generateReply(chatId, trimmed);

        // Translate if non-English
        if (needsTranslation && reply) {
          reply = await translateReply(reply, detectedLang);
        }

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
