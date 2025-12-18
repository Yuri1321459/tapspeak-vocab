/* TapSpeak Vocab - app.js
   App bootstrap / glue code

   Responsibilities:
   - Initialize modules (Storage / Audio / Words / Review / Settings)
   - Handle navigation & mode tag updates
   - Update points and due-count in top bar & home
   - Render user select (including small "開発者" mark)
   - Ensure iOS audio unlock runs on first user gesture

   Notes:
   - words.js may be user-customized; this file calls it only if available:
       window.TapSpeakWords.initWords({ wordsUrl, userId })
   - review.js/settings.js/storage.js/audio.js/filters.js are assumed present.
*/

(function () {
  "use strict";

  // Prevent double init (in case index.html also has inline scripts)
  if (window.__TapSpeakAppInitialized) return;
  window.__TapSpeakAppInitialized = true;

  function requireGlobal(name) {
    if (!window[name]) throw new Error(`${name} is required`);
    return window[name];
  }

  const Storage = requireGlobal("TapSpeakStorage");
  const Audio = requireGlobal("TapSpeakAudio");

  const Review = window.TapSpeakReview || null;
  const Settings = window.TapSpeakSettings || null;
  const Words = window.TapSpeakWords || null;

  const WORDS_URL = "data/words.json";

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }

  const views = {
    home: $("viewHome"),
    user: $("viewUser"),
    words: $("viewWords"),
    review: $("viewReview"),
    settings: $("viewSettings")
  };

  const ui = {
    modeTag: $("modeTag"),
    pointsText: $("pointsText"),
    dueCountText: $("dueCountText"),
    dueCountText2: $("dueCountText2"),

    btnHome: $("btnHome"),
    btnUser: $("btnUser"),
    btnCategory: $("btnCategory"),
    btnModeWords: $("btnModeWords"),
    btnModeReview: $("btnModeReview"),

    goWords: $("goWords"),
    goReview: $("goReview"),
    goSettings: $("goSettings"),

    userList: $("userList")
  };

  // ---------- User list (with small "開発者") ----------
  const USERS = [
    { id: "riona", name: "りおな", sub: "5さい", dev: false },
    { id: "soma", name: "そうま", sub: "（これから）", dev: false },
    { id: "dev", name: "かいはつ", sub: "テストよう", dev: true }
  ];

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function renderUsers() {
    if (!ui.userList) return;
    clear(ui.userList);

    for (const u of USERS) {
      const row = el("div", "userItem");
      row.setAttribute("role", "button");
      row.tabIndex = 0;

      const left = el("div");
      const nm = el("div", "userItem__name", u.name);
      const sb = el("div", "userItem__sub", u.sub);
      left.appendChild(nm);
      left.appendChild(sb);

      const right = el("div");
      const mark = el("span", "devMark", u.dev ? "開発者" : " ");
      if (!u.dev) {
        mark.style.opacity = "0";
        mark.style.borderStyle = "solid";
      }
      right.appendChild(mark);

      row.appendChild(left);
      row.appendChild(right);

      function pick() {
        Storage.setActiveUser(u.id);
        syncTopBar();
        // After switching user, refresh current view data
        refreshAllVisible();
        showOnly("home");
      }

      row.addEventListener("click", pick);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      });

      ui.userList.appendChild(row);
    }
  }

  // ---------- View switching ----------
  function showOnly(key) {
    for (const [k, v] of Object.entries(views)) {
      if (!v) continue;
      v.classList.toggle("hidden", k !== key);
    }
    try { window.scrollTo({ top: 0, behavior: "instant" }); } catch (_) { window.scrollTo(0, 0); }
  }

  function setModeTag(mode) {
    if (!ui.modeTag) return;
    if (mode === "review") {
      ui.modeTag.dataset.mode = "review";
      ui.modeTag.textContent = "いまは：ふくしゅう";
    } else {
      ui.modeTag.dataset.mode = "words";
      ui.modeTag.textContent = "いまは：たんご";
    }
  }

  // ---------- Counts / points ----------
  function setPointsUI(points) {
    if (ui.pointsText) ui.pointsText.textContent = String(points ?? 0);
  }

  function setDueCountUI(n) {
    const v = String(n ?? 0);
    if (ui.dueCountText) ui.dueCountText.textContent = v;
    if (ui.dueCountText2) ui.dueCountText2.textContent = v;
  }

  async function fetchWordsJson() {
    const res = await fetch(WORDS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("words.json not found");
    return await res.json();
  }

  function extractWords(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.words)) return json.words;
    return [];
  }

  async function computeDueCountForActiveUser() {
    const userId = Storage.getActiveUser();
    const data = await fetchWordsJson();
    const words = extractWords(data);
    const ids = words.map(w => w.id);
    const dueIds = Storage.getDueWordIdsForUser(userId, ids, Storage.todayKey());
    return dueIds.length;
  }

  async function syncTopBar() {
    const userId = Storage.getActiveUser();
    setPointsUI(Storage.getUserPoints(userId));
    try {
      const dueCount = await computeDueCountForActiveUser();
      setDueCountUI(dueCount);
    } catch (e) {
      // If words.json isn't available yet, keep 0
      setDueCountUI(0);
    }
  }

  // ---------- Module init / refresh ----------
  let reviewController = null;

  async function initWordsIfAvailable() {
    if (!Words || typeof Words.initWords !== "function") return null;
    const userId = Storage.getActiveUser();
    try {
      return await Words.initWords({ wordsUrl: WORDS_URL, userId });
    } catch (e) {
      // Words module may manage its own loading; ignore
      return null;
    }
  }

  async function initReviewIfAvailable() {
    if (!Review || typeof Review.initReview !== "function") return null;
    const userId = Storage.getActiveUser();
    try {
      reviewController = await Review.initReview({ wordsUrl: WORDS_URL, userId });
      return reviewController;
    } catch (e) {
      // Review screen may be placeholder in some builds; ignore
      return null;
    }
  }

  function initSettingsIfAvailable() {
    if (!Settings || typeof Settings.initSettings !== "function") return;
    try { Settings.initSettings(); } catch (e) {}
  }

  async function refreshAllVisible() {
    // Update points & due counts first
    await syncTopBar();

    // If review view is visible and controller exists, refresh it (keeps due count accurate)
    const reviewVisible = views.review && !views.review.classList.contains("hidden");
    if (reviewVisible && reviewController && typeof reviewController.refresh === "function") {
      try { await reviewController.refresh(); } catch (e) {}
      await syncTopBar();
    }
  }

  // ---------- Audio unlock on first gesture ----------
  function attachOneTimeAudioUnlock() {
    function once() {
      try { Audio.unlockByUserGesture(); } catch (e) {}
      document.removeEventListener("touchstart", once, { passive: true });
      document.removeEventListener("click", once, true);
    }
    document.addEventListener("touchstart", once, { passive: true });
    document.addEventListener("click", once, true);
  }

  // ---------- Wire navigation ----------
  function wireEvents() {
    if (ui.btnHome) ui.btnHome.addEventListener("click", async () => { showOnly("home"); await syncTopBar(); });
    if (ui.btnUser) ui.btnUser.addEventListener("click", () => { renderUsers(); showOnly("user"); });

    if (ui.goWords) ui.goWords.addEventListener("click", async () => {
      setModeTag("words");
      showOnly("words");
      await syncTopBar();
    });

    if (ui.btnModeWords) ui.btnModeWords.addEventListener("click", async () => {
      setModeTag("words");
      showOnly("words");
      await syncTopBar();
    });

    if (ui.goReview) ui.goReview.addEventListener("click", async () => {
      setModeTag("review");
      showOnly("review");
      if (!reviewController) await initReviewIfAvailable();
      await refreshAllVisible();
    });

    if (ui.btnModeReview) ui.btnModeReview.addEventListener("click", async () => {
      setModeTag("review");
      showOnly("review");
      if (!reviewController) await initReviewIfAvailable();
      await refreshAllVisible();
    });

    if (ui.goSettings) ui.goSettings.addEventListener("click", () => { showOnly("settings"); });

    if (ui.btnCategory) ui.btnCategory.addEventListener("click", () => {
      // Category switching UI is expected to be in words.js (user-customized).
      // Keep minimal message here to avoid adding extra behavior.
      alert("カテゴリきりかえは、たんご がめんで します。");
    });

    // When returning to app tab, refresh counts
    document.addEventListener("visibilitychange", async () => {
      if (!document.hidden) await refreshAllVisible();
    });
  }

  // ---------- Boot ----------
  (async function boot() {
    attachOneTimeAudioUnlock();

    // Ensure we have an active user in storage (default handled by Storage)
    const active = Storage.getActiveUser();
    if (!active) Storage.setActiveUser("riona");

    // Default start: home + words mode tag
    setModeTag("words");
    showOnly("home");

    // Build settings UI (safe even if placeholder)
    initSettingsIfAvailable();

    // Initialize words (if provided)
    await initWordsIfAvailable();

    // Update top bar counts
    await syncTopBar();

    // Wire events last
    wireEvents();
  })();
})();
