/* TapSpeak Vocab - words.js
   単語モード専用

   役割：
   - words.json を読み込む
   - 単語一覧を表示（カード一覧・スクロール）
   - 画像 ⇄ 単語 切替
   - 読み上げ
   - 「おぼえた / わすれた」
   - Enroll（復習入り）を Storage に登録

   注意：
   - stage を直接いじらない（Enroll 時のみ stage=0）
   - 「わすれた」は stage/due を変更しない
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

  /* --------------------------------------------------
     util
  -------------------------------------------------- */
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  async function loadWords() {
    const res = await fetch(WORDS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("words.json load failed");
    const json = await res.json();
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.words)) return json.words;
    return [];
  }

  /* --------------------------------------------------
     card rendering
  -------------------------------------------------- */
  function renderCard(word) {
    const card = el("div", "wordCard");

    let showing = "image"; // image | word

    const main = el("div", "wordMain");
    const sub = el("div", "wordSub", word.desc_ja || "");

    function renderMain() {
      clear(main);

      if (showing === "image") {
        const img = document.createElement("img");
        img.src = word.image;
        img.alt = word.word;
        img.className = "wordImage";
        main.appendChild(img);
      } else {
        const txt = el("div", "wordText", word.word);
        main.appendChild(txt);
      }
    }

    main.addEventListener("click", () => {
      showing = showing === "image" ? "word" : "image";
      renderMain();
      if (word.audio) {
        Audio.playWord(word.audio);
      }
    });

    renderMain();

    const btnRow = el("div", "wordButtons");

    const btnRemember = el("button", "btnRemember", "おぼえた");
    const btnForget = el("button", "btnForget", "わすれた");

    btnRemember.addEventListener("click", () => {
      Storage.enrollWord(_userId, word.id);
      btnRemember.disabled = true;
      btnForget.disabled = false;
    });

    btnForget.addEventListener("click", () => {
      // 単語モードでは stage/due を変更しない
      btnRemember.disabled = false;
    });

    btnRow.appendChild(btnRemember);
    btnRow.appendChild(btnForget);

    card.appendChild(main);
    card.appendChild(sub);
    card.appendChild(btnRow);

    return card;
  }

  /* --------------------------------------------------
     render list
  -------------------------------------------------- */
  function renderList() {
    clear(_root);

    _words.forEach(word => {
      const card = renderCard(word);
      _root.appendChild(card);
    });
  }

  /* --------------------------------------------------
     public init
  -------------------------------------------------- */
  async function initWords({ userId, rootId }) {
    _userId = userId;
    _root = document.getElementById(rootId || "wordsRoot");
    if (!_root) throw new Error("wordsRoot not found");

    _words = await loadWords();
    renderList();

    return {
      refresh() {
        renderList();
      }
    };
  }

  window.TapSpeakWords = {
    initWords
  };
})();
