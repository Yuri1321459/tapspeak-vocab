/* TapSpeak Vocab - review.js
   Review mode core (spec-fixed):

   - Review shows ONLY due words: due <= today
   - List view (scroll). No full-screen 1-by-1.
   - Card flow:
       Initial: (image OR word) + 🎤 (enabled) + 🔊 (disabled)
       🎤: play speak_start.mp3, 1s later enable 🔊
       🔊: speak answer + flip (image <-> word), then show ◯ / ×
       ◯: stage +1, play correct.mp3, sparkle 0.4s, schedule next due by stage table
           + points: 10 correct => +1 point (via storage)
       ×: stage -1 (min 0), play wrong.mp3, today-loop until correct that day

   - Stage is internal only: NEVER shown.
   - Wording: "いま やる ことば" (no "期限切れ")
   - Uses:
       window.TapSpeakStorage
       window.TapSpeakAudio
*/

(function () {
  "use strict";

  // ---------- Guards ----------
  function requireGlobal(name) {
    if (!window[name]) throw new Error(`${name} is required`);
    return window[name];
  }

  const Storage = requireGlobal("TapSpeakStorage");
  const Audio = requireGlobal("TapSpeakAudio");

  // ---------- DOM helpers ----------
  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ---------- Speech fallback (when per-word mp3 is missing) ----------
  function speakEnglish(text) {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text || ""));
      u.lang = "en-US";
      u.rate = 0.95;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) {
      // ignore
    }
  }

  function playAnswer(word) {
    // Prefer per-word mp3 if provided; else TTS fallback
    if (word && word.audio) {
      Audio.playWord(word.audio);
    } else if (word && word.word_en) {
      speakEnglish(word.word_en);
    }
  }

  // ---------- Visual sparkle (0.4s) ----------
  function sparkleOn(cardRoot) {
    const s = el("div");
    s.style.position = "absolute";
    s.style.inset = "0";
    s.style.pointerEvents = "none";
    s.style.background =
      "radial-gradient(180px 120px at 70% 30%, rgba(255,255,255,.35), transparent 60%)," +
      "radial-gradient(140px 110px at 30% 70%, rgba(255,255,255,.20), transparent 60%)";
    s.style.opacity = "0";
    s.style.transition = "opacity 120ms ease";
    cardRoot.appendChild(s);

    // force reflow then animate
    void s.offsetHeight;
    s.style.opacity = "1";

    setTimeout(() => {
      s.style.opacity = "0";
      setTimeout(() => { try { s.remove(); } catch (e) {} }, 180);
    }, 220); // total ~0.4s
  }

  // ---------- Count updates (top bar + home card) ----------
  function setDueCountUI(n) {
    const v = String(n ?? 0);

    const a = $("dueCountText");
    const b = $("dueCountText2");
    if (a) a.textContent = v;
    if (b) b.textContent = v;

    // If the home UI shows "いま やる ことば", keep as-is; we do not show "期限切れ".
  }

  function setPointsUI(points) {
    const p = $("pointsText");
    if (p) p.textContent = String(points ?? 0);
  }

  // ---------- Data adapter for words.json ----------
  function extractWords(json) {
    // Accept both formats:
    // - { words:[...] }
    // - [...] (array)
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.words)) return json.words;
    return [];
  }

  // ---------- Card rendering ----------
  function buildReviewCard(word, userId) {
    const root = el("div");
    root.style.borderRadius = "18px";
    root.style.background = "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.045))";
    root.style.border = "1px solid rgba(255,255,255,.10)";
    root.style.boxShadow = "0 10px 30px rgba(0,0,0,.45)";
    root.style.padding = "16px";
    root.style.position = "relative";
    root.style.overflow = "hidden";
    root.style.marginBottom = "12px";

    const head = el("div");
    head.style.display = "flex";
    head.style.alignItems = "baseline";
    head.style.justifyContent = "space-between";
    head.style.gap = "10px";
    head.style.marginBottom = "10px";

    const title = el("div", null, "ふくしゅう");
    title.style.fontWeight = "900";
    title.style.fontSize = "14px";
    title.style.opacity = "0.9";

    const sub = el("div", null, "いま やる ことば");
    sub.style.fontSize = "12px";
    sub.style.fontWeight = "800";
    sub.style.opacity = "0.7";

    head.appendChild(title);
    head.appendChild(sub);

    // Main display (image OR word)
    const main = el("div");
    main.style.display = "grid";
    main.style.gridTemplateColumns = "1fr";
    main.style.gap = "10px";

    const display = el("div");
    display.style.borderRadius = "14px";
    display.style.border = "1px solid rgba(255,255,255,.10)";
    display.style.background = "rgba(255,255,255,.05)";
    display.style.padding = "12px";
    display.style.minHeight = "120px";
    display.style.display = "flex";
    display.style.alignItems = "center";
    display.style.justifyContent = "center";
    display.style.textAlign = "center";
    display.style.userSelect = "none";
    display.style.webkitTapHighlightColor = "transparent";

    const img = el("img");
    img.alt = word.word_en || "";
    img.src = word.image || "";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "160px";
    img.style.objectFit = "contain";
    img.style.display = "block";

    const wtxt = el("div");
    wtxt.textContent = word.word_en || "";
    wtxt.style.fontSize = "28px";
    wtxt.style.fontWeight = "900";
    wtxt.style.letterSpacing = "0.3px";

    // Internal state: start with image if available, otherwise word
    let showing = (word.image ? "image" : "word");
    function renderDisplay() {
      clear(display);
      if (showing === "image" && word.image) display.appendChild(img);
      else display.appendChild(wtxt);
    }
    function flipDisplay() {
      if (word.image) {
        showing = (showing === "image") ? "word" : "image";
      } else {
        showing = "word";
      }
      renderDisplay();
    }
    renderDisplay();

    // Buttons row
    const btnRow = el("div");
    btnRow.style.display = "grid";
    btnRow.style.gridTemplateColumns = "1fr 1fr";
    btnRow.style.gap = "10px";

    const btnSpeak = el("button", null, "🎤 いってみて");
    btnSpeak.style.border = "1px solid rgba(255,255,255,.12)";
    btnSpeak.style.background = "rgba(255,255,255,.06)";
    btnSpeak.style.color = "rgba(255,255,255,.92)";
    btnSpeak.style.borderRadius = "14px";
    btnSpeak.style.padding = "14px 12px";
    btnSpeak.style.fontWeight = "900";
    btnSpeak.style.fontSize = "14px";
    btnSpeak.style.cursor = "pointer";
    btnSpeak.style.webkitTapHighlightColor = "transparent";

    const btnHear = el("button", null, "🔊 こたえをきく");
    btnHear.style.border = "1px solid rgba(255,255,255,.12)";
    btnHear.style.background = "rgba(255,255,255,.06)";
    btnHear.style.color = "rgba(255,255,255,.92)";
    btnHear.style.borderRadius = "14px";
    btnHear.style.padding = "14px 12px";
    btnHear.style.fontWeight = "900";
    btnHear.style.fontSize = "14px";
    btnHear.style.cursor = "pointer";
    btnHear.style.webkitTapHighlightColor = "transparent";
    btnHear.disabled = true;
    btnHear.style.opacity = "0.55";
    btnHear.style.cursor = "not-allowed";

    btnRow.appendChild(btnSpeak);
    btnRow.appendChild(btnHear);

    // Judge row (hidden until after hear)
    const judgeRow = el("div");
    judgeRow.style.display = "none";
    judgeRow.style.gridTemplateColumns = "1fr 1fr";
    judgeRow.style.gap = "10px";
    judgeRow.style.marginTop = "10px";

    const btnOk = el("button", null, "◯");
    btnOk.style.border = "none";
    btnOk.style.background = "linear-gradient(135deg, rgba(27,220,122,.95), rgba(0,194,168,.85))";
    btnOk.style.color = "rgba(7,11,18,.95)";
    btnOk.style.borderRadius = "14px";
    btnOk.style.padding = "14px 12px";
    btnOk.style.fontWeight = "1000";
    btnOk.style.fontSize = "18px";
    btnOk.style.cursor = "pointer";
    btnOk.style.webkitTapHighlightColor = "transparent";

    const btnNg = el("button", null, "×");
    btnNg.style.border = "none";
    btnNg.style.background = "linear-gradient(135deg, rgba(255,88,88,.92), rgba(255,164,88,.86))";
    btnNg.style.color = "rgba(7,11,18,.95)";
    btnNg.style.borderRadius = "14px";
    btnNg.style.padding = "14px 12px";
    btnNg.style.fontWeight = "1000";
    btnNg.style.fontSize = "18px";
    btnNg.style.cursor = "pointer";
    btnNg.style.webkitTapHighlightColor = "transparent";

    judgeRow.appendChild(btnOk);
    judgeRow.appendChild(btnNg);

    // Status line (developer/admin friendly; allowed exception)
    const devLine = el("div");
    devLine.style.marginTop = "10px";
    devLine.style.fontSize = "12px";
    devLine.style.opacity = "0.65";
    devLine.style.lineHeight = "1.5";

    function refreshDevLine() {
      // For developer/admin only (spec: exceptions allowed)
      const p = Storage.getWordProgress(userId, word.id);
      const due = p.due ? p.due : "-";
      const en = p.enrolled ? "enrolled" : "not-enrolled";
      devLine.textContent = `id=${word.id} / ${en} / due=${due}`;
    }

    // Flow flags
    let hearUnlocked = false;
    let answeredRevealed = false;
    let busy = false;

    function setHearEnabled(on) {
      btnHear.disabled = !on;
      btnHear.style.opacity = on ? "1" : "0.55";
      btnHear.style.cursor = on ? "pointer" : "not-allowed";
    }

    function setButtonsEnabled(on) {
      const o = !!on;
      btnSpeak.disabled = !o;
      btnSpeak.style.opacity = o ? "1" : "0.6";
      btnSpeak.style.cursor = o ? "pointer" : "not-allowed";

      // hear depends on unlock flag
      setHearEnabled(o && hearUnlocked);

      btnOk.disabled = !o;
      btnOk.style.opacity = o ? "1" : "0.6";
      btnOk.style.cursor = o ? "pointer" : "not-allowed";

      btnNg.disabled = !o;
      btnNg.style.opacity = o ? "1" : "0.6";
      btnNg.style.cursor = o ? "pointer" : "not-allowed";
    }

    // Events
    btnSpeak.addEventListener("click", () => {
      if (busy) return;
      busy = true;

      // iOS unlock (must be triggered by user gesture)
      Audio.unlockByUserGesture();

      Audio.playSpeakStart();

      // 1 second later, enable hear
      setTimeout(() => {
        hearUnlocked = true;
        setHearEnabled(true);
        busy = false;
      }, 1000);
    });

    btnHear.addEventListener("click", () => {
      if (busy) return;
      if (!hearUnlocked) return;

      busy = true;

      // Speak answer + flip
      playAnswer(word);
      flipDisplay();

      // Show judge
      answeredRevealed = true;
      judgeRow.style.display = "grid";

      busy = false;
    });

    function afterJudge(pointGained) {
      // Update points UI
      const pts = Storage.getUserPoints(userId);
      setPointsUI(pts);

      // Play point sound if gained
      if (pointGained && pointGained > 0) {
        Audio.playPoint();
      }

      // Refresh dev line
      refreshDevLine();
    }

    btnOk.addEventListener("click", () => {
      if (!answeredRevealed) return;
      if (busy) return;
      busy = true;

      const res = Storage.applyReviewResult(userId, word.id, true, Storage.todayKey());
      Audio.playCorrect();
      sparkleOn(root);

      // If it is no longer due after correct, it may disappear on refresh.
      afterJudge(res.pointGained || 0);

      busy = false;
    });

    btnNg.addEventListener("click", () => {
      if (!answeredRevealed) return;
      if (busy) return;
      busy = true;

      Storage.applyReviewResult(userId, word.id, false, Storage.todayKey());
      Audio.playWrong();

      // Wrong forces today-loop; keep card available.
      afterJudge(0);

      busy = false;
    });

    // Assemble
    main.appendChild(display);
    main.appendChild(btnRow);
    main.appendChild(judgeRow);

    root.appendChild(head);
    root.appendChild(main);

    // dev/admin line is allowed exception
    root.appendChild(devLine);
    refreshDevLine();

    return root;
  }

  // ---------- Public controller ----------
  function ensureReviewListContainer() {
    // Prefer a dedicated container if present; else create inside #viewReview
    let c = $("reviewList");
    if (c) return c;

    const view = $("viewReview");
    if (!view) throw new Error("viewReview not found");

    c = el("div");
    c.id = "reviewList";
    c.style.display = "flex";
    c.style.flexDirection = "column";
    c.style.gap = "0px";
    c.style.marginTop = "12px";

    view.appendChild(c);
    return c;
  }

  function renderReview(wordsData, userId) {
    const words = extractWords(wordsData);
    const list = ensureReviewListContainer();
    clear(list);

    // Compute due list (due <= today only)
    const ids = words.map(w => w.id);
    const dueIds = Storage.getDueWordIdsForUser(userId, ids, Storage.todayKey());

    // Update UI counters
    setDueCountUI(dueIds.length);
    setPointsUI(Storage.getUserPoints(userId));

    // Update status line if present
    const st = $("reviewStatus");
    if (st) {
      st.textContent = dueIds.length > 0 ? "いま やる ことば が あるよ" : "いま やる ことば は ないよ";
    }

    if (dueIds.length === 0) {
      const emptyCard = el("div");
      emptyCard.style.borderRadius = "18px";
      emptyCard.style.border = "1px solid rgba(255,255,255,.10)";
      emptyCard.style.background = "rgba(255,255,255,.05)";
      emptyCard.style.padding = "16px";
      emptyCard.style.opacity = "0.95";

      const t = el("div", null, "いま やる ことば は ないよ");
      t.style.fontWeight = "900";
      t.style.fontSize = "14px";
      t.style.marginBottom = "6px";

      const s = el("div", null, "また あとで みてね");
      s.style.opacity = "0.7";
      s.style.fontSize = "13px";
      s.style.fontWeight = "700";

      emptyCard.appendChild(t);
      emptyCard.appendChild(s);
      list.appendChild(emptyCard);
      return;
    }

    // Build quick lookup
    const byId = new Map(words.map(w => [w.id, w]));

    // Render cards in dueIds order (simple; can be improved later without changing spec)
    for (const wid of dueIds) {
      const w = byId.get(wid);
      if (!w) continue;

      // touch "seen" as a lightweight metric
      Storage.touchSeen(userId, wid);

      const card = buildReviewCard(w, userId);
      list.appendChild(card);
    }
  }

  async function loadWordsJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("words.json not found");
    return await res.json();
  }

  // Public init for app.js / index.html
  async function initReview(options) {
    const opts = options || {};
    const wordsUrl = opts.wordsUrl || "data/words.json";

    const userId = opts.userId || Storage.getActiveUser();

    const data = await loadWordsJson(wordsUrl);
    renderReview(data, userId);

    return {
      refresh: async () => {
        const d = await loadWordsJson(wordsUrl);
        renderReview(d, userId);
      }
    };
  }

  // Expose
  window.TapSpeakReview = {
    initReview,
    renderReview
  };
})();
