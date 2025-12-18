// app.js — v1.0 updated per your spec (list view, toggle, enroll direct, stage0, labels)
(function(){
  const appEl = document.getElementById("app");
  const subTitleEl = document.getElementById("subTitle");
  const btnUserSwitch = document.getElementById("btnUserSwitch");
  const toastEl = document.getElementById("toast");

  let state = null;
  let wordsLoaded = false;

  const MODES = [
    { id:"p2w", label:"絵→単語" },
    { id:"w2p", label:"単語→絵" },
  ];

  function toast(msg){
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastEl.__t);
    toastEl.__t = setTimeout(()=>toastEl.classList.add("hidden"), 1500);
  }

  function h(html){
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function esc(s){
    return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  }

  function setSubtitle(){
    const uid = state.current_user_id;
    if(!uid){ subTitleEl.textContent = ""; return; }
    const u = state.users[uid];
    const pts = (state.points[uid]?.points ?? 0);
    subTitleEl.textContent = `${u.name} ・ポイント ${pts}`;
  }

  function ensureUserState(uid){
    if(!state.progress[uid]) state.progress[uid] = {};
    if(!state.srs[uid]) state.srs[uid] = {};
    if(!state.points[uid]) state.points[uid] = { points:0, review_said_total:0, review_said_since_last_point:0 };
    for(const m of MODES){
      if(!state.progress[uid][m.id]) state.progress[uid][m.id] = {};
      if(!state.srs[uid][m.id]) state.srs[uid][m.id] = {};
    }
  }

  // study progress: just remember toggle (no "見た/覚えた" display)
  // progress[user][mode][word_key] = { remembered:boolean }
  function getProg(uid, mode, word_key){
    ensureUserState(uid);
    return state.progress[uid][mode][word_key] || { remembered:false };
  }
  function setProg(uid, mode, word_key, v){
    ensureUserState(uid);
    state.progress[uid][mode][word_key] = v;
  }

  // srs[user][mode][word_key] = { enrolled:boolean, stage:int(0..6), due_at_ms:number }
  function getSrs(uid, mode, word_key){
    ensureUserState(uid);
    return state.srs[uid][mode][word_key] || { enrolled:false, stage:0, due_at_ms:null, last_review_ms:null };
  }
  function setSrs(uid, mode, word_key, s){
    ensureUserState(uid);
    state.srs[uid][mode][word_key] = s;
  }

  async function save(){
    await StorageLayer.saveState(state);
  }

  // ---------- Routing ----------
  async function route(screen, params={}){
    if(!wordsLoaded){
      try{
        await WordsData.loadWords();
        wordsLoaded = true;
      }catch(e){
        renderError("words.jsonが読めません", String(e));
        return;
      }
    }

    setSubtitle();

    if(screen === "user") return renderUserSelect();
    if(!state.current_user_id) return renderUserSelect();

    if(screen === "home") return renderHome();
    if(screen === "study") return renderStudy(params);
    if(screen === "review") return renderReview(params);
    if(screen === "settings") return renderSettings();
    renderHome();
  }

  function renderError(title, detail){
    appEl.innerHTML = "";
    appEl.appendChild(h(`
      <div class="card">
        <div class="h1">${esc(title)}</div>
        <div class="muted small">${esc(detail)}</div>
      </div>
    `));
  }

  // ---------- User ----------
  function svgAvatar(uid){
    const label = uid === "riona" ? "R" : "S";
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#2b3246"/>
            <stop offset="1" stop-color="#1e2230"/>
          </linearGradient>
        </defs>
        <rect width="160" height="160" rx="28" fill="url(#g)"/>
        <text x="80" y="105" text-anchor="middle" font-family="system-ui" font-size="72" fill="#7aa2ff" font-weight="900">${label}</text>
      </svg>
    `.trim();
  }

  function renderUserSelect(){
    appEl.innerHTML = "";
    btnUserSwitch.classList.add("hidden");
    subTitleEl.textContent = "";

    const wrap = h(`
      <div class="grid" style="gap:14px">
        <div class="card">
          <div class="h1">ユーザーをえらぶ</div>
          <div class="muted">りおな／そうま</div>
        </div>
        <div class="grid grid2" id="users"></div>
      </div>
    `);

    const usersEl = wrap.querySelector("#users");
    for(const uid of ["riona","soma"]){
      const u = state.users[uid];
      const pts = (state.points[uid]?.points ?? 0);
      const avatar = u.avatar_dataurl || ("data:image/svg+xml;base64,"+btoa(svgAvatar(uid)));

      const card = h(`
        <div class="card">
          <div class="row" style="align-items:center">
            <img class="avatar" src="${esc(avatar)}" alt="">
            <div style="flex:1">
              <div style="font-weight:1000;font-size:16px">${esc(u.name)}</div>
              <div class="muted small">ポイント：${pts}</div>
              <div style="margin-top:10px">
                <button class="btn primary block" data-uid="${uid}">このユーザーで入る</button>
              </div>
            </div>
          </div>
        </div>
      `);

      card.querySelector("button").addEventListener("click", async ()=>{
        state.current_user_id = uid;
        ensureUserState(uid);
        await save();
        btnUserSwitch.classList.remove("hidden");
        route("home");
      });

      usersEl.appendChild(card);
    }

    appEl.appendChild(wrap);
  }

  // ---------- Home ----------
  function countDue(uid){
    let c = 0;
    for(const m of MODES){
      const map = state.srs[uid]?.[m.id] || {};
      for(const s of Object.values(map)){
        if(SRS.isDue(s)) c++;
      }
    }
    return c;
  }

  function renderHome(){
    appEl.innerHTML = "";
    btnUserSwitch.classList.remove("hidden");
    setSubtitle();

    const uid = state.current_user_id;
    const due = countDue(uid);
    const pts = state.points[uid]?.points ?? 0;

    const wrap = h(`
      <div class="grid" style="gap:14px">
        <div class="card">
          <div class="row space">
            <div>
              <div class="h1">ホーム</div>
              <div class="muted small">単語帳／復習／設定</div>
            </div>
            <div class="pill">期限切れ ${due}</div>
          </div>
          <div class="sep"></div>
          <div class="grid grid2">
            <div class="kpi"><div class="v">${due}</div><div class="t">期限切れ</div></div>
            <div class="kpi"><div class="v">${pts}</div><div class="t">ポイント</div></div>
          </div>
        </div>

        <div class="grid grid2">
          <div class="card">
            <div class="h2">単語帳</div>
            <div class="muted small">覚える（一覧）</div>
            <div class="sep"></div>
            <button class="btn primary block" id="goStudy">単語帳へ</button>
          </div>

          <div class="card">
            <div class="h2">復習</div>
            <div class="muted small">忘れない（一覧）</div>
            <div class="sep"></div>
            <button class="btn ok block" id="goReview">復習へ</button>
          </div>

          <div class="card">
            <div class="h2">設定</div>
            <div class="muted small">バックアップ／初期化／PIN</div>
            <div class="sep"></div>
            <button class="btn block" id="goSettings">設定へ</button>
          </div>

          <div class="card">
            <div class="h2">ユーザー切り替え</div>
            <div class="muted small">最上位へ</div>
            <div class="sep"></div>
            <button class="btn ghost block" id="goUser">ユーザー選択へ</button>
          </div>
        </div>
      </div>
    `);

    wrap.querySelector("#goStudy").addEventListener("click", ()=>route("study"));
    wrap.querySelector("#goReview").addEventListener("click", ()=>route("review"));
    wrap.querySelector("#goSettings").addEventListener("click", ()=>route("settings"));
    wrap.querySelector("#goUser").addEventListener("click", async ()=>{
      state.current_user_id = null;
      await save();
      route("user");
    });

    appEl.appendChild(wrap);
  }

  // ---------- Shared: speak ----------
  function speakWordAndToggle(word, mode, isShowingWord, wordEl, imgEl){
  // ① まず表示を即切り替える（体感速度UP）
  const next = !isShowingWord;
  if(next){
    if(wordEl) wordEl.classList.remove("hidden");
    if(imgEl) imgEl.classList.add("hidden");
  }else{
    if(wordEl) wordEl.classList.add("hidden");
    if(imgEl) imgEl.classList.remove("hidden");
  }

  // ② 直前の読み上げを止める（連打対策）
  if(window.speechSynthesis){
    window.speechSynthesis.cancel();
  }

  // ③ 読み上げは非同期で開始（待たない）
  const text = TTS.getOverride(word.word_key, word.word);
  TTS.speak(text, {
    preferred_voice: state.settings.preferred_voice,
    rate: state.settings.speech_rate,
    pitch: state.settings.speech_pitch,
    volume: state.settings.speech_volume,
  });

  return next;
}


  function attachImgFallback(img, url){
    // ensure each img loads independently; if fail, keep layout but show placeholder
    img.src = url;
    img.onerror = ()=>{
      img.onerror = null;
      img.src = "data:image/svg+xml;base64," + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220">
          <rect width="100%" height="100%" rx="24" fill="#11141e"/>
          <text x="50%" y="52%" text-anchor="middle" font-family="system-ui" font-size="22" fill="#a9b1c3" font-weight="800">画像なし</text>
        </svg>
      `.trim());
    };
  }

  // ---------- Study (list) ----------
  function renderStudy(params){
    appEl.innerHTML = "";
    btnUserSwitch.classList.remove("hidden");
    setSubtitle();

    const uid = state.current_user_id;
    const game = (params.game || "stardew");
    const categories = WordsData.listCategories(game);

    const wrap = h(`
      <div class="grid" style="gap:14px">
        <div class="card">
          <div class="row space">
            <div>
              <div class="h1">単語帳</div>
              <div class="muted small">タップ：読み上げ＋画像⇄単語</div>
            </div>
            <div class="row">
              <select class="input" id="mode"></select>
              <select class="input" id="category"></select>
              <button class="btn ghost" id="back">← ホーム</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="list" id="list"></div>
        </div>
      </div>
    `);

    const modeSel = wrap.querySelector("#mode");
    for(const m of MODES){
      modeSel.appendChild(h(`<option value="${m.id}">${m.label}</option>`));
    }
    modeSel.value = params.mode || state.settings.mode_default || "p2w";

    const catSel = wrap.querySelector("#category");
    for(const c of categories){
      catSel.appendChild(h(`<option value="${esc(c.id)}">${esc(c.label)}</option>`));
    }
    catSel.value = params.category_id || (categories[0]?.id ?? "");

    const listEl = wrap.querySelector("#list");

    async function renderList(){
      const mode = modeSel.value;
      const list = WordsData.listWords(game, catSel.value);
      listEl.innerHTML = "";

      if(!list.length){
        listEl.appendChild(h(`<div class="muted">単語がありません</div>`));
        return;
      }

      for(const w of list){
        const prog = getProg(uid, mode, w.word_key);
        const isRemembered = !!prog.remembered;

        // initial display depends on mode
        const showWordInitially = (mode === "w2p"); // w2p starts with word
        let isShowingWord = showWordInitially;

        const row = h(`
          <div class="item">
            <div class="mediaBox" tabindex="0" role="button" aria-label="toggle">
              <img class="img ${showWordInitially ? "hidden":""}" alt="">
              <div class="wordBox ${showWordInitially ? "":"hidden"}">${esc(w.word)}</div>
            </div>

            <div>
              <div class="descBox">
                <div class="descTitle">説明文</div>
                <div class="descText">${esc(w.desc_lv2_en || "")}</div>
                <div class="row" style="margin-top:10px">
                  <button class="btn small" data-act="desc">🔊 説明</button>
                </div>
              </div>

              <div class="row" style="margin-top:10px">
                <button class="btn ${isRemembered ? "ng" : "ok"}" data-act="toggleRemember">
                  ${isRemembered ? "わすれた" : "おぼえた"}
                </button>
              </div>
            </div>
          </div>
        `);

        const media = row.querySelector(".mediaBox");
        const img = row.querySelector("img");
        const wordEl = row.querySelector(".wordBox");

        const imgUrl = WordsData.resolveImageUrl(w);
        attachImgFallback(img, imgUrl);

        media.addEventListener("click", async ()=>{
          isShowingWord = await speakWordAndToggle(w, mode, isShowingWord, wordEl, img);
        });

        row.querySelector('[data-act="desc"]').addEventListener("click", async ()=>{
          await TTS.speak(w.desc_lv2_en || "", {
            preferred_voice: state.settings.preferred_voice,
            rate: state.settings.speech_rate,
            pitch: state.settings.speech_pitch,
            volume: state.settings.speech_volume,
          });
        });

        row.querySelector('[data-act="toggleRemember"]').addEventListener("click", async ()=>{
          const p = getProg(uid, mode, w.word_key);
          if(!p.remembered){
            // おぼえた → remember ON + enroll now (stage0 due now)
            p.remembered = true;
            setProg(uid, mode, w.word_key, p);

            const s = getSrs(uid, mode, w.word_key);
            s.enrolled = true;
            s.stage = 0;                 // stage0 = immediate
            s.due_at_ms = SRS.dueNow();   // due now
            s.last_review_ms = null;
            setSrs(uid, mode, w.word_key, s);

            toast("復習に入れた");
          }else{
            // わすれた → remember OFF only (NO stage change in study)
            p.remembered = false;
            setProg(uid, mode, w.word_key, p);
          }
          await save();
          renderList();
        });

        listEl.appendChild(row);
      }
    }

    wrap.querySelector("#back").addEventListener("click", ()=>route("home"));
    modeSel.addEventListener("change", ()=>renderList());
    catSel.addEventListener("change", ()=>renderList());

    appEl.appendChild(wrap);
    renderList();
  }

  // ---------- Review (list) ----------
  function getDueWords(uid, mode){
    ensureUserState(uid);
    const map = state.srs[uid][mode] || {};
    const due = [];
    for(const [wk, s] of Object.entries(map)){
      if(s && s.enrolled && typeof s.due_at_ms === "number" && SRS.isDue(s)){
        due.push({ word_key:wk, srs:s });
      }
    }
    // overdue first
    due.sort((a,b)=>(a.srs.due_at_ms||0)-(b.srs.due_at_ms||0));
    return due;
  }

  function renderReview(params){
    appEl.innerHTML = "";
    btnUserSwitch.classList.remove("hidden");
    setSubtitle();

    const uid = state.current_user_id;

    const wrap = h(`
      <div class="grid" style="gap:14px">
        <div class="card">
          <div class="row space">
            <div>
              <div class="h1">復習</div>
              <div class="muted small">タップ：読み上げ＋画像⇄単語</div>
            </div>
            <div class="row">
              <select class="input" id="mode"></select>
              <button class="btn ghost" id="back">← ホーム</button>
            </div>
          </div>
          <div class="sep"></div>
          <div class="pill" id="pill"></div>
        </div>

        <div class="card">
          <div class="list" id="list"></div>
        </div>
      </div>
    `);

    const modeSel = wrap.querySelector("#mode");
    for(const m of MODES){
      modeSel.appendChild(h(`<option value="${m.id}">${m.label}</option>`));
    }
    modeSel.value = params.mode || state.settings.mode_default || "p2w";

    const listEl = wrap.querySelector("#list");
    const pillEl = wrap.querySelector("#pill");

    async function renderList(){
      const mode = modeSel.value;
      const due = getDueWords(uid, mode);
      pillEl.textContent = `期限切れ ${due.length}`;

      listEl.innerHTML = "";
      if(!due.length){
        listEl.appendChild(h(`<div class="muted">期限切れはありません</div>`));
        return;
      }

      for(const item of due){
        const w = WordsData.pickWordByKey(item.word_key, "stardew");
        if(!w){
          listEl.appendChild(h(`<div class="muted">単語データが見つかりません: ${esc(item.word_key)}</div>`));
          continue;
        }

        // initial display depends on mode (same as study)
        const showWordInitially = (mode === "w2p");
        let isShowingWord = showWordInitially;

        const stage = Number(item.srs.stage ?? 0);

        const row = h(`
          <div class="item">
            <div class="mediaBox" tabindex="0" role="button" aria-label="toggle">
              <img class="img ${showWordInitially ? "hidden":""}" alt="">
              <div class="wordBox ${showWordInitially ? "":"hidden"}">${esc(w.word)}</div>
            </div>

            <div>
              <div class="row space" style="margin-bottom:10px">
                <div class="pill">stage ${stage}</div>
                <div class="muted small">${new Date(item.srs.due_at_ms).toLocaleString()}</div>
              </div>

              <div class="descBox">
                <div class="descTitle">説明文</div>
                <div class="descText">${esc(w.desc_lv2_en || "")}</div>
                <div class="row" style="margin-top:10px">
                  <button class="btn small" data-act="desc">🔊 説明</button>
                </div>
              </div>

              <div class="row" style="margin-top:10px">
                <button class="btn ok" data-act="said">いえた</button>
                <button class="btn ng" data-act="forgot">わすれた</button>
              </div>
            </div>
          </div>
        `);

        const media = row.querySelector(".mediaBox");
        const img = row.querySelector("img");
        const wordEl = row.querySelector(".wordBox");

        const imgUrl = WordsData.resolveImageUrl(w);
        attachImgFallback(img, imgUrl);

        media.addEventListener("click", async ()=>{
          isShowingWord = await speakWordAndToggle(w, mode, isShowingWord, wordEl, img);
        });

        row.querySelector('[data-act="desc"]').addEventListener("click", async ()=>{
          await TTS.speak(w.desc_lv2_en || "", {
            preferred_voice: state.settings.preferred_voice,
            rate: state.settings.speech_rate,
            pitch: state.settings.speech_pitch,
            volume: state.settings.speech_volume,
          });
        });

        row.querySelector('[data-act="said"]').addEventListener("click", async ()=>{
          // stage up, schedule next
          const s = getSrs(uid, mode, item.word_key);
          const nextStage = SRS.advanceOnSaid(s.stage ?? 0);
          s.stage = nextStage;
          s.due_at_ms = SRS.calcNextDue(nextStage);
          s.last_review_ms = Date.now();
          setSrs(uid, mode, item.word_key, s);

          // points: +1 per 10 "いえた"
          const pt = state.points[uid];
          pt.review_said_total = (pt.review_said_total||0) + 1;
          pt.review_said_since_last_point = (pt.review_said_since_last_point||0) + 1;
          if(pt.review_said_since_last_point >= 10){
            pt.points = (pt.points||0) + 1;
            pt.review_said_since_last_point -= 10;
            toast("ポイント +1");
          }

          await save();
          setSubtitle();
          renderList();
        });

        row.querySelector('[data-act="forgot"]').addEventListener("click", async ()=>{
          // stage down by 1 (min 0), then schedule
          const s = getSrs(uid, mode, item.word_key);
          const nextStage = SRS.regressOnForgot(s.stage ?? 0);
          s.stage = nextStage;
          s.due_at_ms = SRS.calcNextDue(nextStage);
          s.last_review_ms = Date.now();
          setSrs(uid, mode, item.word_key, s);

          await save();
          setSubtitle();
          renderList();
        });

        listEl.appendChild(row);
      }
    }

    wrap.querySelector("#back").addEventListener("click", ()=>route("home"));
    modeSel.addEventListener("change", ()=>renderList());

    appEl.appendChild(wrap);
    renderList();
  }

  // ---------- Settings (add: reset learning status) ----------
  function renderSettings(){
    appEl.innerHTML = "";
    btnUserSwitch.classList.remove("hidden");
    setSubtitle();

    const uid = state.current_user_id;
    const u = state.users[uid];
    const pts = state.points[uid]?.points ?? 0;

    const wrap = h(`
      <div class="grid" style="gap:14px">
        <div class="card">
          <div class="row space">
            <div>
              <div class="h1">設定</div>
              <div class="muted small">バックアップ／初期化／PIN</div>
            </div>
            <button class="btn ghost" id="back">← ホーム</button>
          </div>
        </div>

        <div class="card">
          <div class="h2">ポイント</div>
          <div class="sep"></div>
          <div class="row space">
            <div class="pill">現在：${pts}</div>
            <button class="btn ng" id="resetPoints">ポイントリセット（PIN）</button>
          </div>
        </div>

        <div class="card">
          <div class="h2">学習状況</div>
          <div class="sep"></div>
          <div class="muted small">進捗（学習）／復習状態／ポイント を初期化（アバターは保持）</div>
          <div class="row" style="margin-top:10px">
            <button class="btn ng" id="resetAll">学習状況を全て初期化（PIN）</button>
          </div>
        </div>

        <div class="card">
          <div class="h2">バックアップ／復元</div>
          <div class="sep"></div>
          <div class="row">
            <button class="btn primary" id="backup">バックアップを書き出し（json）</button>
            <label style="margin:0">
              <span class="btn">復元（jsonを選ぶ）</span>
              <input id="restore" type="file" accept="application/json" style="display:none">
            </label>
          </div>
        </div>

        <div class="card">
          <div class="h2">PIN</div>
          <div class="sep"></div>
          <div class="muted small">初期PIN：1234</div>
          <div class="row" style="margin-top:10px">
            <input class="input" id="pinNow" type="password" placeholder="現在のPIN">
            <input class="input" id="pinNew" type="password" placeholder="新しいPIN">
            <button class="btn block" id="pinSave">PINを変更</button>
          </div>
        </div>

        <div class="card">
          <div class="h2">アバター（${esc(u.name)}）</div>
          <div class="sep"></div>
          <div class="row">
            <img class="avatar" id="avatar" src="${esc(u.avatar_dataurl || ("data:image/svg+xml;base64,"+btoa(svgAvatar(uid))))}" alt="">
            <div style="flex:1">
              <input class="input" id="avatarFile" type="file" accept="image/*">
              <div class="row" style="margin-top:10px">
                <button class="btn ghost" id="avatarClear">元に戻す</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    `);

    function checkPin(){
      const pin = prompt("PINを入力");
      return pin === String(state.settings.pin || "1234");
    }

    wrap.querySelector("#back").addEventListener("click", ()=>route("home"));

    wrap.querySelector("#resetPoints").addEventListener("click", async ()=>{
      if(!checkPin()){ toast("PINが違う"); return; }
      state.points[uid].points = 0;
      state.points[uid].review_said_total = 0;
      state.points[uid].review_said_since_last_point = 0;
      await save();
      setSubtitle();
      toast("リセット完了");
      route("settings");
    });

    wrap.querySelector("#resetAll").addEventListener("click", async ()=>{
      if(!checkPin()){ toast("PINが違う"); return; }
      // keep avatar; reset progress/srs/points for this user only
      state.progress[uid] = {};
      state.srs[uid] = {};
      state.points[uid] = { points:0, review_said_total:0, review_said_since_last_point:0 };
      // re-init mode maps
      ensureUserState(uid);
      await save();
      setSubtitle();
      toast("初期化完了");
      route("settings");
    });

    wrap.querySelector("#backup").addEventListener("click", async ()=>{
      const b = await StorageLayer.exportBackup();
      downloadJson(b, `tapspeak_backup_${new Date().toISOString().slice(0,10)}.json`);
      toast("書き出し");
    });

    wrap.querySelector("#restore").addEventListener("change", async (e)=>{
      const f = e.target.files?.[0];
      if(!f) return;
      try{
        const txt = await f.text();
        const obj = JSON.parse(txt);
        state = await StorageLayer.importBackup(obj);
        toast("復元完了");
        setSubtitle();
        route("home");
      }catch(err){
        toast("復元失敗");
      }
      e.target.value = "";
    });

    wrap.querySelector("#pinSave").addEventListener("click", async ()=>{
      const nowPin = wrap.querySelector("#pinNow").value;
      const newPin = wrap.querySelector("#pinNew").value;
      if(String(nowPin) !== String(state.settings.pin||"1234")){
        toast("現在PINが違う");
        return;
      }
      if(!newPin || String(newPin).length < 3){
        toast("新PINが短い");
        return;
      }
      state.settings.pin = String(newPin);
      await save();
      toast("PIN変更");
      wrap.querySelector("#pinNow").value = "";
      wrap.querySelector("#pinNew").value = "";
    });

    wrap.querySelector("#avatarFile").addEventListener("change", async (e)=>{
      const f = e.target.files?.[0];
      if(!f) return;
      const dataUrl = await fileToDataUrl(f);
      state.users[uid].avatar_dataurl = dataUrl;
      await save();
      toast("保存");
      route("settings");
    });

    wrap.querySelector("#avatarClear").addEventListener("click", async ()=>{
      state.users[uid].avatar_dataurl = null;
      await save();
      toast("元に戻した");
      route("settings");
    });

    appEl.appendChild(wrap);
  }

  function downloadJson(obj, filename){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  }

  function fileToDataUrl(file){
    return new Promise((resolve, reject)=>{
      const r = new FileReader();
      r.onerror = ()=>reject(r.error);
      r.onload = ()=>resolve(r.result);
      r.readAsDataURL(file);
    });
  }

  // ---------- Init ----------
  async function init(){
    state = await StorageLayer.loadState();

    // ensure required top-level
    state.users = state.users || {
      riona:{id:"riona",name:"りおな",avatar_dataurl:null},
      soma:{id:"soma",name:"そうま",avatar_dataurl:null}
    };
    state.settings = state.settings || StorageLayer.defaultState().settings;
    state.progress = state.progress || {};
    state.srs = state.srs || {};
    state.points = state.points || {};

    // ensure both users exist
    if(!state.users.riona) state.users.riona = {id:"riona",name:"りおな",avatar_dataurl:null};
    if(!state.users.soma) state.users.soma = {id:"soma",name:"そうま",avatar_dataurl:null};

    await save();

    btnUserSwitch.addEventListener("click", async ()=>{
      state.current_user_id = null;
      await save();
      route("user");
    });

    if(state.current_user_id) btnUserSwitch.classList.remove("hidden");
    else btnUserSwitch.classList.add("hidden");

    route(state.current_user_id ? "home" : "user");
  }

  init();
})();
