/* TapSpeak Vocab - settings.js
   Settings (spec-fixed):

   - 学習状況をすべて初期化
     初期化対象：
       ・学習回数（seen / remembered）
       ・復習状態（enrolled / stage / due）
       ・ポイント
     保持：
       ・ユーザー
       ・アバター（本モジュール外）

   - PIN:
       ・固定値（誤操作防止のみ）
       ・変更機能は今は不要
*/

(function () {
  "use strict";

  function requireGlobal(name) {
    if (!window[name]) throw new Error(`${name} is required`);
    return window[name];
  }

  const Storage = requireGlobal("TapSpeakStorage");

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

  function buildSettingsUI() {
    const view = $("viewSettings");
    if (!view) return;

    clear(view);

    const title = el("div");
    title.className = "viewTitle";
    title.textContent = "せってい";

    const note = el("div");
    note.className = "screenNote";
    note.textContent = "ほごしゃ むけ。がくしゅう じょうきょう を りせっと できます。";

    const card = el("div");
    card.className = "card";

    const h = el("h2", "card__title", "がくしゅう じょうきょう を りせっと");
    h.style.marginBottom = "8px";

    const p = el("div");
    p.className = "screenNote";
    p.textContent = "ことばの おぼえた じょうたい と ぽいんと を すべて さいしょ から に もどします。";

    const pinWrap = el("div");
    pinWrap.style.display = "flex";
    pinWrap.style.gap = "8px";
    pinWrap.style.marginTop = "10px";

    const pinInput = el("input");
    pinInput.type = "password";
    pinInput.placeholder = "PIN";
    pinInput.inputMode = "numeric";
    pinInput.style.flex = "1";
    pinInput.style.padding = "12px";
    pinInput.style.borderRadius = "10px";
    pinInput.style.border = "1px solid rgba(255,255,255,.2)";
    pinInput.style.background = "rgba(255,255,255,.06)";
    pinInput.style.color = "rgba(255,255,255,.95)";
    pinInput.style.fontSize = "14px";

    const btn = el("button");
    btn.textContent = "りせっと";
    btn.style.padding = "12px 14px";
    btn.style.borderRadius = "12px";
    btn.style.border = "none";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "900";
    btn.style.background =
      "linear-gradient(135deg, rgba(255,88,88,.92), rgba(255,164,88,.86))";
    btn.style.color = "rgba(7,11,18,.95)";

    const result = el("div");
    result.className = "screenNote";
    result.style.marginTop = "8px";

    btn.addEventListener("click", () => {
      const pin = pinInput.value || "";
      const userId = Storage.getActiveUser();
      const r = Storage.resetAllProgressForUser(userId, pin);

      if (r.ok) {
        result.textContent = "りせっと しました。";
        pinInput.value = "";
      } else {
        result.textContent = "PIN が ちがいます。";
      }
    });

    pinWrap.appendChild(pinInput);
    pinWrap.appendChild(btn);

    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(pinWrap);
    card.appendChild(result);

    view.appendChild(title);
    view.appendChild(note);
    view.appendChild(card);
  }

  function initSettings() {
    buildSettingsUI();
  }

  // Expose
  window.TapSpeakSettings = {
    initSettings
  };
})();
