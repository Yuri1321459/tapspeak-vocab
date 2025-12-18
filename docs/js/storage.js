/* TapSpeak Vocab - storage.js
   - localStorage only
   - user-scoped progress
   - stage 0-6 (internal only; never shown by UI)
   - due date as YYYY-MM-DD
   - review: due <= today only
   - wrong: stage-1 (min 0) + "today loop" until correct that day
   - correct: stage+1 (max 6) + next due per stage interval table
   - points: review correct 10 -> +1 point
   - reset: clears progress + points (keeps users/avatars outside of this module)
*/
(function () {
  "use strict";

  const STORAGE_KEY = "tapspeak_state_v1";
  const VERSION = 2;

  // Fixed PIN for "misoperation prevention" only
  const RESET_PIN = "1234";

  // stage -> days until next review
  // stage0 is same-day (due today)
  const STAGE_INTERVAL_DAYS = {
    0: 0,
    1: 1,
    2: 3,
    3: 7,
    4: 14,
    5: 30,
    6: 365
  };

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    const i = Math.trunc(x);
    return Math.max(min, Math.min(max, i));
  }

  function todayKey() {
    const d = new Date();
    return dateToKey(d);
  }

  function dateToKey(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function keyToDate(key) {
    // key: YYYY-MM-DD (local)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  function addDays(key, days) {
    const base = keyToDate(key);
    if (!base) return todayKey();
    const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    dt.setDate(dt.getDate() + Number(days || 0));
    return dateToKey(dt);
  }

  function safeParse(json) {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function emptyUserState() {
    return {
      points: 0,
      reviewCorrectCount: 0, // counts correct answers in review mode for point awarding
      words: {
        // [wordId]: WordProgress
      }
    };
  }

  function emptyWordProgress() {
    return {
      enrolled: false,
      stage: 0,          // 0..6 (internal)
      due: null,         // YYYY-MM-DD or null
      loopUntilDate: null, // YYYY-MM-DD while "today loop" is active; otherwise null
      seen: 0,           // times shown / interacted (optional metric)
      remembered: 0      // times "おぼえた" pressed (optional metric)
    };
  }

  function normalizeState(raw) {
    // Backward compatibility with earlier minimal shapes
    const st = (raw && typeof raw === "object") ? raw : {};

    const next = {
      version: VERSION,
      activeUserId: typeof st.activeUserId === "string" ? st.activeUserId : (typeof st.userId === "string" ? st.userId : "riona"),
      users: {}
    };

    // If older schema stored points at top-level
    const topPoints = Number.isFinite(st.points) ? st.points : 0;

    // If older schema had a single user embedded
    if (st.users && typeof st.users === "object") {
      for (const [uid, u] of Object.entries(st.users)) {
        const uo = (u && typeof u === "object") ? u : {};
        next.users[uid] = {
          points: Number.isFinite(uo.points) ? uo.points : 0,
          reviewCorrectCount: Number.isFinite(uo.reviewCorrectCount) ? uo.reviewCorrectCount : 0,
          words: (uo.words && typeof uo.words === "object") ? uo.words : {}
        };
      }
    } else {
      // single-user fallback
      const uid = next.activeUserId || "riona";
      next.users[uid] = emptyUserState();
      next.users[uid].points = topPoints;
    }

    if (!next.users[next.activeUserId]) {
      next.users[next.activeUserId] = emptyUserState();
    }

    // Normalize words progress objects
    for (const u of Object.values(next.users)) {
      if (!u.words || typeof u.words !== "object") u.words = {};
      for (const [wid, wp] of Object.entries(u.words)) {
        const wpo = (wp && typeof wp === "object") ? wp : {};
        u.words[wid] = {
          enrolled: Boolean(wpo.enrolled),
          stage: clampInt(wpo.stage, 0, 6),
          due: (typeof wpo.due === "string" && keyToDate(wpo.due)) ? wpo.due : null,
          loopUntilDate: (typeof wpo.loopUntilDate === "string" && keyToDate(wpo.loopUntilDate)) ? wpo.loopUntilDate : null,
          seen: clampInt(wpo.seen, 0, 1_000_000),
          remembered: clampInt(wpo.remembered, 0, 1_000_000)
        };
      }
    }

    return next;
  }

  function load() {
    const raw = safeParse(localStorage.getItem(STORAGE_KEY) || "");
    const st = normalizeState(raw);
    return st;
  }

  function save(st) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
  }

  function ensureUser(st, userId) {
    const uid = userId || st.activeUserId || "riona";
    if (!st.users[uid]) st.users[uid] = emptyUserState();
    return uid;
  }

  function ensureWord(uState, wordId) {
    if (!uState.words[wordId]) uState.words[wordId] = emptyWordProgress();
    return uState.words[wordId];
  }

  function computeNextDueFromStage(stage, baseDateKey) {
    const s = clampInt(stage, 0, 6);
    const days = STAGE_INTERVAL_DAYS[s] ?? 0;
    return addDays(baseDateKey, days);
  }

  function isDueTodayOrPast(wordProgress, today) {
    if (!wordProgress || !wordProgress.enrolled) return false;

    const t = today || todayKey();

    // Today-loop forces due today until correct that day
    if (wordProgress.loopUntilDate === t) return true;

    if (!wordProgress.due) return false;
    // Compare lexicographically safe for YYYY-MM-DD
    return wordProgress.due <= t;
  }

  function getDueWordIdsForUser(userId, wordIds, dateKey) {
    const st = load();
    const uid = ensureUser(st, userId);
    const u = st.users[uid];
    const t = dateKey || todayKey();

    const list = [];
    const source = Array.isArray(wordIds) ? wordIds : Object.keys(u.words);

    for (const wid of source) {
      const wp = u.words[wid];
      if (isDueTodayOrPast(wp, t)) list.push(wid);
    }
    return list;
  }

  function setActiveUser(userId) {
    const st = load();
    const uid = ensureUser(st, userId);
    st.activeUserId = uid;
    save(st);
    return uid;
  }

  function getActiveUser() {
    const st = load();
    return st.activeUserId || "riona";
  }

  function getUserPoints(userId) {
    const st = load();
    const uid = ensureUser(st, userId);
    return st.users[uid].points || 0;
  }

  function setUserPoints(userId, points) {
    const st = load();
    const uid = ensureUser(st, userId);
    st.users[uid].points = clampInt(points, 0, 1_000_000_000);
    save(st);
    return st.users[uid].points;
  }

  function enrollWord(userId, wordId, dateKey) {
    const st = load();
    const uid = ensureUser(st, userId);
    const u = st.users[uid];
    const wp = ensureWord(u, wordId);

    const t = dateKey || todayKey();

    wp.enrolled = true;
    wp.stage = 0;
    wp.due = t; // stage0 => today
    wp.loopUntilDate = null;
    wp.remembered = clampInt(wp.remembered + 1, 0, 1_000_000);
    save(st);

    return { stage: wp.stage, due: wp.due, enrolled: wp.enrolled };
  }

  function markForgotInWordsMode(userId, wordId) {
    // Spec: "わすれた" in words mode does NOT change stage.
    // But it should remove from review queue until re-enroll.
    const st = load();
    const uid = ensureUser(st, userId);
    const u = st.users[uid];
    const wp = ensureWord(u, wordId);

    wp.enrolled = false;
    wp.due = null;
    wp.loopUntilDate = null;
    save(st);

    return { stage: wp.stage, due: wp.due, enrolled: wp.enrolled };
  }

  function touchSeen(userId, wordId) {
    const st = load();
    const uid = ensureUser(st, userId);
    const u = st.users[uid];
    const wp = ensureWord(u, wordId);

    wp.seen = clampInt(wp.seen + 1, 0, 1_000_000);
    save(st);

    return wp.seen;
  }

  function applyReviewResult(userId, wordId, isCorrect, dateKey) {
    // Spec:
    // - correct => stage+1 (max 6), correct.mp3 + sparkle handled elsewhere
    // - wrong   => stage-1 (min 0), wrong.mp3 handled elsewhere
    // - wrong triggers today-loop until a correct occurs that day
    // - due recalculated after correct based on (new) stage
    const st = load();
    const uid = ensureUser(st, userId);
    const u = st.users[uid];
    const wp = ensureWord(u, wordId);

    const t = dateKey || todayKey();

    // If it's not enrolled, review action should still treat it as enrolled (defensive)
    if (!wp.enrolled) {
      wp.enrolled = true;
      if (wp.due == null) wp.due = t;
      wp.stage = clampInt(wp.stage, 0, 6);
    }

    if (isCorrect) {
      wp.stage = clampInt(wp.stage + 1, 0, 6);

      // Clear today-loop if active for today
      if (wp.loopUntilDate === t) wp.loopUntilDate = null;

      wp.due = computeNextDueFromStage(wp.stage, t);

      // Points: 10 correct in review => +1 point
      u.reviewCorrectCount = clampInt(u.reviewCorrectCount + 1, 0, 1_000_000_000);
      if (u.reviewCorrectCount >= 10) {
        const gained = Math.floor(u.reviewCorrectCount / 10);
        u.points = clampInt((u.points || 0) + gained, 0, 1_000_000_000);
        u.reviewCorrectCount = u.reviewCorrectCount % 10;
        save(st);
        return {
          stage: wp.stage,
          due: wp.due,
          enrolled: wp.enrolled,
          pointGained: gained
        };
      }

      save(st);
      return { stage: wp.stage, due: wp.due, enrolled: wp.enrolled, pointGained: 0 };
    }

    // Wrong
    wp.stage = clampInt(wp.stage - 1, 0, 6);
    wp.due = t;
    wp.loopUntilDate = t;
    save(st);
    return { stage: wp.stage, due: wp.due, enrolled: wp.enrolled, pointGained: 0 };
  }

  function getWordProgress(userId, wordId) {
    const st = load();
    const uid = ensureUser(st, userId);
    const u = st.users[uid];
    const wp = ensureWord(u, wordId);
    return {
      enrolled: wp.enrolled,
      stage: wp.stage,
      due: wp.due,
      loopUntilDate: wp.loopUntilDate,
      seen: wp.seen,
      remembered: wp.remembered
    };
  }

  function resetAllProgressForUser(userId, pin) {
    if (String(pin || "") !== RESET_PIN) return { ok: false };

    const st = load();
    const uid = ensureUser(st, userId);
    const u = st.users[uid];

    u.points = 0;
    u.reviewCorrectCount = 0;
    u.words = {};

    save(st);
    return { ok: true };
  }

  function getResetPinHint() {
    // For UI copy only (developer/admin side). Do not show stage values elsewhere.
    return "1234";
  }

  // Public API
  window.TapSpeakStorage = {
    STORAGE_KEY,

    todayKey,
    addDays,

    getActiveUser,
    setActiveUser,

    getUserPoints,
    setUserPoints,

    touchSeen,

    enrollWord,
    markForgotInWordsMode,

    getWordProgress,
    getDueWordIdsForUser,

    applyReviewResult,

    resetAllProgressForUser,
    getResetPinHint
  };
})();
