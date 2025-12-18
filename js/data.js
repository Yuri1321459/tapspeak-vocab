// data.js — load words.json and resolve image URL (safe encode)
(function(){
  let _words = [];
  let _byGame = new Map();      // game -> words[]
  let _byGameCat = new Map();   // "game|cat" -> words[]
  let _byWordKey = new Map();   // word_key -> words[] (across games)
  let _catsByGame = new Map();  // game -> [{id,label}]

  async function loadWords(){
    const res = await fetch("./data/words.json", { cache: "no-store" });
    if(!res.ok) throw new Error("failed to load data/words.json");
    const json = await res.json();
    const words = json.words || [];
    _words = words;

    _byGame = new Map();
    _byGameCat = new Map();
    _byWordKey = new Map();
    _catsByGame = new Map();

    for(const w of words){
      const game = String(w.game||"").trim();
      const cat = String(w.category_id||"").trim();
      const wk = String(w.word_key||"").trim();

      if(!_byGame.has(game)) _byGame.set(game, []);
      _byGame.get(game).push(w);

      const gk = `${game}|${cat}`;
      if(!_byGameCat.has(gk)) _byGameCat.set(gk, []);
      _byGameCat.get(gk).push(w);

      if(!_byWordKey.has(wk)) _byWordKey.set(wk, []);
      _byWordKey.get(wk).push(w);
    }

    // category list per game
    for(const [game, arr] of _byGame.entries()){
      const seen = new Map();
      for(const w of arr){
        const id = String(w.category_id||"");
        if(!seen.has(id)) seen.set(id, w.category_label_ja || id);
      }
      const cats = Array.from(seen.entries()).map(([id,label])=>({id,label}))
        .sort((a,b)=>a.id.localeCompare(b.id));
      _catsByGame.set(game, cats);
    }

    // sort each category list
    for(const [k,arr] of _byGameCat.entries()){
      arr.sort((a,b)=>{
        const sa = String(a.sort_order||"");
        const sb = String(b.sort_order||"");
        if(sa !== sb) return sa.localeCompare(sb);
        return String(a.word||"").localeCompare(String(b.word||""));
      });
    }

    return _words;
  }

  function listGames(){ return Array.from(_byGame.keys()).sort(); }

  function listCategories(game){
    return (_catsByGame.get(game) || []).slice();
  }

  function listWords(game, category_id){
    return (_byGameCat.get(`${game}|${category_id}`) || []).slice();
  }

  function pickWordByKey(word_key, preferGame="stardew"){
    const arr = _byWordKey.get(word_key) || [];
    if(!arr.length) return null;
    const preferred = arr.find(w=>w.game === preferGame);
    return preferred || arr[0];
  }

  function resolveImageUrl(word){
    const g = encodeURIComponent(String(word.game||""));
    const c = encodeURIComponent(String(word.category_id||""));
    // image_file may contain spaces; encode only the filename portion
    const f = encodeURIComponent(String(word.image_file||""));
    return `./assets/games/${g}/${c}/${f}`;
  }

  window.WordsData = {
    loadWords,
    listGames, listCategories, listWords,
    pickWordByKey,
    resolveImageUrl
  };
})();
