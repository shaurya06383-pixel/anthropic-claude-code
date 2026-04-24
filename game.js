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
