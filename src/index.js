import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { generateReply } from './ai.js';
import { typingDelay, canSendMessage, recordMessage } from './antiBan.js';
import { setOnline, setQr, logConversation } from './server.js';

const STATE_FILE = './bot-state.json';
const CONTACTS_FILE = './contacts-seen.json';

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

function isDocker() { return existsSync('/.dockerenv'); }

function askQuestion(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans.trim()); }));
}

const puppeteerConfig = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
  ],
};

if (isDocker()) {
  puppeteerConfig.executablePath = '/usr/bin/chromium';
} else if (process.platform === 'win32') {
  puppeteerConfig.executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

const WELCOME_MSG = `hey! welcome to Stratix Agency, I'm Yasky.

what can I help you with?
1. services
2. pricing
3. careers/jobs
4. talk to someone

or just ask me anything`;

let client = null;

function startBot() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './sessions' }),
    puppeteer: puppeteerConfig,
  });

  client.on('qr', async (qr) => {
    await setQr(qr);
    console.log('\n--- Scan QR code from dashboard ---');
    console.log(`  Dashboard: http://localhost:${process.env.PORT || 3000}\n`);
  });

  client.on('ready', () => {
    setOnline(true);
    console.log('\n✓ Yasky is online!');
    console.log(`  Dashboard: http://localhost:${process.env.PORT || 3000}`);
    console.log(`  Status: ${botState.enabled ? 'ON' : 'OFF'}\n`);
  });

  client.on('authenticated', () => console.log('✓ Authenticated'));
  client.on('auth_failure', (msg) => console.error('Auth failed:', msg));

  client.on('disconnected', (reason) => {
    setOnline(false);
    console.log('[Disconnected]:', reason);
    console.log('[Reconnecting in 5s...]');
    setTimeout(() => {
      try { client.destroy(); } catch {}
      startBot();
    }, 5000);
  });

  client.on('message', async (msg) => {
    try {
      console.log('[MSG DEBUG] from:', msg.from, 'body:', msg.body, 'type:', msg.type, 'isGroup:', msg.isGroup);
      if (msg.isGroup) return;
      const chatId = msg.from;
      if (!chatId) return;
      if (chatId.endsWith('@g.us')) return;
      if (chatId.endsWith('@broadcast')) return;
      if (chatId === 'status@broadcast') return;
      if (chatId.endsWith('@newsletter')) return;

      const text = msg.body;
      if (!text || typeof text !== 'string') return;
      const trimmed = text.trim();
      if (!trimmed) return;

      if (msg.fromMe) {
        const lower = trimmed.toLowerCase();
        if (lower === 'bot on') { botState.enabled = true; saveState(botState); console.log('[Bot ON]'); return; }
        if (lower === 'bot off') { botState.enabled = false; saveState(botState); console.log('[Bot OFF]'); return; }
      }

      if (!botState.enabled) return;

      if (trimmed.length > 1000) {
        await msg.reply('that was a bit long, can you keep it shorter?');
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
        await msg.reply(WELCOME_MSG);
        logConversation(chatId, trimmed, WELCOME_MSG);
        return;
      }

      contactsSeen[chatId].messageCount = (contactsSeen[chatId].messageCount || 0) + 1;
      contactsSeen[chatId].lastMessageTime = new Date().toISOString();
      saveContacts(contactsSeen);

      console.log(`[Message from ${chatId}]: ${trimmed}`);

      if (!canSendMessage()) { console.log('[Rate limited]'); return; }

      await typingDelay();
      const reply = await generateReply(chatId, trimmed);
      await msg.reply(reply);
      recordMessage();
      logConversation(chatId, trimmed, reply);
      console.log(`[Replied]: ${reply.slice(0, 80)}...`);
    } catch (err) {
      console.error('[Message error]:', err.message);
    }
  });

  console.log('Starting Yasky...');
  client.initialize().catch(err => {
    console.error('[Init error]:', err.message);
    console.log('[Retrying in 10s...]');
    setTimeout(() => startBot(), 10000);
  });
}

process.on('SIGINT', () => {
  console.log('\n[Shutting down...]');
  if (client) { try { client.destroy(); } catch {} }
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught]:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('[Unhandled]:', err?.message || err);
});

async function main() {
  const isInteractive = process.stdin.isTTY;

  if (isInteractive) {
    console.log('\n--- Login Method ---');
    console.log('1. QR Code');
    console.log('2. Phone Number');
    await askQuestion('Select (1 or 2): ');
  }

  startBot();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
