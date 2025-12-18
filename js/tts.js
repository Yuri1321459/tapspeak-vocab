// tts.js — iOS-friendly SpeechSynthesis
(function(){
  const EXCEPTIONS = {
    // word_key : pronunciation override
    "hoe": "hoh",
  };

  function getOverride(word_key, word){
    const k = (word_key || "").toLowerCase();
    return EXCEPTIONS[k] || word;
  }

  function voicesReady(){
    return new Promise((resolve)=>{
      let tries = 0;
      function tick(){
        const v = speechSynthesis.getVoices();
        if(v && v.length) return resolve(v);
        tries++;
        if(tries > 30) return resolve([]);
        setTimeout(tick, 100);
      }
      tick();
    });
  }

  function pickVoice(voices, preferred){
    if(!voices || !voices.length) return null;
    if(preferred && preferred !== "auto"){
      const m = voices.find(v=>v.name === preferred);
      if(m) return m;
    }
    // iOS natural voice
    const samantha = voices.find(v=>/Samantha/i.test(v.name) && /^en(-|_)US/i.test(v.lang));
    if(samantha) return samantha;

    // any en-US
    const enus = voices.find(v=>/^en(-|_)US/i.test(v.lang));
    if(enus) return enus;

    // any English
    const en = voices.find(v=>/^en/i.test(v.lang));
    if(en) return en;

    return voices[0];
  }

  async function speak(text, opts){
    if(!("speechSynthesis" in window)) return false;
    const t = String(text||"").trim();
    if(!t) return false;

    // cancel any ongoing speech to avoid overlap
    try{ speechSynthesis.cancel(); }catch(e){}

    const voices = await voicesReady();
    const u = new SpeechSynthesisUtterance(t);
    const voice = pickVoice(voices, opts?.preferred_voice || "auto");
    if(voice) u.voice = voice;

    u.lang = voice?.lang || "en-US";
    u.rate = Number(opts?.rate ?? 0.95);
    u.pitch = Number(opts?.pitch ?? 1.0);
    u.volume = Number(opts?.volume ?? 1.0);

    return await new Promise((resolve)=>{
      u.onend = ()=>resolve(true);
      u.onerror = ()=>resolve(false);
      speechSynthesis.speak(u);
    });
  }

  window.TTS = { speak, getOverride };
})();
