import config from './config.js';

const messageTimestamps = [];
let lastApiCall = 0;
const API_COOLDOWN = 1500; // 1.5 seconds between API calls

function randomDelay() {
  return config.minDelay + Math.random() * (config.maxDelay - config.minDelay);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function typingDelay() {
  let delay = randomDelay();

  // 10% chance of a longer pause (simulates human thinking)
  if (Math.random() < 0.10) {
    delay += 2000 + Math.random() * 3000;
  }

  await sleep(delay);
}

// Wait for API cooldown between calls
export async function apiCooldown() {
  const now = Date.now();
  const elapsed = now - lastApiCall;
  if (elapsed < API_COOLDOWN) {
    const wait = API_COOLDOWN - elapsed + Math.random() * 500;
    console.log(`[API cooldown] waiting ${Math.round(wait)}ms`);
    await sleep(wait);
  }
  lastApiCall = Date.now();
}

export function canSendMessage() {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  while (messageTimestamps.length > 0 && messageTimestamps[0] < oneMinuteAgo) {
    messageTimestamps.shift();
  }

  return messageTimestamps.length < config.maxMessagesPerMinute;
}

export function recordMessage() {
  messageTimestamps.push(Date.now());
}
