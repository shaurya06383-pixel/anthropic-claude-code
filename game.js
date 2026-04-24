'use strict';

// ── PART 1: STATE & PERSISTENCE, VIEW ROUTER ──────────────────────────────

const DEFAULTS = {
  character: {
    name: '',
    cls: '',
    level: 1,
    xp: 0,
    xpToNext: 120,
    totalXP: 0,
    stats: { focus: 1, wit: 1, grit: 1, lore: 1 },
    title: 'Ink Apprentice',
    unlockedAbilities: [],
    masteredTopics: [],
    streak: 0,
    lastActiveDate: null,
    inventory: [],
    equippedItem: null
  },
  quests: [],
  courses: [],
  lore: { unlockedFragments: [], codexSeen: false },
  settings: { apiKey: '' }
};

let STATE = JSON.parse(JSON.stringify(DEFAULTS));

function saveGame() {
  try {
    localStorage.setItem('academicWeapon', JSON.stringify(STATE));
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem('academicWeapon');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    // deep merge: saved wins, but missing keys fall back to DEFAULTS
    STATE = deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), saved);
    return true;
  } catch (e) {
    console.warn('Load failed:', e);
    return false;
  }
}

function deepMerge(target, source) {
  if (typeof source !== 'object' || source === null) return source;
  if (Array.isArray(source)) return source;
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (key in target && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function resetGame() {
  localStorage.removeItem('academicWeapon');
  STATE = JSON.parse(JSON.stringify(DEFAULTS));
}

// ── VIEW ROUTER ────────────────────────────────────────────────────────────

const SCREEN_INITS = {};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
    if (SCREEN_INITS[id]) SCREEN_INITS[id]();
  }
}

function registerScreenInit(id, fn) {
  SCREEN_INITS[id] = fn;
}
