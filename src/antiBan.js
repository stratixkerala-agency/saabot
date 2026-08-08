import config from './config.js';

const messageTimestamps = [];

function randomDelay() {
  return config.minDelay + Math.random() * (config.maxDelay - config.minDelay);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function typingDelay() {
  let delay = randomDelay();

  // 15% chance of a longer pause (simulates human thinking)
  if (Math.random() < 0.15) {
    delay += 5000 + Math.random() * 10000;
  }

  await sleep(delay);
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
