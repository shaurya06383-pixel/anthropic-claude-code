// ============================================================
// CONFIG — update SHEET_ID before deploying
// ============================================================
const SHEET_ID = '1aJ619bKslQHTwUOFg_OGUA0gp40A-Sfxem6mGoVSRI0';

const GRADES = ['Balvatika', '1', '2', '3', '4', '5', '6', '7', '8'];

// ============================================================
// ROUTING
// ============================================================
function ping() { return 'ok'; }
function doGet(e) {
  const page = (e.parameter && e.parameter.page) || 'dashboard';
  const allowed = { 'monthly-form': 'monthly-form', 'weekly-form': 'weekly-form', 'dashboard': 'dashboard' };
  const name = allowed[page] || 'dashboard';
  return HtmlService.createHtmlOutputFromFile(name)
    .setTitle('SRF Impact Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// ONE-TIME SETUP — run this manually from the Apps Script editor
// ============================================================
function setupDatabase() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  const schemas = {
    schools:                    ['school_id', 'school_name', 'location'],
    students:                   ['student_id', 'school_id', 'name', 'gender', 'grade', 'date_of_birth'],
    sessions:                   ['session_id', 'school_id', 'volunteer_name', 'start_date', 'end_date'],
    enrollments:                ['enrollment_id', 'session_id', 'student_id', 'initial_level', 'initial_hindi_score', 'initial_english_score', 'initial_numeracy_score'],
    level_history:              ['history_id', 'enrollment_id', 'from_level', 'to_level', 'reason', 'effective_month'],
    monthly_assessments:        ['assessment_id', 'enrollment_id', 'month_number', 'assessment_type', 'subject', 'score', 'level_at_time'],
    monthly_outcomes:           ['outcome_id', 'enrollment_id', 'month_number', 'assessment_type', 'hindi_score', 'english_score', 'numeracy_score', 'outcome', 'retention_reason'],
    weekly_competency_tracking: ['tracking_id', 'enrollment_id', 'week_number', 'subject', 'competency_name', 'passed', 'date_recorded'],
    competency_master:          ['competency_id', 'level', 'subject', 'competency_name', 'week_number']
  };

  for (const [name, headers] of Object.entries(schemas)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    } else {
      sheet.clearContents();
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  _populateCompetencyMaster(ss.getSheetByName('competency_master'));
  _seedSchools(ss.getSheetByName('schools'));

  SpreadsheetApp.flush();
  Logger.log('Setup complete.');
}

function _populateCompetencyMaster(sheet) {
  // PENDING: week-to-competency order is a placeholder per spec.
  // Update week_number assignments once SRF confirms the order.
  const data = [
    // L1 Hindi
    ['L1', 'Hindi', 'Oral Expression',        2],
    ['L1', 'Hindi', 'Picture Recognition',     3],
    ['L1', 'Hindi', 'Letter Recognition',      4],
    ['L1', 'Hindi', 'Listening Comprehension', 5],
    ['L1', 'Hindi', 'Letter Writing',          6],
    ['L1', 'Hindi', 'Word Reading',            7],
    ['L1', 'Hindi', 'Word Writing',            8],
    ['L1', 'Hindi', 'Comprehension',           9],
    ['L1', 'Hindi', 'Dictation',               10],
    ['L1', 'Hindi', 'Simple Sentences',        11],
    // L1 English
    ['L1', 'English', 'Oral Expression',          2],
    ['L1', 'English', 'Sound Recognition',        3],
    ['L1', 'English', 'Letter Recognition',       4],
    ['L1', 'English', 'Writing Letters',          5],
    ['L1', 'English', 'Word Reading',             6],
    ['L1', 'English', 'Writing Words',            7],
    ['L1', 'English', 'Vocabulary',               8],
    ['L1', 'English', 'Listening Comprehension',  9],
    ['L1', 'English', 'Dictation',                10],
    ['L1', 'English', 'CVC Sentence Reading',     11],
    // L1 Numeracy
    ['L1', 'Numeracy', 'Pre Math',                   2],
    ['L1', 'Numeracy', 'Shapes',                     3],
    ['L1', 'Numeracy', 'Counting',                   4],
    ['L1', 'Numeracy', 'Number Recognition',         5],
    ['L1', 'Numeracy', 'Number Comparison',          6],
    ['L1', 'Numeracy', 'Missing Number',             7],
    ['L1', 'Numeracy', 'Number Writing',             8],
    ['L1', 'Numeracy', 'Pattern',                    9],
    ['L1', 'Numeracy', 'Single Digit Addition',      10],
    ['L1', 'Numeracy', 'Single Digit Subtraction',   11],
    // L2 Hindi
    ['L2', 'Hindi', 'Varnamala',           2],
    ['L2', 'Hindi', 'Shabdavali',          3],
    ['L2', 'Hindi', 'Matra',               4],
    ['L2', 'Hindi', 'Parivesh Ki Jankari', 5],
    ['L2', 'Hindi', 'Vyakaran-1',          6],
    ['L2', 'Hindi', 'Vyakaran-2',          7],
    ['L2', 'Hindi', 'Vakya',               8],
    ['L2', 'Hindi', 'Chitra Varnan',       9],
    ['L2', 'Hindi', 'Gadyansh Lekhan',     10],
    ['L2', 'Hindi', 'Apathit Gadyansh',    11],
    // L2 English — 10th confirmed as Picture Composition from evaluation sheet
    ['L2', 'English', 'Alphabet Recognition and Writing', 2],
    ['L2', 'English', 'Three Letter Words',               3],
    ['L2', 'English', 'Grammar-1',                        4],
    ['L2', 'English', 'This/That/These/Those',            5],
    ['L2', 'English', 'Use of is/are/am',                 6],
    ['L2', 'English', 'Use of has/have',                  7],
    ['L2', 'English', 'My/his/her/your/our/their',        8],
    ['L2', 'English', 'Questioning Words',                9],
    ['L2', 'English', 'Picture Comprehension',            10],
    ['L2', 'English', 'Picture Composition',              11],
    // L2 Numeracy
    ['L2', 'Numeracy', 'Pre Math',       2],
    ['L2', 'Numeracy', 'Numbers',        3],
    ['L2', 'Numeracy', 'Pattern',        4],
    ['L2', 'Numeracy', 'Units and Tens', 5],
    ['L2', 'Numeracy', 'Addition',       6],
    ['L2', 'Numeracy', 'Subtraction',    7],
    ['L2', 'Numeracy', 'Multiplication', 8],
    ['L2', 'Numeracy', 'Division',       9],
    ['L2', 'Numeracy', 'Time',           10],
    ['L2', 'Numeracy', 'Money',          11],
    // L3 Hindi
    ['L3', 'Hindi', 'Similar Sound Words',      2],
    ['L3', 'Hindi', 'Vocabulary',               3],
    ['L3', 'Hindi', 'Correct/Incorrect Sentences', 4],
    ['L3', 'Hindi', 'Vyakaran-1',               5],
    ['L3', 'Hindi', 'Vyakaran-2',               6],
    ['L3', 'Hindi', 'Vakya',                    7],
    ['L3', 'Hindi', 'Chitra Varnan',             8],
    ['L3', 'Hindi', 'Apathit Gadyansh',          9],
    ['L3', 'Hindi', 'Gadyansh Lekhan',           10],
    ['L3', 'Hindi', 'Kahani Lekhan',             11],
    // L3 English
    ['L3', 'English', 'Rhyming Words',          2],
    ['L3', 'English', 'Vocabulary',             3],
    ['L3', 'English', 'Correct Spellings/Sentences', 4],
    ['L3', 'English', 'Grammar-I',              5],
    ['L3', 'English', 'Grammar-II',             6],
    ['L3', 'English', 'Punctuation',            7],
    ['L3', 'English', 'Articles',               8],
    ['L3', 'English', 'Sentence Construction',  9],
    ['L3', 'English', 'Picture Composition',    10],
    ['L3', 'English', 'Comprehension',          11],
    // L3 Numeracy
    ['L3', 'Numeracy', 'Numbers',       2],
    ['L3', 'Numeracy', 'Addition',      3],
    ['L3', 'Numeracy', 'Subtraction',   4],
    ['L3', 'Numeracy', 'Multiplication',5],
    ['L3', 'Numeracy', 'Division',      6],
    ['L3', 'Numeracy', 'Fraction',      7],
    ['L3', 'Numeracy', 'Geometry',      8],
    ['L3', 'Numeracy', 'Money',         9],
    ['L3', 'Numeracy', 'Time',          10],
    ['L3', 'Numeracy', 'Measurement',   11],
  ];

  const rows = data.map((r, i) => [i + 1, ...r]);
  sheet.getRange(2, 1, rows.length, 5).setValues(rows);
}

function _seedSchools(sheet) {
  const schools = [
    [1, 'Rajkiya Prathamik Vidyalaya, Sector 12', 'Noida'],
    [2, 'Sarvodaya Bal Vidyalaya, Trilokpuri',     'Delhi'],
    [3, 'MCD Primary School, Sangam Vihar',        'Delhi'],
    [4, 'Govt. Girls School, Badarpur',            'Delhi'],
    [5, 'Rajkiya Vidyalaya, Greater Noida',        'Greater Noida'],
  ];
  sheet.getRange(2, 1, schools.length, 3).setValues(schools);
}

// ============================================================
// SHARED HELPERS
// ============================================================
function _getSheet(name) {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

function _sheetData(name) {
  const sheet = _getSheet(name);
  if (!sheet) return [];
  const vals = sheet.getDataRange().getValues();
  if (vals.length < 2) return [];
  const headers = vals[0];
  return vals.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function _nextId(sheetName, idCol) {
  const sheet = _getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const ids = vals.map(r => Number(r[0])).filter(n => !isNaN(n) && n > 0);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function _appendRow(sheetName, rowArr) {
  const sheet = _getSheet(sheetName);
  sheet.appendRow(rowArr);
}

function getGradeAppropriateLevel(grade) {
  const g = String(grade);
  if (['Balvatika', '1', '2', '3'].includes(g)) return 'L1';
  if (['4', '5'].includes(g)) return 'L2';
  return 'L3';
}

function _levelNum(level) {
  return { 'L1': 1, 'L2': 2, 'L3': 3 }[level] || 0;
}

function _nextLevel(level) {
  return { 'L1': 'L2', 'L2': 'L3' }[level] || level;
}

function _prevLevel(level) {
  return { 'L3': 'L2', 'L2': 'L1' }[level] || level;
}

function _getCurrentLevel(enrollmentId, monthNumber) {
  const history = _sheetData('level_history').filter(
    r => String(r.enrollment_id) === String(enrollmentId) &&
         Number(r.effective_month) <= Number(monthNumber)
  );
  if (!history.length) {
    const enrollment = _sheetData('enrollments').find(
      r => String(r.enrollment_id) === String(enrollmentId)
    );
    return enrollment ? enrollment.initial_level : null;
  }
  history.sort((a, b) => Number(b.effective_month) - Number(a.effective_month));
  return history[0].to_level;
}

// ============================================================
// OUTCOME LOGIC (post-assessments only)
// ============================================================
function _computeAndSaveOutcome(enrollmentId, monthNumber) {
  const outcomes = _sheetData('monthly_outcomes');
  if (outcomes.find(r =>
    String(r.enrollment_id) === String(enrollmentId) &&
    Number(r.month_number) === Number(monthNumber) &&
    r.assessment_type === 'post'
  )) return; // already computed

  const assessments = _sheetData('monthly_assessments').filter(r =>
    String(r.enrollment_id) === String(enrollmentId) &&
    Number(r.month_number) === Number(monthNumber) &&
    r.assessment_type === 'post'
  );
  if (assessments.length < 3) return; // wait for all three subjects

  const h = Number(assessments.find(r => r.subject === 'Hindi').score);
  const e = Number(assessments.find(r => r.subject === 'English').score);
  const n = Number(assessments.find(r => r.subject === 'Numeracy').score);

  const enrollment = _sheetData('enrollments').find(
    r => String(r.enrollment_id) === String(enrollmentId)
  );
  if (!enrollment) return;

  const student = _sheetData('students').find(
    r => String(r.student_id) === String(enrollment.student_id)
  );
  if (!student) return;

  const gradeLevel = getGradeAppropriateLevel(student.grade);
  const currentLevel = _getCurrentLevel(enrollmentId, monthNumber);

  let outcome = null;
  let retentionReason = null;

  const allPass = h >= 6 && e >= 6 && n >= 6;
  const allPerfect = h === 10 && e === 10 && n === 10;

  if (allPerfect && currentLevel === gradeLevel) {
    outcome = 'mainstreamed';
  } else if (allPass && currentLevel === gradeLevel && !allPerfect) {
    outcome = 'retained';
    retentionReason = 'progressing';
  } else if (allPass && _levelNum(currentLevel) < _levelNum(gradeLevel)) {
    outcome = 'promoted';
  } else if (!allPass && _levelNum(currentLevel) > _levelNum('L1')) {
    outcome = 'relegated';
  } else if (!allPass && currentLevel === 'L1') {
    outcome = 'retained';
    retentionReason = 'floor';
  }

  const outcomeId = _nextId('monthly_outcomes', 'outcome_id');
  _appendRow('monthly_outcomes', [
    outcomeId, enrollmentId, monthNumber, 'post',
    h, e, n, outcome, retentionReason
  ]);

  // Write level_history if level changes
  if (outcome === 'promoted' || outcome === 'relegated' || outcome === 'mainstreamed') {
    const histId = _nextId('level_history', 'history_id');
    const toLevel = outcome === 'promoted' ? _nextLevel(currentLevel)
                  : outcome === 'relegated' ? _prevLevel(currentLevel)
                  : null;
    _appendRow('level_history', [
      histId, enrollmentId, currentLevel, toLevel, outcome, monthNumber
    ]);
  }

  SpreadsheetApp.flush();
}

// ============================================================
// FORM APIs — called via google.script.run from HTML pages
// ============================================================
function getSchools() {
  return _sheetData('schools');
}

function getSessions(schoolId) {
  return _sheetData('sessions').filter(
    r => String(r.school_id) === String(schoolId)
  );
}

// Loads all schools + sessions in one call so the form needs only one
// google.script.run invocation on page load instead of two sequential ones.
function getFormInitialData() {
  return {
    schools: _sheetData('schools'),
    sessions: _sheetData('sessions')
  };
}

function createSession(schoolId, volunteerName, startDate, endDate) {
  const id = _nextId('sessions', 'session_id');
  _appendRow('sessions', [id, schoolId, volunteerName, startDate, endDate]);
  SpreadsheetApp.flush();
  return { session_id: id };
}

function getEnrolledStudents(sessionId) {
  const enrollments = _sheetData('enrollments').filter(
    r => String(r.session_id) === String(sessionId)
  );
  const students = _sheetData('students');
  return enrollments.map(enr => {
    const stu = students.find(s => String(s.student_id) === String(enr.student_id)) || {};
    return {
      enrollment_id: enr.enrollment_id,
      student_id: enr.student_id,
      name: stu.name,
      grade: stu.grade,
      initial_level: enr.initial_level
    };
  });
}

function getEnrolledStudentsWithLevel(sessionId, monthNumber) {
  const enrollments = _sheetData('enrollments').filter(
    r => String(r.session_id) === String(sessionId)
  );
  const students = _sheetData('students');
  return enrollments.map(enr => {
    const stu = students.find(s => String(s.student_id) === String(enr.student_id)) || {};
    const currentLevel = _getCurrentLevel(enr.enrollment_id, monthNumber);
    return {
      enrollment_id: enr.enrollment_id,
      student_id: enr.student_id,
      name: stu.name,
      grade: stu.grade,
      current_level: currentLevel
    };
  });
}

function createStudentAndEnroll(sessionId, studentData) {
  // studentData: { name, gender, grade, date_of_birth, hindi_score, english_score, numeracy_score }
  const stuId = _nextId('students', 'student_id');
  const session = _sheetData('sessions').find(r => String(r.session_id) === String(sessionId));
  if (!session) throw new Error('Session not found');

  _appendRow('students', [
    stuId, session.school_id, studentData.name, studentData.gender,
    studentData.grade, studentData.date_of_birth
  ]);

  const h = Number(studentData.hindi_score);
  const e = Number(studentData.english_score);
  const n = Number(studentData.numeracy_score);
  const initialLevel = _computeInitialLevel(studentData.grade, h, e, n);

  const enrId = _nextId('enrollments', 'enrollment_id');
  _appendRow('enrollments', [enrId, sessionId, stuId, initialLevel, h, e, n]);

  // Also write Month 1 pre-assessment rows
  const assessId1 = _nextId('monthly_assessments', 'assessment_id');
  _appendRow('monthly_assessments', [assessId1, enrId, 1, 'pre', 'Hindi', h, initialLevel]);
  const assessId2 = assessId1 + 1;
  _appendRow('monthly_assessments', [assessId2, enrId, 1, 'pre', 'English', e, initialLevel]);
  const assessId3 = assessId1 + 2;
  _appendRow('monthly_assessments', [assessId3, enrId, 1, 'pre', 'Numeracy', n, initialLevel]);

  SpreadsheetApp.flush();
  return { enrollment_id: enrId, initial_level: initialLevel };
}

function _computeInitialLevel(grade, h, e, n) {
  if (['Balvatika', '1', '2', '3'].includes(String(grade))) return 'L1';
  return (h >= 6 && e >= 6 && n >= 6) ? 'L2' : 'L1';
}

function submitMonthlyScores(enrollmentId, monthNumber, assessmentType, hindiScore, englishScore, numeracyScore) {
  const levelAtTime = _getCurrentLevel(enrollmentId, monthNumber);

  const subjects = ['Hindi', 'English', 'Numeracy'];
  const scores = [hindiScore, englishScore, numeracyScore];
  subjects.forEach((subj, i) => {
    const id = _nextId('monthly_assessments', 'assessment_id');
    _appendRow('monthly_assessments', [id, enrollmentId, monthNumber, assessmentType, subj, scores[i], levelAtTime]);
  });

  if (assessmentType === 'post') {
    _computeAndSaveOutcome(enrollmentId, monthNumber);
  }

  SpreadsheetApp.flush();
  return { ok: true };
}

function getCompetencies(level, subject) {
  return _sheetData('competency_master').filter(
    r => r.level === level && r.subject === subject
  ).sort((a, b) => Number(a.week_number) - Number(b.week_number));
}

function submitWeeklyTracking(entries) {
  // entries: [{enrollmentId, competencyName, weekNumber, subject, passed}]
  const today = new Date().toISOString().slice(0, 10);
  entries.forEach(entry => {
    const id = _nextId('weekly_competency_tracking', 'tracking_id');
    _appendRow('weekly_competency_tracking', [
      id, entry.enrollmentId, entry.weekNumber, entry.subject,
      entry.competencyName, entry.passed, today
    ]);
  });
  SpreadsheetApp.flush();
  return { ok: true };
}

// ============================================================
// DASHBOARD APIs
// ============================================================
function getAllSessions() {
  const sessions = _sheetData('sessions');
  const schools = _sheetData('schools');
  return sessions.map(s => {
    const school = schools.find(sc => String(sc.school_id) === String(s.school_id)) || {};
    return { ...s, school_name: school.school_name };
  });
}

function getMainstreamingData(scope, sessionId, monthNumber) {
  // scope: 'session' | 'month'
  const enrollments = _sheetData('enrollments').filter(
    r => !sessionId || String(r.session_id) === String(sessionId)
  );
  const outcomes = _sheetData('monthly_outcomes');
  const sessions = _sheetData('sessions');
  const students = _sheetData('students');

  const result = { bySession: {}, byLevel: { L1: { mainstreamed: 0, remaining: 0 }, L2: { mainstreamed: 0, remaining: 0 }, L3: { mainstreamed: 0, remaining: 0 } }, byGrade: {} };

  GRADES.forEach(g => { result.byGrade[g] = { mainstreamed: 0, remaining: 0 }; });

  enrollments.forEach(enr => {
    const sid = String(enr.session_id);
    if (!result.bySession[sid]) result.bySession[sid] = { mainstreamed: 0, remaining: 0 };

    const isMainstreamed = outcomes.some(o =>
      String(o.enrollment_id) === String(enr.enrollment_id) &&
      o.outcome === 'mainstreamed' &&
      (scope === 'session' || !monthNumber || Number(o.month_number) <= Number(monthNumber))
    );

    const bucket = isMainstreamed ? 'mainstreamed' : 'remaining';
    result.bySession[sid][bucket]++;

    const currentLevel = _getCurrentLevel(enr.enrollment_id, monthNumber || 3);
    result.byLevel[currentLevel || 'L1'][bucket]++;

    const stu = students.find(s => String(s.student_id) === String(enr.student_id));
    if (stu) result.byGrade[String(stu.grade)][bucket]++;
  });

  // Attach session names
  result.sessionNames = {};
  sessions.forEach(s => { result.sessionNames[String(s.session_id)] = s.volunteer_name; });

  result.total = enrollments.length;
  result.mainstreamed = Object.values(result.bySession).reduce((a, b) => a + b.mainstreamed, 0);

  return result;
}

function getLaRLData(scope, sessionId, monthNumber) {
  const enrollments = _sheetData('enrollments').filter(
    r => !sessionId || String(r.session_id) === String(sessionId)
  );
  const students = _sheetData('students');
  const month = Number(monthNumber) || 3;

  let atRightLevel = 0, movedToRightLevel = 0, stillMisplaced = 0;
  const byExpectedGroup = { L1: { moved: 0, misplaced: 0 }, L2: { moved: 0, misplaced: 0 }, L3: { moved: 0, misplaced: 0 } };
  const trend = [1, 2, 3].map(m => {
    let at = 0, total = 0;
    enrollments.forEach(enr => {
      const stu = students.find(s => String(s.student_id) === String(enr.student_id));
      if (!stu) return;
      total++;
      const gradeLevel = getGradeAppropriateLevel(stu.grade);
      const level = _getCurrentLevel(enr.enrollment_id, m);
      if (level === gradeLevel) at++;
    });
    return { month: m, pct: total ? Math.round(at / total * 100) : 0 };
  });

  enrollments.forEach(enr => {
    const stu = students.find(s => String(s.student_id) === String(enr.student_id));
    if (!stu) return;
    const gradeLevel = getGradeAppropriateLevel(stu.grade);
    const initial = enr.initial_level;
    const current = _getCurrentLevel(enr.enrollment_id, month);

    if (current === gradeLevel) {
      atRightLevel++;
      if (initial !== gradeLevel) movedToRightLevel++;
    } else {
      stillMisplaced++;
      byExpectedGroup[gradeLevel].misplaced++;
    }
    if (initial !== gradeLevel && current === gradeLevel) byExpectedGroup[gradeLevel].moved++;
  });

  return {
    total: enrollments.length,
    atRightLevel, movedToRightLevel, stillMisplaced,
    byExpectedGroup, trend
  };
}

function getOutcomesData(sessionId) {
  const enrollments = _sheetData('enrollments').filter(
    r => !sessionId || String(r.session_id) === String(sessionId)
  );
  const outcomes = _sheetData('monthly_outcomes').filter(o => o.assessment_type === 'post');
  const students = _sheetData('students');

  const byMonth = { 1: {}, 2: {}, 3: {} };
  const byLevel = { L1: {}, L2: {}, L3: {} };
  const labels = ['promoted', 'retained_progressing', 'retained_floor', 'relegated'];
  [1, 2, 3].forEach(m => { labels.forEach(l => { byMonth[m][l] = 0; }); });
  ['L1', 'L2', 'L3'].forEach(lv => { labels.forEach(l => { byLevel[lv][l] = 0; }); });

  const enrollmentIds = new Set(enrollments.map(e => String(e.enrollment_id)));
  const subjectScores = { L1: {}, L2: {}, L3: {} };
  ['L1','L2','L3'].forEach(lv => {
    ['Hindi','English','Numeracy'].forEach(s => { subjectScores[lv][s] = []; });
  });

  outcomes.forEach(o => {
    if (!enrollmentIds.has(String(o.enrollment_id))) return;
    const m = Number(o.month_number);
    if (![1,2,3].includes(m)) return;
    const enr = enrollments.find(e => String(e.enrollment_id) === String(o.enrollment_id));
    if (!enr) return;
    const level = _getCurrentLevel(o.enrollment_id, m) || 'L1';

    const key = o.outcome === 'promoted' ? 'promoted'
              : o.outcome === 'relegated' ? 'relegated'
              : o.outcome === 'mainstreamed' ? 'promoted' // count mainstreamed with promoted for simplicity
              : o.retention_reason === 'progressing' ? 'retained_progressing'
              : 'retained_floor';

    byMonth[m][key]++;
    byLevel[level][key]++;

    // Collect per-subject scores for relegation analysis
    ['Hindi','English','Numeracy'].forEach(subj => {
      const score = o[`${subj.toLowerCase()}_score`];
      if (score !== undefined && subjectScores[level]) {
        subjectScores[level][subj].push(Number(score));
      }
    });
  });

  // Average subject scores per level
  const avgSubjectScores = {};
  ['L1','L2','L3'].forEach(lv => {
    avgSubjectScores[lv] = {};
    ['Hindi','English','Numeracy'].forEach(s => {
      const arr = subjectScores[lv][s];
      avgSubjectScores[lv][s] = arr.length ? Math.round(arr.reduce((a,b) => a+b,0) / arr.length * 10) / 10 : null;
    });
  });

  return { byMonth, byLevel, avgSubjectScores };
}

function getAchievementRatioData(level, sessionId) {
  const enrollments = _sheetData('enrollments').filter(
    r => (!sessionId || String(r.session_id) === String(sessionId)) &&
         r.initial_level === level
  );
  const enrollmentIds = new Set(enrollments.map(e => String(e.enrollment_id)));

  const tracking = _sheetData('weekly_competency_tracking').filter(
    r => enrollmentIds.has(String(r.enrollment_id))
  );
  const competencies = _sheetData('competency_master').filter(r => r.level === level);

  const subjects = ['Hindi', 'English', 'Numeracy'];
  const weeks = [2,3,4,5,6,7,8,9,10,11];

  // Per-subject per-week achievement ratio
  const weeklyRatios = {};
  subjects.forEach(subj => {
    weeklyRatios[subj] = {};
    weeks.forEach(w => {
      const taughtSoFar = competencies.filter(c => c.subject === subj && Number(c.week_number) <= w);
      if (!taughtSoFar.length) { weeklyRatios[subj][w] = null; return; }
      const taughtNames = new Set(taughtSoFar.map(c => c.competency_name));
      const passed = tracking.filter(t =>
        t.subject === subj && taughtNames.has(t.competency_name) && t.passed === true
      ).length;
      const possible = tracking.filter(t =>
        t.subject === subj && taughtNames.has(t.competency_name)
      ).length;
      weeklyRatios[subj][w] = possible ? Math.round(passed / possible * 100) : 0;
    });
  });

  // Current ratios (max week with data)
  const currentRatios = {};
  subjects.forEach(subj => {
    const weeksWithData = weeks.filter(w => weeklyRatios[subj][w] !== null && weeklyRatios[subj][w] !== undefined);
    if (!weeksWithData.length) { currentRatios[subj] = { ratio: 0, change: 0 }; return; }
    const maxW = Math.max(...weeksWithData);
    const prev = weeksWithData.length > 1 ? weeklyRatios[subj][weeksWithData[weeksWithData.length - 2]] : 0;
    currentRatios[subj] = { ratio: weeklyRatios[subj][maxW], change: weeklyRatios[subj][maxW] - (prev || 0) };
  });

  const totalRatio = subjects.reduce((a, s) => a + (currentRatios[s].ratio || 0), 0) / 3;

  return { weeklyRatios, currentRatios, totalRatio: Math.round(totalRatio), weeks };
}
