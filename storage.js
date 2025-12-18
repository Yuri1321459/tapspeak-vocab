// storage.js (IndexedDB with localStorage fallback) — single-state JSON
(function(){
  const DB_NAME = "tapspeak_vocab";
  const DB_VERSION = 1;
  const STORE = "kv";
  const KEY = "state_v1";

  function nowIso(){ return new Date().toISOString(); }

  function defaultState(){
    return {
      meta: { version: 1, created_at: nowIso(), updated_at: nowIso() },
      settings: {
        enroll_threshold: 3,              // 「覚えた」何回でEnroll確認
        pin: "1234",                      // 家庭用PIN（設定画面で変更可能）
        preferred_voice: "auto",          // auto / specific name
        speech_rate: 0.95,
        speech_pitch: 1.0,
        speech_volume: 1.0,
        mode_default: "p2w",              // p2w / w2p
      },
      users: {
        riona: { id:"riona", name:"りおな", avatar_dataurl:null },
        soma:  { id:"soma",  name:"そうま", avatar_dataurl:null },
      },
      current_user_id: null,
      // progress[userId][mode][wordKey] = { seen:int, remembered:int, last_at:iso }
      progress: {},
      // srs[userId][mode][wordKey] = { enrolled:true, stage:int(0..6), due_at_ms:number, last_review_ms:number }
      srs: {},
      // points[userId] = { points:int, review_correct_total:int, review_correct_since_last_point:int }
      points: {},
      // review session (ephemeral)
      last_opened_at: null,
    };
  }

  function deepClone(x){ return JSON.parse(JSON.stringify(x)); }

  let _dbp = null;

  function openDB(){
    if(_dbp) return _dbp;
    _dbp = new Promise((resolve, reject)=>{
      if(!("indexedDB" in window)) return reject(new Error("indexedDB not supported"));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = ()=>reject(req.error);
      req.onupgradeneeded = ()=>{
        const db = req.result;
        if(!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = ()=>resolve(req.result);
    });
    return _dbp;
  }

  async function idbGet(key){
    const db = await openDB();
    return await new Promise((resolve, reject)=>{
      const tx = db.transaction(STORE, "readonly");
      const st = tx.objectStore(STORE);
      const req = st.get(key);
      req.onerror = ()=>reject(req.error);
      req.onsuccess = ()=>resolve(req.result);
    });
  }

  async function idbSet(key, val){
    const db = await openDB();
    return await new Promise((resolve, reject)=>{
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      const req = st.put(val, key);
      req.onerror = ()=>reject(req.error);
      req.onsuccess = ()=>resolve(true);
    });
  }

  function lsGet(){
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    try{ return JSON.parse(raw); }catch(e){ return null; }
  }
  function lsSet(val){
    localStorage.setItem(KEY, JSON.stringify(val));
    return true;
  }

  async function loadState(){
    // try idb, fallback localStorage
    try{
      const v = await idbGet(KEY);
      if(v) return v;
    }catch(e){}
    const v2 = lsGet();
    if(v2) return v2;

    const st = defaultState();
    await saveState(st);
    return st;
  }

  async function saveState(state){
    state.meta = state.meta || {};
    state.meta.updated_at = nowIso();
    try{
      await idbSet(KEY, state);
    }catch(e){
      lsSet(state);
    }
  }

  async function resetAll(){
    const st = defaultState();
    await saveState(st);
    return st;
  }

  async function exportBackup(){
    const st = await loadState();
    return {
      backup_version: 1,
      exported_at: nowIso(),
      state: deepClone(st),
    };
  }

  async function importBackup(obj){
    if(!obj || typeof obj !== "object") throw new Error("invalid backup");
    const st = obj.state;
    if(!st || typeof st !== "object") throw new Error("invalid backup.state");
    // minimal sanity
    if(!st.users || !st.settings) throw new Error("backup missing fields");
    st.meta = st.meta || {};
    st.meta.updated_at = nowIso();
    await saveState(st);
    return st;
  }

  window.StorageLayer = {
    loadState, saveState, resetAll,
    exportBackup, importBackup,
    defaultState
  };
})();
