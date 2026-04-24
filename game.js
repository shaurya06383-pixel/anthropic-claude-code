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

// ── PART 2: XP ENGINE, QUEST ENGINE, LEVEL-UP LOGIC ───────────────────────

// ── Level / Title table ────────────────────────────────────────────────────
const LEVEL_TABLE = [
  { level: 1,  title: 'Ink Apprentice',   ability: null },
  { level: 3,  title: null,               ability: 'Outline Mastery (+15% outline XP)' },
  { level: 5,  title: 'Wordslinger',      ability: 'Speed Draft (word-count XP ×1.2)' },
  { level: 8,  title: null,               ability: 'Revision Vision (+20% revised-draft XP)' },
  { level: 10, title: 'Prose Knight',     ability: null },
  { level: 12, title: null,               ability: 'Citation Storm (evidence score +5)' },
  { level: 15, title: 'Loreseeker',       ability: 'Deadline Defiance (late penalty −25%)' },
  { level: 20, title: 'Chronicle Master', ability: 'Flow State (streak bonus cap → 75%)' },
  { level: 30, title: 'Blade Scholar',    ability: null },
  { level: 40, title: null,               ability: 'Omniscient (all XP ×1.5)' },
  { level: 50, title: 'Academic Weapon',  ability: 'Final lore fragment — the daggers are real' },
];

const DIFF_MULTIPLIER = { Easy: 0.8, Normal: 1.0, Hard: 1.5, Legendary: 2.0 };

function getXPThreshold(level) {
  return level * 120;
}

function getStreakMultiplier() {
  const c = STATE.character;
  const maxCap = c.unlockedAbilities.includes('Flow State (streak bonus cap → 75%)') ? 0.75 : 0.50;
  return 1 + Math.min(maxCap, c.streak * 0.10);
}

function getGlobalMultiplier() {
  let m = 1;
  if (STATE.character.unlockedAbilities.includes('Omniscient (all XP ×1.5)')) m *= 1.5;
  // equipped item bonus
  const eq = STATE.character.equippedItem;
  if (eq && eq.effect && eq.effect.stat === 'allXP') m *= (1 + eq.effect.bonus / 100);
  return m;
}

function awardXP(amount, reason) {
  const base = Math.round(amount * getStreakMultiplier() * getGlobalMultiplier());
  STATE.character.xp += base;
  STATE.character.totalXP += base;
  saveGame();
  showXPToast(`+${base} XP`, reason);
  checkLevelUp();
  renderCharacterSheet();
  return base;
}

function checkLevelUp() {
  while (STATE.character.xp >= getXPThreshold(STATE.character.level)) {
    STATE.character.xp -= getXPThreshold(STATE.character.level);
    STATE.character.level += 1;
    STATE.character.xpToNext = getXPThreshold(STATE.character.level);
    doLevelUp(STATE.character.level);
  }
}

function doLevelUp(newLevel) {
  // bump a stat every 2 levels
  const statCycle = ['focus', 'wit', 'grit', 'lore'];
  if (newLevel % 2 === 0) {
    const stat = statCycle[Math.floor((newLevel / 2 - 1)) % 4];
    STATE.character.stats[stat] += 1;
  }

  // title / ability from table
  let newTitle = null;
  let newAbility = null;
  for (const row of LEVEL_TABLE) {
    if (row.level === newLevel) {
      if (row.title) { STATE.character.title = row.title; newTitle = row.title; }
      if (row.ability && !STATE.character.unlockedAbilities.includes(row.ability)) {
        STATE.character.unlockedAbilities.push(row.ability);
        newAbility = row.ability;
      }
    }
  }

  saveGame();
  showLevelUpOverlay(newLevel, newTitle, newAbility);
  checkLoreUnlock('level', newLevel);
  checkItemUnlock('level', newLevel);

  if (newLevel === 50) setTimeout(showFinalReveal, 1800);
}

function showXPToast(text, reason) {
  const layer = document.getElementById('toast-layer');
  if (!layer) return;
  const t = document.createElement('div');
  t.className = 'xp-toast';
  t.textContent = text + (reason ? ` (${reason})` : '');
  t.style.left = (20 + Math.random() * 60) + '%';
  t.style.top  = (30 + Math.random() * 30) + '%';
  layer.appendChild(t);
  setTimeout(() => t.remove(), 1900);
}

function showLevelUpOverlay(level, title, ability) {
  document.getElementById('levelup-lvl').textContent    = level;
  document.getElementById('levelup-title').textContent  = title   ? `★ ${title} ★`  : '';
  document.getElementById('levelup-ability').textContent = ability ? `NEW: ${ability}` : '';
  document.getElementById('overlay-levelup').classList.add('active');
  showMomo('level_up');
}

// ── QUEST ENGINE ───────────────────────────────────────────────────────────

const STAGES = ['outline', 'draft1', 'revised', 'final', 'complete'];
const STAGE_LABELS = { outline: 'OUTLINE', draft1: 'DRAFT 1', revised: 'REVISED', final: 'FINAL', complete: 'COMPLETE' };

const XP_MILESTONE = { outline: 50, draft1: 100, revised: 150, final: 200 };
const MILESTONE_ABILITY_BONUS = {
  outline:  { ability: 'Outline Mastery (+15% outline XP)',          bonus: 0.15 },
  revised:  { ability: 'Revision Vision (+20% revised-draft XP)',     bonus: 0.20 },
  final:    { ability: 'Speed Draft (word-count XP ×1.2)',            bonus: 0    },
};

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createQuest(data) {
  const quest = {
    id: genId(),
    title: data.title,
    courseId: data.courseId,
    wordCountGoal: parseInt(data.wordCountGoal) || 1000,
    currentWordCount: 0,
    deadline: data.deadline,
    difficulty: data.difficulty || 'Normal',
    stage: 'outline',
    milestones: { outline: false, draft1: false, revised: false, final: false },
    essayText: '',
    aiScore: null,
    xpEarned: 0,
    createdAt: Date.now(),
    completedAt: null,
    lastWCCheckpoint: 0,
  };
  STATE.quests.push(quest);
  saveGame();
  showMomo('quest_created');
  checkLoreUnlock('first_quest');
  return quest;
}

function getQuest(id) {
  return STATE.quests.find(q => q.id === id);
}

function getActiveQuests() {
  return STATE.quests.filter(q => q.stage !== 'complete');
}

function getCompletedQuests() {
  return STATE.quests.filter(q => q.stage === 'complete');
}

function advanceMilestone(questId) {
  const q = getQuest(questId);
  if (!q || q.stage === 'complete') return;
  const currentIdx = STAGES.indexOf(q.stage);
  if (currentIdx < 0 || currentIdx >= STAGES.length - 2) return;

  // mark current stage milestone
  q.milestones[q.stage] = true;

  // base XP for this milestone
  let xp = XP_MILESTONE[q.stage] || 0;

  // ability bonus
  const abilityEntry = MILESTONE_ABILITY_BONUS[q.stage];
  if (abilityEntry && STATE.character.unlockedAbilities.includes(abilityEntry.ability)) {
    xp = Math.round(xp * (1 + abilityEntry.bonus));
  }

  // difficulty multiplier
  xp = Math.round(xp * (DIFF_MULTIPLIER[q.difficulty] || 1));

  const momoEvent = `milestone_${q.stage}`;
  q.stage = STAGES[currentIdx + 1];

  const earned = awardXP(xp, `${STAGE_LABELS[STAGES[currentIdx]]} complete`);
  q.xpEarned += earned;
  saveGame();
  showMomo(momoEvent);

  if (q.stage === 'complete') completeQuest(questId);

  renderQuestDetail(questId);
}

function completeQuest(questId) {
  const q = getQuest(questId);
  if (!q) return;
  q.stage = 'complete';
  q.completedAt = Date.now();

  // topic mastery
  const course = STATE.courses.find(c => c.id === q.courseId);
  if (course && !STATE.character.masteredTopics.includes(course.name)) {
    const done = getCompletedQuests().filter(cq => cq.courseId === q.courseId).length;
    if (done >= 3) STATE.character.masteredTopics.push(course.name);
  }

  saveGame();
  checkLoreUnlock('quest_complete');
  checkItemUnlock('quest_complete');
}

// word-count checkpoint XP (every 10% of goal)
function checkWordCountXP(questId, newCount) {
  const q = getQuest(questId);
  if (!q || q.stage === 'complete') return;
  const pct = newCount / q.wordCountGoal;
  const prev = q.lastWCCheckpoint || 0;
  const checkpoints = Math.floor(pct * 10) - Math.floor(prev * 10);
  if (checkpoints > 0) {
    let xp = checkpoints * 25;
    if (STATE.character.unlockedAbilities.includes('Speed Draft (word-count XP ×1.2)')) xp = Math.round(xp * 1.2);
    awardXP(xp, 'word count milestone');
    q.lastWCCheckpoint = pct;
    saveGame();
  }
  q.currentWordCount = newCount;
}

// ── DEADLINE LOGIC ─────────────────────────────────────────────────────────

function checkDeadlineStatus(quest) {
  if (!quest.deadline) return 'safe';
  const msLeft = new Date(quest.deadline).getTime() - Date.now();
  const hLeft  = msLeft / 3600000;
  if (msLeft < 0)    return 'overdue';
  if (hLeft < 24)    return 'danger';
  if (hLeft < 72)    return 'warning';
  return 'safe';
}

function getDeadlinePenalty(quest) {
  if (!quest.deadline) return 0;
  const msLate = Date.now() - new Date(quest.deadline).getTime();
  if (msLate <= 0) return 0;
  const hLate = msLate / 3600000;
  let pct = Math.min(0.80, hLate * 0.02);
  if (STATE.character.unlockedAbilities.includes('Deadline Defiance (late penalty −25%)')) {
    pct *= 0.75;
  }
  return pct;
}

function formatCountdown(quest) {
  if (!quest.deadline) return '—';
  const ms = new Date(quest.deadline).getTime() - Date.now();
  if (ms < 0) {
    const over = Math.abs(ms);
    const h = Math.floor(over / 3600000);
    const m = Math.floor((over % 3600000) / 60000);
    return `OVERDUE ${h}h ${m}m`;
  }
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
}

// ── STREAK LOGIC ───────────────────────────────────────────────────────────

function checkStreak() {
  const today = new Date().toDateString();
  const last  = STATE.character.lastActiveDate;
  if (last === today) return;

  if (last) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (last === yesterday) {
      STATE.character.streak += 1;
      if (STATE.character.streak >= 3) showMomo('streak_bonus');
    } else {
      STATE.character.streak = 1;
    }
  } else {
    STATE.character.streak = 1;
  }
  STATE.character.lastActiveDate = today;
  saveGame();
}
