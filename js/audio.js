/* TapSpeak Vocab - audio.js (Complete)
   - UI効果音：assets/sounds/ui/*.mp3
   - TTS：SpeechSynthesis（iOS Safari対応：ユーザー操作でunlock）
   - 音は重ね再生しない（UI音は1本、TTSもcancelしてから）
*/

(function () {
  "use strict";

  if (window.TapSpeakAudio) return;

  const UI_BASE = "assets/sounds/ui/";

  // 仕様で確定しているUI音
  const UI_SOUNDS = {
    speak_start: UI_BASE + "speak_start.mp3",
    correct: UI_BASE + "correct.mp3",
    wrong: UI_BASE + "wrong.mp3",
    point: UI_BASE + "point.mp3"
  };

  // UI音は1つだけ使い回して「重ねない」
  const uiAudio = new Audio();
  uiAudio.preload = "auto";

  let unlocked = false;

  function _safePlay(audioEl) {
    // iOSで play() がPromiseを返し失敗することがあるので握りつぶす
    try {
      const p = audioEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }

  function unlockByUserGesture() {
    if (unlocked) return;
    unlocked = true;

    // iOS向け：無音に近い再生で「オーディオ許可」を得る
    // （実際はsrcなしでも play() が失敗することがあるため、短い操作を行う）
    try {
      uiAudio.pause();
      uiAudio.currentTime = 0;
      uiAudio.src = UI_SOUNDS.speak_start; // 既存の短い音を利用
      uiAudio.volume = 0.0001;
      _safePlay(uiAudio);
      // すぐ戻す
      setTimeout(() => {
        try {
          uiAudio.pause();
          uiAudio.currentTime = 0;
          uiAudio.volume = 1;
        } catch (_) {}
      }, 50);
    } catch (_) {}
  }

  function playUI(key) {
    const src = UI_SOUNDS[key];
    if (!src) return;

    try {
      // 重ね再生禁止：必ず停止して差し替え
      uiAudio.pause();
      uiAudio.currentTime = 0;
      uiAudio.src = src;
      uiAudio.volume = 1;
      _safePlay(uiAudio);
    } catch (_) {}
  }

  function speakText(text, lang = "en-US") {
    const t = String(text || "").trim();
    if (!t) return;

    // 重ねない
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}

    // iOS Safariは音声が出ないことがあるので、できる範囲で安全に
    try {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = lang;
      u.rate = 0.95;
      u.pitch = 1.0;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  // Public API
  window.TapSpeakAudio = {
    unlockByUserGesture,
    playUI,
    speakText
  };
})();
