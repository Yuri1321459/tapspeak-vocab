/* TapSpeak Vocab - app.js (Complete)
   Fixes per user's "complete version" requirements:

   - On first open: show USER screen (not home)
   - User screen: choose user + reset progress/points (PIN)
   - Remove extra user subtitles (no "5さい" etc.)
   - Developer label: small "開発用"
   - Top bar:
       - mode label shows count: "いまは：たんご 0こ" / "いまは：ふくしゅう 0こ"
       - points always visible
       - scope text defaults to "ぜんかてごり" (words.js can override if it wants)
       - due count pill always shows "いま やる：Nこ" (due<=today only)
   - No "next implementation" placeholder text in UI
*/

(function () {
  "use strict";

  if (window.__TapSpeakAppInitialized) return;
  window.__TapSpeakAppInitialized = true;

  function requireGlobal(name) {
    if (!window[name]) throw new Error(`${name} is required`);
    return window[name];
  }

  const Storage = requireGlobal("TapSpeakStorage");
  const Audio = requireGlobal("TapSpeakAudio");

  const Review = window.TapSpeakReview || null;
  const Words = window.TapSpeakWords || null;

  const WORDS_URL = "data/words.json";

  function $(id) { return document.getElementById(id); }

  const views = {
    user: $("viewUser"),
    home: $("viewHome"),
    words: $("viewWords"),
    review: $("viewReview"),
    settings: $("viewSettings")
  };

  const ui = {
    modeTag: $("modeTag"),
    pointsText: $("pointsText"),
    scopeText: $("scopeText"),
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

    userList: $("userList"),
    userPointsText: $("userPointsText"),

    resetPin: $("resetPin"),
    btnResetAll: $("btnResetAll"),
    resetResult: $("resetResult")
  };

  const USERS = [
    { id: "riona", name: "りおな", dev: false },
    { id: "soma", name: "そうま", dev: false },
    { id: "dev", name: "かいはつ", dev: true } // small label "開発用"
  ];

  function showOnly(key) {
    for (const [k, v] of Object.entries(views)) {
      if (!v) continue;
      v.classList.toggle("hidden", k !== key);
    }
    try { window.scrollTo({ top: 0, behavior: "instant" }); } catch (_) { window.scrollTo(0, 0); }
  }

  function setPointsUI(points) {
    if (ui.pointsText) ui.pointsText.textContent = String(points ?? 0);
    if (ui.userPointsText) ui.userPointsText.textContent = String(points ?? 0);
  }

  function setDueCountUI(n) {
    const v = String(n ?? 0);
    if (ui.dueCountText) ui.dueCountText.textContent = v;
    if (ui.dueCountText2) ui.dueCountText2.textContent = v;
  }

  function setScopeText(text) {
    if (!ui.scopeText) return;
    ui.scopeText.textContent = text || "ぜんかてごり";
  }

  function setModeTag(mode, count) {
    if (!ui.modeTag) return;
    const c = Number.isFinite(count) ? count : 0;

    if (mode === "review") {
      ui.modeTag.dataset.mode = "review";
      ui.modeTag.textContent = `いまは：ふくしゅう ${c}こ`;
    } else {
      ui.modeTag.dataset.mode = "words";
      ui.modeTag.textContent = `いまは：たんご ${c}こ`;
    }
  }

  // ---- words.json helpers ----
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

  async function computeCountsForActiveUser() {
    const userId = Storage.getActiveUser();
    const data = await fetchWordsJson();
    const words = extractWords(data);

    const totalWords = words.length;

    const ids = words.map(w => w.id);
    const dueIds = Storage.getDueWordIdsForUser(userId, ids, Storage.todayKey());
    const dueCount = dueIds.length;

    return { totalWords, dueCount };
  }

  async function syncTopUIFor(mode) {
    const userId = Storage.getActiveUser();
    setPointsUI(Storage.getUserPoints(userId));
    setScopeText("ぜんかてごり");

    try {
      const { totalWords, dueCount } = await computeCountsForActiveUser();
      setDueCountUI(dueCount);
      if (mode === "review") setModeTag("review", dueCount);
      else setModeTag("words", totalWords);
    } catch (e) {
      // If words.json load fails, still show 0
      setDueCountUI(0);
      if (mode === "review") setModeTag("review", 0);
      else setModeTag("words", 0);
    }
  }

  // ---- Render user list ----
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
      left.appendChild(nm);

      const right = el("div");
      if (u.dev) {
        const mark = el("span", "devMark", "開発用");
        right.appendChild(mark);
      }

      row.appendChild(left);
      row.appendChild(right);

      const pick = async () => {
        Storage.setActiveUser(u.id);
        await syncTopUIFor("words");
        showOnly("home");
      };

      row.addEventListener("click", pick);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      });

      ui.userList.appendChild(row);
    }
  }

  // ---- Reset on user screen ----
  function wireReset() {
    if (!ui.btnResetAll) return;

    ui.btnResetAll.addEventListener("click", async () => {
      const pin = String(ui.resetPin?.value || "");
      const userId = Storage.getActiveUser();

      const r = Storage.resetAllProgressForUser(userId, pin);
      if (r.ok) {
        if (ui.resetResult) ui.resetResult.textContent = "りせっと しました。";
        if (ui.resetPin) ui.resetPin.value = "";
        await syncTopUIFor("words");

        // Review view might be open later; ensure due count updated
        try {
          if (window.TapSpeakReview && window.TapSpeakReview.renderReview) {
            // no-op here; refresh happens on open
          }
        } catch (_) {}
      } else {
        if (ui.resetResult) ui.resetResult.textContent = "PIN が ちがいます。";
      }
    });
  }

  // ---- Audio unlock on first gesture (iOS) ----
  function attachOneTimeAudioUnlock() {
    function once() {
      try { Audio.unlockByUserGesture(); } catch (e) {}
      document.removeEventListener("touchstart", once, { passive: true });
      document.removeEventListener("click", once, true);
    }
    document.addEventListener("touchstart", once, { passive: true });
    document.addEventListener("click", once, true);
  }

  // ---- Module inits (guarded) ----
  let reviewController = null;

  async function initWordsIfAvailable() {
    if (!Words || typeof Words.initWords !== "function") return null;
    const userId = Storage.getActiveUser();
    return await Words.initWords({ wordsUrl: WORDS_URL, userId, rootId: "wordsRoot" });
  }

  async function initReviewIfAvailable() {
    if (!Review || typeof Review.initReview !== "function") return null;
    const userId = Storage.getActiveUser();
    reviewController = await Review.initReview({ wordsUrl: WORDS_URL, userId, rootId: "reviewRoot" });
    return reviewController;
  }

  // ---- Navigation ----
  function wireNav() {
    if (ui.btnUser) ui.btnUser.addEventListener("click", async () => {
      renderUsers();
      const userId = Storage.getActiveUser();
      setPointsUI(Storage.getUserPoints(userId));
      showOnly("user");
    });

    if (ui.btnHome) ui.btnHome.addEventListener("click", async () => {
      showOnly("home");
      await syncTopUIFor(ui.modeTag?.dataset?.mode === "review" ? "review" : "words");
    });

    if (ui.goWords) ui.goWords.addEventListener("click", async () => {
      showOnly("words");
      await syncTopUIFor("words");
    });

    if (ui.btnModeWords) ui.btnModeWords.addEventListener("click", async () => {
      showOnly("words");
      await syncTopUIFor("words");
    });

    if (ui.goReview) ui.goReview.addEventListener("click", async () => {
      showOnly("review");
      if (!reviewController) await initReviewIfAvailable();
      await syncTopUIFor("review");
    });

    if (ui.btnModeReview) ui.btnModeReview.addEventListener("click", async () => {
      showOnly("review");
      if (!reviewController) await initReviewIfAvailable();
      await syncTopUIFor("review");
    });

    if (ui.goSettings) ui.goSettings.addEventListener("click", async () => {
      showOnly("settings");
      await syncTopUIFor(ui.modeTag?.dataset?.mode === "review" ? "review" : "words");
    });

    if (ui.btnCategory) ui.btnCategory.addEventListener("click", () => {
      alert("かてごり の せんたくは たんご がめんで します。");
    });

    document.addEventListener("visibilitychange", async () => {
      if (!document.hidden) {
        const mode = ui.modeTag?.dataset?.mode === "review" ? "review" : "words";
        await syncTopUIFor(mode);
      }
    });
  }

  // ---- Boot ----
  (async function boot() {
    attachOneTimeAudioUnlock();

    // Ensure active user exists
    const active = Storage.getActiveUser();
    if (!active) Storage.setActiveUser("riona");

    // Start at USER screen (requirement)
    renderUsers();
    setPointsUI(Storage.getUserPoints(Storage.getActiveUser()));
    wireReset();
    wireNav();

    showOnly("user");
    await syncTopUIFor("words");

    // Initialize words module (if exists) so "完全版"として単語帳がすぐ動く
    try { await initWordsIfAvailable(); } catch (_) {}
  })();
})();
