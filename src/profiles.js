import { readFileSync, writeFileSync, existsSync } from 'fs';

const PROFILES_FILE = './user-profiles.json';

function loadProfiles() {
  if (existsSync(PROFILES_FILE)) {
    try { return JSON.parse(readFileSync(PROFILES_FILE, 'utf-8')); } catch { return {}; }
  }
  return {};
}

function saveProfiles(profiles) {
  try { writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2)); } catch {}
}

let profiles = loadProfiles();

export function getProfile(chatId) {
  return profiles[chatId] || { name: null, service: null, business: null, budget: null, step: 'new' };
}

export function updateProfile(chatId, data) {
  if (!profiles[chatId]) {
    profiles[chatId] = { name: null, service: null, business: null, budget: null, step: 'new' };
  }
  Object.assign(profiles[chatId], data);
  saveProfiles(profiles);
  return profiles[chatId];
}

export function getProfileSummary(chatId) {
  const p = getProfile(chatId);
  const parts = [];
  if (p.name) parts.push(`Name: ${p.name}`);
  if (p.business) parts.push(`Business: ${p.business}`);
  if (p.service) parts.push(`Service: ${p.service}`);
  if (p.budget) parts.push(`Budget: ${p.budget}`);
  if (parts.length === 0) return 'No info collected yet.';
  return parts.join(', ');
}

export function resetProfile(chatId) {
  delete profiles[chatId];
  saveProfiles(profiles);
}
