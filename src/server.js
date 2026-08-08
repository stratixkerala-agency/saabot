import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const STATE_FILE = './bot-state.json';
const CONTACTS_FILE = './contacts-seen.json';
const CONVERSATIONS_FILE = './conversations.json';

let whatsappClient = null;
let botStatus = { online: false, qr: null };

function loadJson(file, fallback) {
  if (existsSync(file)) {
    try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return fallback; }
  }
  return fallback;
}

function saveJson(file, data) {
  try { writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
}

export function setClient(client) {
  whatsappClient = client;
}

export function setOnline(status) {
  botStatus.online = status;
}

export function setQr(qr) {
  botStatus.qr = qr;
}

export function logConversation(chatId, message, reply) {
  const convos = loadJson(CONVERSATIONS_FILE, {});
  if (!convos[chatId]) convos[chatId] = [];
  convos[chatId].push({
    from: message,
    reply: reply,
    time: new Date().toISOString()
  });
  if (convos[chatId].length > 50) convos[chatId] = convos[chatId].slice(-50);
  saveJson(CONVERSATIONS_FILE, convos);
}

app.get('/api/status', (req, res) => {
  const state = loadJson(STATE_FILE, { enabled: true });
  res.json({
    online: botStatus.online,
    enabled: state.enabled,
    hasQr: !!botStatus.qr
  });
});

app.post('/api/toggle', (req, res) => {
  const state = loadJson(STATE_FILE, { enabled: true });
  state.enabled = !state.enabled;
  saveJson(STATE_FILE, state);
  res.json({ enabled: state.enabled });
});

app.get('/api/contacts', (req, res) => {
  const contacts = loadJson(CONTACTS_FILE, {});
  const list = Object.entries(contacts).map(([id, data]) => ({
    id,
    ...data
  })).sort((a, b) => new Date(b.lastMessageTime || 0) - new Date(a.lastMessageTime || 0));
  res.json(list);
});

app.get('/api/conversations', (req, res) => {
  const convos = loadJson(CONVERSATIONS_FILE, {});
  res.json(convos);
});

app.get('/api/conversation/:id', (req, res) => {
  const convos = loadJson(CONVERSATIONS_FILE, {});
  res.json(convos[req.params.id] || []);
});

app.get('/api/config', (req, res) => {
  res.json({
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    website: 'stratixagency.site'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
});
