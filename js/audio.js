/* TapSpeak Vocab - audio.js
   Purpose:
   - Centralized audio management
   - iOS/Safari reliable playback
   - No overlapping sounds
   - UI sounds only (no reveal sound)

   Managed sounds:
   - speak_start.mp3
   - correct.mp3
   - wrong.mp3
   - point.mp3
*/

(function () {
  "use strict";

  const UI_SOUNDS = {
    speak: "assets/sounds/ui/speak_start.mp3",
    correct: "assets/sounds/ui/correct.mp3",
    wrong: "assets/sounds/ui/wrong.mp3",
    point: "assets/sounds/ui/point.mp3"
  };

  const _players = {};
  let _unlocked = false;

  /* --------------------------------------------------
     iOS unlock
     Must be called once by a user gesture
  -------------------------------------------------- */
  function unlockByUserGesture() {
    if (_unlocked) return;

    Object.keys(UI_SOUNDS).forEach(key => {
      const audio = new Audio(UI_SOUNDS[key]);
      audio.preload = "auto";
      audio.muted = true;

      // play & pause immediately to unlock
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      }).catch(() => {
        // ignore (Safari sometimes blocks silently)
        audio.muted = false;
      });

      _players[key] = audio;
    });

    _unlocked = true;
  }

  /* --------------------------------------------------
     Internal helper
  -------------------------------------------------- */
  function stop(audio) {
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (e) {}
  }

  function playOnce(key) {
    if (!_unlocked) return;

    const audio = _players[key];
    if (!audio) return;

    // Do not overlap
    stop(audio);

    try {
      audio.currentTime = 0;
      audio.play();
    } catch (e) {
      // Safari may still block; ignore
    }
  }

  /* --------------------------------------------------
     Public API
  -------------------------------------------------- */
  function playSpeakStart() {
    playOnce("speak");
  }

  function playCorrect() {
    playOnce("correct");
  }

  function playWrong() {
    playOnce("wrong");
  }

  function playPoint() {
    playOnce("point");
  }

  /* --------------------------------------------------
     Word audio (per-word mp3)
     - Single-use Audio object
     - Stops previous word sound
  -------------------------------------------------- */
  let _wordAudio = null;

  function playWord(src) {
    if (!src) return;

    if (_wordAudio) {
      stop(_wordAudio);
      _wordAudio = null;
    }

    const audio = new Audio(src);
    audio.preload = "auto";
    _wordAudio = audio;

    try {
      audio.play();
    } catch (e) {
      // ignore
    }
  }

  /* --------------------------------------------------
     Expose
  -------------------------------------------------- */
  window.TapSpeakAudio = {
    unlockByUserGesture,

    playSpeakStart,
    playCorrect,
    playWrong,
    playPoint,

    playWord
  };
})();
