/* TapSpeak Vocab - words.js (Complete)
   単語モード（一覧スクロール）

   words.json の形式（ユーザー提示）に対応：
   {
     game: "stardew",
     category_id: "01_tools",
     category_label_ja: "道具",
     category_label_kana: "どうぐ",
     word: "Auto-Grabber",
     word_key: "auto_grabber",
     desc_lv2: "...",
     image_file: "Auto-Grabber.png",
     sort_order: 700,
     enabled: true
   }

   画像パス：assets/games/{game}/{category_id}/{image_file}
   例：assets/games/stardew/01_tools/Auto-Grabber.png

   仕様：
   - 画像 or 単語のみ表示（併記禁止）
   - タップで切替（画像⇄単語）＋読み上げ（TTS）
   - 「おぼえた」→ Enroll（stage=0,due=today）
   - 「わすれた」→ stageは変更しない（Enroll解除もしない：仕様にないため）
*/

(function () {
  "use strict";

  if (window.TapSpeakWords) return;

  const Storage = window.TapSpeakStorage;
  const Audio = window.TapSpeakAudio;

  const WORDS_URL = "data/words.json";

  let _root = null;
  let _userId = null;
  let _words = [];

  // ---------- helpers ----------
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function buildImagePath(w) {
    if (!w || !w.game || !w.category_id || !w.image_file) return "";
    return `assets/games/${w.game}/${w.category_id}/${w.image_file}`;
  }

  async function loadWords() {
    const res = await fetch(WORDS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("words.json load failed");
    const json = await res.json();
    const arr = Array.isArray(json) ? json : (Array.isArray(json.words) ? json.words : []);
    return arr;
  }

  function normalizeWords(arr) {
    return (arr || [])
      .filter(w => w && w.enabled !== false)
      .slice()
      .sort((a, b) => (Number(a.sort_order || 0) - Number(b.sort_order || 0)));
  }

  // ---------- UI style (minimal, self-contained) ----------
  function ensureStyles() {
    if (document.getElementById("wordsStyles")) return;

    const style = document.createElement("style");
    style.id = "wordsStyles";
    style.textContent = `
      .wordList{ display:flex; flex-direction:column; gap:14px; }
      .wordCard{
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 16px;
        padding: 14px;
      }
      .wordMain{
        display:flex;
        align-items:center;
        justify-content:center;
        min-height: 150px;
        border-radius: 14px;
        background: rgba(0,0,0,.12);
        margin-bottom: 10px;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .wordImage{
        max-width: 100%;
        max-height: 210px;
        object-fit: contain;
        border-radius: 12px;
      }
      .wordText{
        font-size: 26px;
        font-weight: 900;
        letter-spacing: .2px;
        text-align:center;
        padding: 18px 10px;
      }
      .wordDesc{
        font-size: 14px;
        line-height: 1.5;
        opacity: .92;
        margin: 6px 2px 12px;
      }
      .wordButtons{
        display:flex;
        gap:10px;
      }
      .btnRemember,.btnForget{
        flex: 1;
        font-size: 18px;
        font-weight: 900;
        padding: 14px;
        border-radius: 14px;
        border: none;
        cursor: pointer;
      }
      .btnRemember{ background: rgba(59,108,255,.92); color:#fff; }
      .btnForget{ background: rgba(255,255,255,.10); color:#fff; border:1px solid rgba(255,255,255,.14); }
      .btnRemember:disabled{ opacity:.45; cursor: default; }
    `;
    document.head.appendChild(style);
  }

  // ---------- render ----------
  function renderCard(w) {
    const card = el("div", "wordCard");

    let showing = "image"; // "image" | "word"

    const main = el("div", "wordMain");
    const desc = el("div", "wordDesc", w.desc_lv2 || "");

    function renderMain() {
      clear(main);

      if (showing === "image") {
        const src = buildImagePath(w);
        const img = document.createElement("img");
        img.className = "wordImage";
        img.alt = w.word || "";
        img.src = src || ""; // 空なら何も出さない（undefinedを防ぐ）
        main.appendChild(img);
      } else {
        main.appendChild(el("div", "wordText", w.word || ""));
      }
    }

    main.addEventListener("click", () => {
      showing = (showing === "image") ? "word" : "image";
      renderMain();

      // 読み上げ：データにaudioが無いのでTTSで読む（仕様に反しない）
      Audio.speakText(w.word || "", "en-US");
    });

    renderMain();

    const btnRow = el("div", "wordButtons");

    const btnRemember = el("button", "btnRemember", "おぼえた");
    const btnForget = el("button", "btnForget", "わすれた");

    // 既にEnroll済みならボタン状態を反映（Storageに関数があれば使う）
    const id = w.word_key; // 仕様：内部IDはword_keyを採用
    let enrolled = false;
    try {
      if (typeof Storage.isEnrolled === "function") {
        enrolled = !!Storage.isEnrolled(_userId, id);
      }
    } catch (_) {}

    if (enrolled) btnRemember.disabled = true;

    btnRemember.addEventListener("click", () => {
      // Enroll：stage=0, due=today（Storage側で実装されている想定）
      Storage.enrollWord(_userId, id);
      btnRemember.disabled = true;
    });

    btnForget.addEventListener("click", () => {
      // 単語モードで「わすれた」を押しても stage は変更しない（＝何もしない）
      // ただし「もう一回覚えたに戻す」ため、UI上だけ押せる状態にする
      btnRemember.disabled = false;
    });

    btnRow.appendChild(btnRemember);
    btnRow.appendChild(btnForget);

    card.appendChild(main);
    card.appendChild(desc);
    card.appendChild(btnRow);

    return card;
  }

  function renderList() {
    clear(_root);
    const list = el("div", "wordList");
    _words.forEach(w => list.appendChild(renderCard(w)));
    _root.appendChild(list);
  }

  // ---------- public ----------
  async function initWords({ userId, rootId }) {
    ensureStyles();

    _userId = userId;
    _root = document.getElementById(rootId || "wordsRoot");
    if (!_root) throw new Error("wordsRoot not found");

    const raw = await loadWords();
    _words = normalizeWords(raw);

    renderList();

    return {
      refresh() {
        renderList();
      }
    };
  }

  window.TapSpeakWords = { initWords };
})();
