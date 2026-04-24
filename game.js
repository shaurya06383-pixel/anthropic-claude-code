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
    AudioEngine.onScreen(id);
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
  AudioEngine.sfx('xp');
}

function showLevelUpOverlay(level, title, ability) {
  document.getElementById('levelup-lvl').textContent    = level;
  document.getElementById('levelup-title').textContent  = title   ? `★ ${title} ★`  : '';
  document.getElementById('levelup-ability').textContent = ability ? `NEW: ${ability}` : '';
  document.getElementById('overlay-levelup').classList.add('active');
  AudioEngine.fanfare();
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

// ── PART 3: AI ENGINE, MOMO DIALOGUE, RENDER FUNCTIONS ────────────────────

// ── AI ENGINE ─────────────────────────────────────────────────────────────

async function evaluateEssay(essayText, quest) {
  const apiKey = STATE.settings.apiKey;
  if (!apiKey) {
    showAIResult(null, 'No API key configured. Go to CONFIG to add your Anthropic key.');
    return;
  }

  showAILoading();

  const diffLabel = quest.difficulty;
  const prompt = `You are an academic essay evaluator. Score the following essay on four dimensions, each out of 25 points (total 100).

Essay title: "${quest.title}"
Difficulty level: ${diffLabel}

Dimensions:
1. thesis (0-25): clarity and strength of the central argument
2. structure (0-25): logical organisation, paragraph flow, introduction and conclusion
3. evidence (0-25): use of examples, citations, supporting detail
4. mechanics (0-25): grammar, spelling, sentence variety, style

Respond ONLY with valid JSON in this exact shape:
{"thesis":0,"structure":0,"evidence":0,"mechanics":0,"feedback":"one paragraph of constructive feedback"}

Essay:
${essayText.slice(0, 6000)}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showAIResult(null, `API error ${res.status}: ${err.error?.message || res.statusText}`);
      return;
    }

    const data = await res.json();
    const raw  = data.content?.[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const scores = JSON.parse(jsonMatch[0]);

    // Citation Storm ability: +5 to evidence
    if (STATE.character.unlockedAbilities.includes('Citation Storm (evidence score +5)')) {
      scores.evidence = Math.min(25, (scores.evidence || 0) + 5);
    }
    // Momo's Lens item: +3 to total
    const eq = STATE.character.equippedItem;
    if (eq && eq.id === 'momos_lens') {
      scores.thesis = Math.min(25, (scores.thesis || 0) + 2);
      scores.mechanics = Math.min(25, (scores.mechanics || 0) + 1);
    }

    scores.thesis    = Math.min(25, Math.max(0, scores.thesis    || 0));
    scores.structure = Math.min(25, Math.max(0, scores.structure || 0));
    scores.evidence  = Math.min(25, Math.max(0, scores.evidence  || 0));
    scores.mechanics = Math.min(25, Math.max(0, scores.mechanics || 0));
    const total = scores.thesis + scores.structure + scores.evidence + scores.mechanics;

    // award XP
    const mult = DIFF_MULTIPLIER[quest.difficulty] || 1;
    const penalty = getDeadlinePenalty(quest);
    const rawXP   = Math.round(total * mult * (1 - penalty));
    const earned  = awardXP(rawXP, 'AI evaluation');
    quest.aiScore = total;
    quest.xpEarned += earned;
    saveGame();

    showAIResult(scores, null, total, quest);
    checkLoreUnlock('ai_score', total);
    checkItemUnlock('ai_score', total);

    if (total >= 85) showMomo('ai_result_high');
    else             showMomo('ai_result_low');

  } catch (e) {
    showAIResult(null, `Evaluation failed: ${e.message}`);
  }
}

function showAILoading() {
  const body = document.getElementById('ai-eval-body');
  if (!body) return;
  body.innerHTML = '<div class="loading-anim">CONSULTING THE ORACLE...</div>';
}

function showAIResult(scores, error, total, quest) {
  const body = document.getElementById('ai-eval-body');
  if (!body) return;

  if (error) {
    body.innerHTML = `<div class="ai-feedback" style="color:var(--red)">${error}</div>
      <div class="row-buttons"><button class="pixel-btn" data-nav="screen-hub">BACK</button></div>`;
    return;
  }

  const pct = v => ((v / 25) * 100).toFixed(0);
  body.innerHTML = `
    <div class="ai-score-bar-wrap">
      <div class="ai-score-label"><span>THESIS</span><span>${scores.thesis}/25</span></div>
      <div class="ai-score-track"><div class="ai-score-fill fill-thesis" style="width:0%" data-target="${pct(scores.thesis)}%"></div></div>
    </div>
    <div class="ai-score-bar-wrap">
      <div class="ai-score-label"><span>STRUCTURE</span><span>${scores.structure}/25</span></div>
      <div class="ai-score-track"><div class="ai-score-fill fill-structure" style="width:0%" data-target="${pct(scores.structure)}%"></div></div>
    </div>
    <div class="ai-score-bar-wrap">
      <div class="ai-score-label"><span>EVIDENCE</span><span>${scores.evidence}/25</span></div>
      <div class="ai-score-track"><div class="ai-score-fill fill-evidence" style="width:0%" data-target="${pct(scores.evidence)}%"></div></div>
    </div>
    <div class="ai-score-bar-wrap">
      <div class="ai-score-label"><span>MECHANICS</span><span>${scores.mechanics}/25</span></div>
      <div class="ai-score-track"><div class="ai-score-fill fill-mechanics" style="width:0%" data-target="${pct(scores.mechanics)}%"></div></div>
    </div>
    <div class="ai-total">TOTAL: ${total} / 100</div>
    <div class="ai-feedback">${scores.feedback || ''}</div>
    <div class="row-buttons">
      <button class="pixel-btn" data-nav="screen-hub">BACK TO HUB</button>
    </div>`;

  // animate bars after paint
  requestAnimationFrame(() => {
    body.querySelectorAll('.ai-score-fill').forEach(el => {
      el.style.width = el.dataset.target;
    });
    wireNavButtons(body);
  });
}

// ── MOMO DIALOGUE ─────────────────────────────────────────────────────────

const MOMO_LINES = {
  quest_created:    ["A new assignment! I've already run the calculations — the margin is tighter than you think. Don't sleep on the deadline.",
                     "New quest logged. My data projections suggest you have less buffer than you believe. Begin the outline now.",
                     "Interesting. I'll track this one in my research log. The outline phase is critical — skip it and you'll pay later."],
  milestone_outline:["Outline complete! Structure is everything. My Ahl-Tectum turret only worked once I drafted the firing sequence first.",
                     "Solid outline. You've done what most scholars skip. The draft will flow easier now — I've seen it in my experiments.",
                     "The scaffold is built. Now we fill it. My Honey Bee prototype looked useless until the frame was finished. Trust the process."],
  milestone_draft1: ["First draft done! Don't get comfortable — even my Honey Bee took twelve iterations before it flew straight.",
                     "Draft complete. This is data, not a final answer. Revise with the same energy you used to write it.",
                     "Good. Raw output secured. Now we refine. Every machine I've built looked broken on the first run."],
  milestone_revised:["Revision complete! You're sharpening the blade now. Most people stop at draft one — you didn't.",
                     "Revised. The difference between a draft and a final is exactly this step. I've seen scholars skip it. They regret it.",
                     "Excellent. The structural integrity is improving. My instruments are reading stronger coherence already."],
  level_up:         ["Power spike detected! You just leveled up. My instruments haven't read numbers this high since the Plant!",
                     "Level up! I'm noting this in my research log. Your focus readings are off the charts.",
                     "Remarkable growth. The data is clear: you're becoming something stronger. Keep going."],
  deadline_warning: ["Deadline in under 24 hours. I'm rerouting auxiliary focus to your workstation. You need to move NOW.",
                     "ALERT. Time is running out. I've seen scholars lose everything by underestimating the final stretch.",
                     "The countdown is critical. My turret auto-fires at deadline — yours should too. Get to work."],
  ai_result_high:   ["85 or above! That's Master class output. Ryu would be impressed — and he barely talks.",
                     "Exceptional score. This is the kind of work that gets remembered. I'm flagging it in my records.",
                     "High marks confirmed. My readings show this essay has structural integrity and argumentative force. Well done."],
  ai_result_low:    ["Even the Ahl-Tectum exploded the first time. That's data. Revise. Resubmit. That's how you get to the right answer.",
                     "Low score recorded. This is not failure — it's calibration. My best inventions failed dozens of times first.",
                     "The numbers aren't there yet. But you have something to work with now. Revision is the real skill."],
  streak_bonus:     ["Three consecutive days of work! Your focus readings are off the chart. I'm noting this in my research log.",
                     "Consistent output detected. This is how mastery is built — day after day, draft after draft.",
                     "Streak bonus active. The compounding effect of daily effort is exactly what my research models predicted."],
};

let momoTypingTimer = null;
let momoCurrentEvent = null;

function showMomo(eventType) {
  const lines = MOMO_LINES[eventType];
  if (!lines) return;
  const line = lines[Math.floor(Math.random() * lines.length)];
  momoCurrentEvent = eventType;

  const overlay = document.getElementById('overlay-momo');
  const textEl  = document.getElementById('momo-text');
  if (!overlay || !textEl) return;

  overlay.classList.add('active');
  textEl.textContent = '';
  AudioEngine.sfx('momo');

  if (momoTypingTimer) clearInterval(momoTypingTimer);

  let i = 0;
  momoTypingTimer = setInterval(() => {
    textEl.textContent += line[i++];
    if (i >= line.length) clearInterval(momoTypingTimer);
  }, 28);
}

function hideMomo() {
  if (momoTypingTimer) clearInterval(momoTypingTimer);
  document.getElementById('overlay-momo')?.classList.remove('active');
}

// ── RENDER FUNCTIONS ───────────────────────────────────────────────────────

function renderCharacterSheet() {
  const c = STATE.character;

  const nameEl = document.getElementById('char-name');
  if (nameEl) nameEl.textContent = c.name || '—';

  const titleEl = document.getElementById('char-title');
  if (titleEl) titleEl.textContent = c.title || '—';

  const levelEl = document.getElementById('char-level');
  if (levelEl) levelEl.textContent = c.level;

  const xpFill = document.getElementById('xp-fill');
  if (xpFill) {
    const pct = Math.min(100, (c.xp / getXPThreshold(c.level)) * 100);
    xpFill.style.width = pct + '%';
  }

  const xpText = document.getElementById('xp-text');
  if (xpText) xpText.textContent = `${c.xp} / ${getXPThreshold(c.level)} XP`;

  ['focus','wit','grit','lore'].forEach(s => {
    const el = document.getElementById(`stat-${s}`);
    if (el) el.textContent = c.stats[s];
  });

  const streakEl = document.getElementById('streak-count');
  if (streakEl) streakEl.textContent = c.streak;

  const abList = document.getElementById('abilities-list');
  if (abList) {
    abList.innerHTML = c.unlockedAbilities.length
      ? c.unlockedAbilities.map(a => `<li>${a}</li>`).join('')
      : '<li style="color:var(--dim)">None yet</li>';
  }

  const eqSlot = document.getElementById('equipped-slot');
  if (eqSlot) {
    eqSlot.textContent = c.equippedItem ? `${c.equippedItem.name}` : '— empty —';
  }

  // portrait emoji based on class
  const portraits = { Essayist: '✒', Debater: '⚔', Researcher: '📜', Storyteller: '✦' };
  const portrait  = document.getElementById('char-portrait');
  if (portrait) portrait.textContent = portraits[c.cls] || '?';

  renderCoursesList();
  renderActiveQuestHub();
}

function renderCoursesList() {
  const el = document.getElementById('courses-list');
  if (!el) return;
  if (!STATE.courses.length) {
    el.innerHTML = '<div style="font-size:16px;color:var(--dim)">No courses yet.</div>';
    return;
  }
  el.innerHTML = STATE.courses.map(course => {
    const courseQuests    = STATE.quests.filter(q => q.courseId === course.id);
    const completed       = courseQuests.filter(q => q.stage === 'complete').length;
    return `<div class="course-row">
      <span class="course-dot" style="background:${course.color}"></span>
      <span class="course-row-name">${course.name}</span>
      <span class="course-row-stats">${completed}/${courseQuests.length} done</span>
    </div>`;
  }).join('');
}

function renderActiveQuestHub() {
  const area = document.getElementById('active-quest-area');
  if (!area) return;
  const active = getActiveQuests();
  if (!active.length) {
    area.innerHTML = '<div class="empty-hint">No quest embarked. Open the QUEST BOARD to begin.</div>';
    return;
  }
  // show the most urgent
  const q = active.sort((a, b) => {
    const sa = checkDeadlineStatus(a);
    const sb = checkDeadlineStatus(b);
    const order = ['overdue','danger','warning','safe'];
    return order.indexOf(sa) - order.indexOf(sb);
  })[0];

  const status = checkDeadlineStatus(q);
  area.innerHTML = `
    <div class="hub-quest-card">
      <div class="hub-quest-title">${q.title}</div>
      <div class="hub-quest-sub">Stage: ${STAGE_LABELS[q.stage] || q.stage} · ${q.difficulty}</div>
      <div class="deadline-display ${status}">${formatCountdown(q)}</div>
      <div class="row-buttons">
        <button class="pixel-btn primary" onclick="openQuestDetail('${q.id}')">OPEN QUEST</button>
      </div>
    </div>`;
}

function renderQuestBoard(filter = 'active', courseFilter = null) {
  const list = document.getElementById('quest-list');
  if (!list) return;

  let quests = filter === 'active' ? getActiveQuests() : getCompletedQuests();
  if (courseFilter) quests = quests.filter(q => q.courseId === courseFilter);

  if (!quests.length) {
    list.innerHTML = '<div style="color:var(--dim);font-size:18px;padding:20px 0">No quests here yet.</div>';
    return;
  }

  list.innerHTML = quests.map(q => {
    const status  = checkDeadlineStatus(q);
    const course  = STATE.courses.find(c => c.id === q.courseId);
    const tag     = course ? `<span style="color:${course.color};font-size:13px">◆ ${course.name}</span>` : '';
    const borderCls = status === 'overdue' || status === 'danger' ? 'danger-border'
                    : status === 'warning' ? 'warning-border' : '';
    return `<div class="quest-card ${borderCls}" onclick="openQuestDetail('${q.id}')">
      <div>
        <div class="quest-card-title">${q.title}</div>
        <div class="quest-card-meta">${tag} · ${q.difficulty}</div>
        <div class="quest-card-stage">${STAGE_LABELS[q.stage] || '✓ COMPLETE'}</div>
      </div>
      <div>
        <div class="quest-card-timer ${status}">${formatCountdown(q)}</div>
        <div class="quest-card-diff">${q.currentWordCount}/${q.wordCountGoal}w</div>
      </div>
    </div>`;
  }).join('');
}

function renderCourseFilter() {
  const el = document.getElementById('course-filter');
  if (!el) return;
  el.innerHTML = `<button class="filter-chip active" data-course="">ALL</button>` +
    STATE.courses.map(c =>
      `<button class="filter-chip" data-course="${c.id}" style="border-color:${c.color};color:${c.color}">${c.name}</button>`
    ).join('');

  el.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = document.querySelector('.tab-btn.active')?.dataset.tab || 'active';
      renderQuestBoard(tab, btn.dataset.course || null);
    });
  });
}

let detailTimerInterval = null;

function openQuestDetail(questId) {
  showScreen('screen-quest-detail');
  renderQuestDetail(questId);
}

function renderQuestDetail(questId) {
  const q = getQuest(questId);
  if (!q) return;

  const titleEl = document.getElementById('quest-detail-title');
  if (titleEl) titleEl.textContent = q.title;

  const body = document.getElementById('quest-detail-body');
  if (!body) return;

  const status  = checkDeadlineStatus(q);
  const course  = STATE.courses.find(c => c.id === q.courseId);
  const wcPct   = Math.min(100, (q.currentWordCount / q.wordCountGoal) * 100);
  const stageIdx = STAGES.indexOf(q.stage);
  const isComplete = q.stage === 'complete';

  const stageHTML = STAGES.slice(0, 4).map((s, i) => {
    const cls = i < stageIdx ? 'done' : (i === stageIdx ? 'current' : '');
    return `<div class="stage-step ${cls}">${STAGE_LABELS[s]}</div>`;
  }).join('');

  const nextStage = !isComplete && stageIdx < STAGES.length - 2
    ? STAGES[stageIdx + 1] : null;

  body.innerHTML = `
    <div class="detail-section">
      <div class="detail-label">COURSE</div>
      <div class="detail-value" style="color:${course?.color||'var(--dim)'}">${course?.name || 'Uncategorized'}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">DIFFICULTY</div>
      <div class="detail-value">${q.difficulty} (${DIFF_MULTIPLIER[q.difficulty]}× XP)</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">STAGE PROGRESS</div>
      <div class="stage-tracker">${stageHTML}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">DEADLINE</div>
      <div class="deadline-display ${status}" id="detail-countdown">${formatCountdown(q)}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">WORD COUNT — ${q.currentWordCount} / ${q.wordCountGoal}</div>
      <div class="wc-bar-track"><div class="wc-bar-fill" style="width:${wcPct}%"></div></div>
    </div>

    ${q.aiScore !== null ? `<div class="detail-section"><div class="detail-label">LAST AI SCORE</div><div class="detail-value" style="color:var(--green)">${q.aiScore} / 100</div></div>` : ''}
    ${q.xpEarned ? `<div class="detail-section"><div class="detail-label">XP EARNED</div><div class="detail-value" style="color:var(--gold)">${q.xpEarned} XP</div></div>` : ''}

    ${isComplete ? '<div style="color:var(--green);font-family:var(--font-px);font-size:10px;text-align:center">✓ QUEST COMPLETE</div>' : ''}

    <div class="action-buttons">
      <button class="pixel-btn" onclick="showScreen('screen-quest-board')">BACK</button>
      ${!isComplete ? `<button class="pixel-btn primary" onclick="openEditor('${q.id}')">WRITE ESSAY</button>` : ''}
      ${!isComplete && nextStage ? `<button class="pixel-btn" onclick="advanceMilestone('${q.id}')">ADVANCE → ${STAGE_LABELS[nextStage]}</button>` : ''}
      ${!isComplete ? `<button class="pixel-btn" onclick="goToAIEval('${q.id}')">AI EVALUATE</button>` : ''}
    </div>`;

  // live countdown
  if (detailTimerInterval) clearInterval(detailTimerInterval);
  if (!isComplete) {
    detailTimerInterval = setInterval(() => {
      const cd = document.getElementById('detail-countdown');
      if (!cd) { clearInterval(detailTimerInterval); return; }
      const st = checkDeadlineStatus(q);
      cd.className = `deadline-display ${st}`;
      cd.textContent = formatCountdown(q);
      if (st === 'overdue') showMomo('deadline_warning');
    }, 1000);
  }
}

// ── PART 4: ITEMS, LORE/CODEX, EVENT LISTENERS, APP INIT ─────────────────

// ── ITEM DEFINITIONS ───────────────────────────────────────────────────────

const ALL_ITEMS = [
  { id: 'worn_quill',      name: 'Worn Quill',           icon: '✒', type: 'passive',    rarity: 'common',    description: 'A quill worn smooth by many outlines.',         effect: { stat: 'outlineXP', bonus: 5  } },
  { id: 'momos_lens',      name: "Momo's Lens",           icon: '🔍', type: 'passive',    rarity: 'rare',      description: "Momo's analytical optics. AI scores feel fairer.", effect: { stat: 'aiScore', bonus: 3  } },
  { id: 'scholars_inkpot', name: "Scholar's Inkpot",      icon: '🖋', type: 'consumable', rarity: 'common',    description: 'One use. Distilled focus in liquid form.',          effect: { stat: 'flatXP',  bonus: 50 } },
  { id: 'thesis_shard',    name: 'Thesis Shard',          icon: '💎', type: 'passive',    rarity: 'rare',      description: 'A fragment of a perfect argument.',                effect: { stat: 'finalXP', bonus: 10 } },
  { id: 'crystal_arg',     name: 'Crystallized Argument', icon: '⚡', type: 'passive',    rarity: 'legendary', description: 'Pure condensed logic. All XP flows faster.',        effect: { stat: 'allXP',   bonus: 20 } },
  { id: 'blade_fragment',  name: 'Fragment of the Blade', icon: '🗡', type: 'passive',    rarity: 'legendary', description: 'A sliver of the Academic Weapon itself.',           effect: { stat: 'allStats', bonus: 1 } },
];

function giveItem(itemId) {
  const def = ALL_ITEMS.find(i => i.id === itemId);
  if (!def) return;
  if (STATE.character.inventory.find(i => i.id === itemId)) return; // no dupes for passives
  const item = { ...def, acquiredAt: Date.now() };
  STATE.character.inventory.push(item);
  saveGame();
  showItemGetOverlay(item);
}

function equipItem(itemId) {
  const item = STATE.character.inventory.find(i => i.id === itemId);
  if (!item || item.type !== 'passive') return;
  STATE.character.equippedItem = item;
  saveGame();
  renderInventory();
  renderCharacterSheet();
  showXPToast(`Equipped: ${item.name}`, '');
}

function useItem(itemId) {
  const idx = STATE.character.inventory.findIndex(i => i.id === itemId);
  if (idx === -1) return;
  const item = STATE.character.inventory[idx];
  if (item.type !== 'consumable') return;
  if (item.effect.stat === 'flatXP') awardXP(item.effect.bonus, item.name);
  if (item.effect.stat === 'allStats') {
    ['focus','wit','grit','lore'].forEach(s => STATE.character.stats[s]++);
    saveGame();
    renderCharacterSheet();
  }
  STATE.character.inventory.splice(idx, 1);
  saveGame();
  renderInventory();
}

function renderInventory() {
  const grid = document.getElementById('inventory-grid');
  if (!grid) return;
  const inv = STATE.character.inventory;
  if (!inv.length) {
    grid.innerHTML = '<div style="color:var(--dim);font-size:18px">Your bag is empty. Complete quests and milestones to earn items.</div>';
    return;
  }
  grid.innerHTML = inv.map(item => {
    const isEquipped = STATE.character.equippedItem?.id === item.id;
    return `<div class="item-card ${item.rarity}">
      <div class="item-icon">${item.icon}</div>
      <div class="item-name">${item.name}${isEquipped ? ' ★' : ''}</div>
      <div class="item-rarity ${item.rarity}">${item.rarity.toUpperCase()}</div>
      <div class="item-desc">${item.description}</div>
      <div class="item-actions">
        ${item.type === 'passive'    ? `<button class="pixel-btn small" onclick="equipItem('${item.id}')">${isEquipped ? 'EQUIPPED' : 'EQUIP'}</button>` : ''}
        ${item.type === 'consumable' ? `<button class="pixel-btn small primary" onclick="useItem('${item.id}')">USE</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function showItemGetOverlay(item) {
  document.getElementById('item-get-icon').textContent   = item.icon;
  document.getElementById('item-get-name').textContent   = item.name;
  document.getElementById('item-get-rarity').textContent = item.rarity.toUpperCase();
  document.getElementById('item-get-rarity').className   = `item-get-rarity ${item.rarity}`;
  document.getElementById('item-get-desc').textContent   = item.description;
  document.getElementById('overlay-item').classList.add('active');
}

function checkItemUnlock(trigger, value) {
  if (trigger === 'quest_complete') giveItem('worn_quill');
  if (trigger === 'ai_score' && value >= 80) giveItem('momos_lens');
  if (trigger === 'streak' && value >= 3) giveItem('scholars_inkpot');
  if (trigger === 'level' && value >= 15) giveItem('thesis_shard');
  if (trigger === 'level' && value >= 30) giveItem('crystal_arg');
  if (trigger === 'level' && value >= 40) giveItem('blade_fragment');
}

// ── LORE / CODEX ───────────────────────────────────────────────────────────

const LORE_FRAGMENTS = [
  { id: 'lore_l1',       trigger: 'level',         value: 1,  title: 'Fragment I',     text: '"They say the blades are made of argument itself — the kind that cannot be refuted."' },
  { id: 'lore_quest1',   trigger: 'quest_complete', value: 1,  title: 'Fragment II',    text: 'A professor\'s margin note: "Some students write. A rare few forge."' },
  { id: 'lore_l10',      trigger: 'level',         value: 10, title: 'Fragment III',   text: 'An ancient text: "The Weapons were last seen in the hands of one who never stopped revising."' },
  { id: 'lore_ai90',     trigger: 'ai_score',      value: 90, title: 'Fragment IV',    text: 'Momo\'s partial blueprint — it looks like a dagger, but the material is listed as "crystallized thesis."' },
  { id: 'lore_l30',      trigger: 'level',         value: 30, title: 'Fragment V',     text: '"The blades respond to focus. They grow sharper the longer their wielder studies."' },
  { id: 'lore_streak7',  trigger: 'streak',        value: 7,  title: 'Fragment VI',    text: 'A worn journal: "I have written every day for seven days. The air around my desk feels different. Charged."' },
  { id: 'lore_l50',      trigger: 'level',         value: 50, title: 'THE FINAL TRUTH', text: 'The daggers materialize. They were never hidden — they were being forged. By you. By every word you wrote. You have become the weapon.' },
];

function checkLoreUnlock(trigger, value) {
  let revealed = false;
  for (const frag of LORE_FRAGMENTS) {
    if (STATE.lore.unlockedFragments.includes(frag.id)) continue;
    if (frag.trigger !== trigger) continue;
    const match =
      (trigger === 'level'         && value >= frag.value) ||
      (trigger === 'quest_complete' && STATE.quests.filter(q => q.stage === 'complete').length >= frag.value) ||
      (trigger === 'ai_score'      && value >= frag.value) ||
      (trigger === 'streak'        && STATE.character.streak >= frag.value);
    if (match) {
      STATE.lore.unlockedFragments.push(frag.id);
      saveGame();
      if (!revealed) { showLoreOverlay(frag); revealed = true; }
    }
  }
}

function showLoreOverlay(frag) {
  document.getElementById('lore-body').textContent = frag.text;
  document.getElementById('overlay-lore').classList.add('active');
}

function renderCodex() {
  const list = document.getElementById('codex-list');
  if (!list) return;
  list.innerHTML = LORE_FRAGMENTS.map((frag, i) => {
    const unlocked = STATE.lore.unlockedFragments.includes(frag.id);
    return `<div class="codex-fragment ${unlocked ? '' : 'locked'}">
      <div class="codex-fragment-num">${frag.title}</div>
      <div class="codex-fragment-text">${unlocked ? frag.text : '??? Collect more fragments to reveal this entry ???'}</div>
    </div>`;
  }).join('');
}

function showFinalReveal() {
  const overlay = document.getElementById('overlay-levelup');
  overlay.classList.remove('active');
  const body = document.querySelector('.levelup-content');
  if (!body) return;
  body.innerHTML = `
    <div class="final-reveal">
      <div class="final-reveal-title">ACADEMIC WEAPON</div>
      <div class="final-reveal-daggers">🗡✨🗡</div>
      <div class="final-reveal-text">
        The daggers were never hidden.<br>
        They were being forged —<br>
        by every outline you drafted,<br>
        every revision you made,<br>
        every essay you submitted.<br><br>
        <strong>You have become the weapon.</strong>
      </div>
      <button class="pixel-btn primary" id="btn-levelup-close">CLAIM YOUR TITLE</button>
    </div>`;
  overlay.classList.add('active');
  document.getElementById('btn-levelup-close').addEventListener('click', () => {
    overlay.classList.remove('active');
    showScreen('screen-hub');
  });
}

// ── QUEST CREATION ─────────────────────────────────────────────────────────

function openQuestModal() {
  populateCourseDropdown();
  document.getElementById('overlay-new-quest').classList.add('active');
}

function populateCourseDropdown() {
  const sel = document.getElementById('quest-course');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select Course --</option>' +
    STATE.courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('') +
    '<option value="__new__">+ Add New Course…</option>';
}

function openEditor(questId) {
  const q = getQuest(questId);
  if (!q) return;
  document.getElementById('editor-quest-name').textContent = q.title;
  document.getElementById('editor-word-goal').textContent  = q.wordCountGoal;
  document.getElementById('essay-text').value              = q.essayText || '';
  updateEditorWordCount(q);
  document.getElementById('btn-editor-back').dataset.questId   = questId;
  document.getElementById('btn-editor-save').dataset.questId   = questId;
  document.getElementById('btn-editor-submit').dataset.questId = questId;
  showScreen('screen-essay-editor');
}

function updateEditorWordCount(quest) {
  const text  = document.getElementById('essay-text')?.value || '';
  const count = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('editor-word-count').textContent = count;
  const pct   = Math.min(100, (count / quest.wordCountGoal) * 100);
  const fill  = document.getElementById('wc-fill');
  if (fill) fill.style.width = pct + '%';
  return count;
}

function goToAIEval(questId) {
  const q = getQuest(questId);
  if (!q) return;
  const body = document.getElementById('ai-eval-body');
  if (!body) return;

  const apiKey = STATE.settings.apiKey;
  body.innerHTML = `
    <div style="font-size:18px;color:var(--dim)">Submit your essay to the AI Oracle for evaluation.</div>
    ${!apiKey ? '<div style="color:var(--red);font-family:var(--font-px);font-size:8px">No API key! Go to CONFIG first.</div>' : ''}
    <textarea class="pixel-textarea" id="ai-essay-input" placeholder="Paste or type essay here...">${q.essayText || ''}</textarea>
    <div class="row-buttons">
      <button class="pixel-btn" onclick="showScreen('screen-quest-detail'); renderQuestDetail('${questId}')">BACK</button>
      <button class="pixel-btn primary" onclick="submitToOracle('${questId}')">EVALUATE</button>
    </div>`;

  showScreen('screen-ai-eval');
}

function submitToOracle(questId) {
  const q    = getQuest(questId);
  const text = document.getElementById('ai-essay-input')?.value || '';
  if (!text.trim()) { showXPToast('No text!', ''); return; }
  q.essayText = text;
  saveGame();
  evaluateEssay(text, q).then(() => wireNavButtons(document.getElementById('ai-eval-body')));
}

// ── WIRE NAV BUTTONS (data-nav attribute) ──────────────────────────────────

function wireNavButtons(root) {
  (root || document).querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.nav));
  });
}

// ── APP INITIALISATION ─────────────────────────────────────────────────────

function init() {
  const hasSave = loadGame();
  wireNavButtons();

  // Global click SFX — any button triggers audio context (satisfies autoplay policy)
  document.addEventListener('click', e => {
    if (e.target.matches('button, .class-card, .quest-card')) AudioEngine.sfx('click');
  }, { passive: true });

  // ── Title screen buttons ──
  document.getElementById('btn-new-game').addEventListener('click', () => showScreen('screen-char-create'));
  document.getElementById('btn-continue').addEventListener('click', () => {
    if (hasSave && STATE.character.name) {
      checkStreak();
      checkLoreUnlock('level', STATE.character.level);
      showScreen('screen-hub');
    } else {
      showXPToast('No save found', '');
    }
  });

  // ── Character creation ──
  document.querySelectorAll('.class-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.class-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      STATE.character.cls = card.getAttribute('data-class');
    });
  });

  document.getElementById('btn-confirm-char').addEventListener('click', () => {
    const name = document.getElementById('input-name').value.trim();
    const cls  = STATE.character.cls || '';
    if (!name) { showXPToast('Enter a name!', ''); return; }
    if (!cls)  { showXPToast('Choose a class!', ''); return; }

    STATE.character.name = name;
    // class stat bonuses
    const bonuses = { Essayist: 'focus', Debater: 'wit', Researcher: 'lore', Storyteller: 'grit' };
    if (bonuses[cls]) STATE.character.stats[bonuses[cls]] += 2;
    checkStreak();
    saveGame();
    checkLoreUnlock('level', 1);
    showScreen('screen-hub');
    renderCharacterSheet();
    showMomo('quest_created');
  });

  // ── Hub nav buttons ──
  document.getElementById('btn-add-course').addEventListener('click', () => {
    document.getElementById('overlay-add-course').classList.add('active');
    document.getElementById('course-name').value = '';
    document.querySelectorAll('.color-chip').forEach((c,i) => { if(i===0) c.classList.add('selected'); else c.classList.remove('selected'); });
  });

  document.getElementById('btn-mute').addEventListener('click', () => {
    const nowMuted = AudioEngine.toggleMute();
    document.getElementById('btn-mute').textContent = nowMuted ? '♪ UNMUTE' : '♪ MUTE';
  });

  document.getElementById('btn-reset-game').addEventListener('click', () => {
    if (confirm('Reset ALL progress? This cannot be undone.')) {
      resetGame();
      showScreen('screen-title');
    }
  });

  // ── Add course modal ──
  let selectedCourseColor = '#FFD700';
  document.querySelectorAll('.color-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedCourseColor = chip.dataset.color;
    });
  });

  document.getElementById('btn-cancel-course').addEventListener('click', () => {
    document.getElementById('overlay-add-course').classList.remove('active');
  });

  document.getElementById('btn-save-course').addEventListener('click', () => {
    const name = document.getElementById('course-name').value.trim();
    if (!name) { showXPToast('Enter a course name!', ''); return; }
    STATE.courses.push({ id: genId(), name, color: selectedCourseColor, createdAt: Date.now() });
    saveGame();
    document.getElementById('overlay-add-course').classList.remove('active');
    renderCharacterSheet();
  });

  // ── Quest board ──
  document.getElementById('btn-new-quest').addEventListener('click', openQuestModal);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderQuestBoard(btn.dataset.tab);
    });
  });

  // ── New quest modal ──
  document.getElementById('btn-cancel-quest').addEventListener('click', () => {
    document.getElementById('overlay-new-quest').classList.remove('active');
  });

  document.getElementById('quest-course').addEventListener('change', e => {
    if (e.target.value === '__new__') {
      document.getElementById('overlay-new-quest').classList.remove('active');
      document.getElementById('overlay-add-course').classList.add('active');
    }
  });

  document.getElementById('btn-create-quest').addEventListener('click', () => {
    const title    = document.getElementById('quest-title').value.trim();
    const courseId = document.getElementById('quest-course').value;
    const words    = document.getElementById('quest-words').value;
    const deadline = document.getElementById('quest-deadline').value;
    const diff     = document.getElementById('quest-difficulty').value;
    if (!title)    { showXPToast('Enter a title!', ''); return; }
    if (!courseId || courseId === '__new__') { showXPToast('Select a course!', ''); return; }
    if (!deadline) { showXPToast('Set a deadline!', ''); return; }
    createQuest({ title, courseId, wordCountGoal: words, deadline, difficulty: diff });
    document.getElementById('overlay-new-quest').classList.remove('active');
    renderQuestBoard('active');
    renderCharacterSheet();
  });

  // ── Essay editor ──
  document.getElementById('essay-text').addEventListener('input', () => {
    const questId = document.getElementById('btn-editor-save').dataset.questId;
    const q = getQuest(questId);
    if (!q) return;
    const count = updateEditorWordCount(q);
    checkWordCountXP(questId, count);
  });

  document.getElementById('btn-editor-save').addEventListener('click', () => {
    const questId = document.getElementById('btn-editor-save').dataset.questId;
    const q = getQuest(questId);
    if (!q) return;
    q.essayText = document.getElementById('essay-text').value;
    q.currentWordCount = updateEditorWordCount(q);
    saveGame();
    showXPToast('Saved!', '');
  });

  document.getElementById('btn-editor-back').addEventListener('click', () => {
    const questId = document.getElementById('btn-editor-back').dataset.questId;
    openQuestDetail(questId);
  });

  document.getElementById('btn-editor-submit').addEventListener('click', () => {
    const questId = document.getElementById('btn-editor-submit').dataset.questId;
    const q = getQuest(questId);
    if (!q) return;
    q.essayText = document.getElementById('essay-text').value;
    q.currentWordCount = updateEditorWordCount(q);
    saveGame();
    goToAIEval(questId);
  });

  // ── Settings ──
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    STATE.settings.apiKey = document.getElementById('input-api-key').value.trim();
    saveGame();
    showXPToast('API key saved!', '');
    showScreen('screen-hub');
  });

  // ── Level up overlay close ──
  document.getElementById('btn-levelup-close').addEventListener('click', () => {
    document.getElementById('overlay-levelup').classList.remove('active');
  });

  // ── Lore overlay close ──
  document.getElementById('btn-lore-close').addEventListener('click', () => {
    document.getElementById('overlay-lore').classList.remove('active');
  });

  // ── Item overlay close ──
  document.getElementById('btn-item-close').addEventListener('click', () => {
    document.getElementById('overlay-item').classList.remove('active');
  });

  // ── Momo click to dismiss ──
  document.getElementById('overlay-momo').addEventListener('click', hideMomo);

  // ── Screen inits ──
  registerScreenInit('screen-hub', () => {
    renderCharacterSheet();
    checkStreak();
    checkLoreUnlock('streak', STATE.character.streak);
    checkItemUnlock('streak', STATE.character.streak);
  });

  registerScreenInit('screen-quest-board', () => {
    renderQuestBoard('active');
    renderCourseFilter();
  });

  registerScreenInit('screen-inventory', renderInventory);
  registerScreenInit('screen-codex', renderCodex);

  registerScreenInit('screen-settings', () => {
    document.getElementById('input-api-key').value = STATE.settings.apiKey || '';
  });

  // ── Restore session ──
  if (hasSave && STATE.character.name) {
    checkStreak();
    showScreen('screen-hub');
  } else {
    showScreen('screen-title');
  }
}

// ── PART 5: AUDIO ENGINE ──────────────────────────────────────────────────

const AudioEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let loopTimeout = null;
  let currentTrack = null;
  let muted = false;

  // Frequency table (Hz)
  const N = {
    A1:55.00, C2:65.41, D2:73.42, E2:82.41, F2:87.31, G2:98.00, A2:110.00, Bb2:116.54, B2:123.47,
    C3:130.81, D3:146.83, Eb3:155.56, E3:164.81, F3:174.61, Fs3:185.00, G3:196.00, Ab3:207.65, A3:220.00, Bb3:233.08, B3:246.94,
    C4:261.63, Cs4:277.18, D4:293.66, Eb4:311.13, E4:329.63, F4:349.23, Fs4:369.99, G4:392.00, Ab4:415.30, A4:440.00, Bb4:466.16, B4:493.88,
    C5:523.25, D5:587.33, Eb5:622.25, E5:659.25, F5:698.46, G5:783.99, A5:880.00,
  };

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.18;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function note(freq, t, dur, type = 'square', vol = 0.13) {
    const osc  = ctx.createOscillator();
    const gn   = ctx.createGain();
    const lpf  = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 1600;
    osc.type = type;
    osc.frequency.value = freq;
    gn.gain.setValueAtTime(0.001, t);
    gn.gain.linearRampToValueAtTime(vol, t + 0.015);
    gn.gain.linearRampToValueAtTime(0.001, t + dur * 0.85);
    osc.connect(lpf); lpf.connect(gn); gn.connect(masterGain);
    osc.start(t); osc.stop(t + dur);
  }

  function schedulePattern(pattern, bpm, t0) {
    const beat = 60 / bpm;
    let t = t0;
    let totalDur = 0;
    for (const [n, dur, type, vol] of pattern) {
      const d = dur * beat;
      if (n && N[n]) note(N[n], t, d, type || 'square', vol || 0.13);
      t += d;
      totalDur += d;
    }
    return totalDur;
  }

  // ── Track definitions ────────────────────────────────────────────────────
  // Each track: { bpm, layers: [ pattern[] ] }
  // Pattern entry: [noteName|null, beatDuration, waveType?, volume?]

  const TRACKS = {

    title: {
      bpm: 96,
      layers: [
        // Haunting minor melody
        [
          ['A3',1],['C4',0.5],['E4',0.5],['A4',1],['G4',0.5],['E4',0.5],
          ['F4',1],['A4',0.5],['C5',0.5],['E5',1],[null,1],
          ['D5',0.5],['C5',0.5],['A4',1],['G4',0.5],['E4',0.5],
          ['A4',1],[null,0.5],['G4',0.5],['E4',1],['C4',1],
          ['A3',2],[null,2],
        ],
        // Arpeggio layer
        [
          ['A2',0.5],['E3',0.5],['A3',0.5],['C4',0.5], ['G2',0.5],['D3',0.5],['G3',0.5],['B3',0.5],
          ['F2',0.5],['C3',0.5],['F3',0.5],['A3',0.5], ['E2',0.5],['B2',0.5],['E3',0.5],['G3',0.5],
          ['A2',0.5],['E3',0.5],['A3',0.5],['E3',0.5], ['A2',0.5],['E3',0.5],['A3',0.5],['E3',0.5],
        ],
        // Bass pulse
        [
          ['A1',2,'triangle',0.12],['A1',2,'triangle',0.10],
          ['F1',2,'triangle',0.12],['F1',2,'triangle',0.10],
          ['E1',4,'triangle',0.12],
          ['A1',4,'triangle',0.14],
        ],
      ],
    },

    hub: {
      bpm: 132,
      layers: [
        // Upbeat overworld melody
        [
          ['E4',0.5],['G4',0.5],['C5',1],['G4',0.5],['E4',0.5],
          ['A4',0.5],['C5',0.5],['E5',1],[null,1],
          ['D5',0.5],['B4',0.5],['G4',1],['E4',0.5],['D4',0.5],
          ['C4',1],['E4',1],['G4',2],
          ['E5',0.5],[null,0.5],['D5',0.5],['B4',0.5],['A4',1],['G4',1],
          ['F4',0.5],['A4',0.5],['C5',1],['A4',0.5],['F4',0.5],
          ['G4',1],['B4',1],['D5',2],
          ['C5',2],[null,1],['G4',1],
        ],
        // Counter melody
        [
          ['C3',0.5],['E3',0.5],['G3',0.5],['E3',0.5], ['A2',0.5],['C3',0.5],['E3',0.5],['C3',0.5],
          ['G2',0.5],['B2',0.5],['D3',0.5],['B2',0.5], ['C3',0.5],['E3',0.5],['G3',0.5],['E3',0.5],
          ['C3',0.5],['E3',0.5],['G3',0.5],['E3',0.5], ['F2',0.5],['A2',0.5],['C3',0.5],['A2',0.5],
          ['G2',0.5],['B2',0.5],['D3',0.5],['B2',0.5], ['C3',1],[null,1],['C3',0.5],['G2',0.5],
        ],
        // Walking bass
        [
          ['C2',1,'triangle',0.15],['G2',1,'triangle',0.12],['A2',1,'triangle',0.15],['E2',1,'triangle',0.12],
          ['F2',1,'triangle',0.15],['C2',1,'triangle',0.12],['G2',2,'triangle',0.15],
          ['C2',1,'triangle',0.15],['G2',1,'triangle',0.12],['F2',1,'triangle',0.15],['G2',1,'triangle',0.12],
          ['C2',2,'triangle',0.18],[null,2,'triangle',0],
        ],
      ],
    },

    editor: {
      bpm: 78,
      layers: [
        // Calm flowing arpeggios
        [
          ['C4',1],['E4',1],['G4',1],['A4',1],
          ['F3',1],['A3',1],['C4',1],['E4',1],
          ['G3',1],['B3',1],['D4',1],['G4',1],
          ['E3',1],['G3',1],['B3',1],['E4',1],
          ['A3',1],['C4',1],['E4',1],['C4',1],
          ['F3',1],['A3',1],['C4',1],['A3',1],
          ['G3',1],['B3',1],['D4',1],['B3',1],
          ['C3',1],['E3',1],['G3',1],['E3',1],
        ],
        // Gentle bass
        [
          ['C2',4,'triangle',0.10],['F2',4,'triangle',0.10],
          ['G2',4,'triangle',0.10],['E2',4,'triangle',0.10],
          ['A2',4,'triangle',0.10],['F2',4,'triangle',0.10],
          ['G2',4,'triangle',0.10],['C2',4,'triangle',0.10],
        ],
      ],
    },

    danger: {
      bpm: 168,
      layers: [
        // Tense staccato
        [
          ['D4',0.5],[null,0.25],['F4',0.25],['A4',0.5],[null,0.25],['C5',0.25],
          ['A4',0.5],['F4',0.5],['D4',1],
          ['Eb4',0.5],[null,0.25],['G4',0.25],['Bb4',0.5],[null,0.25],['D5',0.25],
          ['C5',0.5],['Bb4',0.5],['A4',1],
          ['A4',0.5],[null,0.5],['F4',0.25],['E4',0.25],['Eb4',0.5],[null,0.5],
          ['D4',0.5],[null,0.5],['A3',0.5],[null,0.5],
          ['D5',0.5],['C5',0.25],[null,0.25],['Bb4',0.25],[null,0.25],['A4',0.5],
          ['D4',2],
        ],
        // Driving bass
        [
          ['D2',0.5],['D2',0.5],['A1',0.5],['D2',0.5],
          ['D2',0.5],['D2',0.5],['A1',0.5],['D2',0.5],
          ['Bb2',0.5],['Bb2',0.5],['F2',0.5],['Bb2',0.5],
          ['A2',0.5],['A2',0.5],['E2',0.5],['A2',0.5],
        ].map(([n,d]) => [n,d,'sawtooth',0.10]),
      ],
    },
  };

  function startTrack(name) {
    if (loopTimeout) { clearTimeout(loopTimeout); loopTimeout = null; }
    if (!TRACKS[name]) return;
    currentTrack = name;

    function loop() {
      if (currentTrack !== name) return;
      const t0 = ctx.currentTime + 0.05;
      const track = TRACKS[name];
      let maxDur = 0;
      for (const layer of track.layers) {
        const d = schedulePattern(layer, track.bpm, t0);
        if (d > maxDur) maxDur = d;
      }
      loopTimeout = setTimeout(loop, (maxDur - 0.15) * 1000);
    }
    loop();
  }

  function play(name) {
    ensure();
    if (muted) return;
    if (currentTrack === name) return;
    startTrack(name);
  }

  function stop() {
    currentTrack = null;
    if (loopTimeout) { clearTimeout(loopTimeout); loopTimeout = null; }
  }

  function fanfare() {
    ensure();
    if (muted) return;
    const t = ctx.currentTime;
    const run = [['C4',0],['E4',1],['G4',2],['C5',3],['E5',4],['G5',5],['C6',6]];
    run.forEach(([n,i]) => note(N[n] || 1046.5, t + i * 0.07, 0.35, 'square', 0.18));
    note(N['C5'], t + run.length * 0.07, 0.7, 'square', 0.22);
  }

  function sfx(type) {
    ensure();
    if (muted) return;
    const t = ctx.currentTime;
    if (type === 'xp')    { note(N['A5'], t, 0.07, 'square', 0.09); note(N['C5'], t + 0.08, 0.07, 'square', 0.09); }
    if (type === 'click') { note(N['G5'], t, 0.04, 'square', 0.07); }
    if (type === 'error') { note(N['A3'], t, 0.12, 'sawtooth', 0.10); note(N['G3'], t + 0.06, 0.12, 'sawtooth', 0.08); }
    if (type === 'save')  { note(N['C5'], t, 0.07, 'square', 0.09); note(N['E5'], t + 0.09, 0.07, 'square', 0.09); }
    if (type === 'momo')  { note(N['Fs4'], t, 0.08, 'square', 0.08); note(N['A4'], t + 0.09, 0.08, 'square', 0.08); }
  }

  const SCREEN_TRACK = {
    'screen-title':       'title',
    'screen-char-create': 'title',
    'screen-hub':         'hub',
    'screen-quest-board': 'hub',
    'screen-quest-detail':'hub',
    'screen-essay-editor':'editor',
    'screen-ai-eval':     'editor',
    'screen-inventory':   'hub',
    'screen-codex':       'hub',
    'screen-settings':    'hub',
  };

  function onScreen(id) {
    const track = SCREEN_TRACK[id];
    if (track) play(track);
  }

  function toggleMute() {
    ensure();
    muted = !muted;
    masterGain.gain.value = muted ? 0 : 0.18;
    if (!muted && currentTrack) startTrack(currentTrack);
    return muted;
  }

  return { play, stop, onScreen, fanfare, sfx, toggleMute };
})();

document.addEventListener('DOMContentLoaded', init);
