import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, 'utf-8');
  const lines = raw.split('\n');
  let currentKey = null;
  let currentValue = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex !== -1) {
      if (currentKey) {
        process.env[currentKey] = currentValue.join('\n');
      }
      currentKey = trimmed.slice(0, eqIndex).trim();
      currentValue = [trimmed.slice(eqIndex + 1).trim()];
    } else if (currentKey) {
      currentValue.push(trimmed);
    }
  }
  if (currentKey) {
    process.env[currentKey] = currentValue.join('\n');
  }
}

loadEnv();

const config = {
  groqApiKey: process.env.GROQ_API_KEY,
  systemPrompt: process.env.SYSTEM_PROMPT || 'You are a helpful WhatsApp assistant.',
  minDelay: parseInt(process.env.MIN_DELAY_MS || '2000', 10),
  maxDelay: parseInt(process.env.MAX_DELAY_MS || '4000', 10),
  maxMessagesPerMinute: parseInt(process.env.MAX_MESSAGES_PER_MINUTE || '20', 10),
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
};

if (!config.groqApiKey) {
  console.error('GROQ_API_KEY is required. Set it in .env or Railway Variables.');
  process.exit(1);
}

export default config;
