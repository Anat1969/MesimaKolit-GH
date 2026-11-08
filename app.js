(function () {
  'use strict';
  var SB_URL = 'https://ktqmwpbzcnzkhjskqisy.supabase.co';
  var SB_KEY = 'sb_publishable_IkreG7naPa1h-d4kGp1gpA_sLU4tg5q';
  var TABLE = 'vt_tasks';
  var STORE = 'voice-task-app-v2';
  var OLD_STORE = 'voice-task-app-v1';
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    record: $('record'), recTitle: $('rec-title'), timer: $('timer'), live: $('live'), liveK: $('live-k'),
    platform: $('platform'), tasks: $('tasks'), listTitle: $('list-title'), listCount: $('list-count'),
    nOpen: $('n-open'), nDone: $('n-done'), fOpen: $('f-open'), fDone: $('f-done'),
    write: $('t-write'), sync: $('t-sync'), syncDot: $('sync-dot'), syncLbl: $('sync-lbl'),
    dock: $('dock'), quick: $('quick'), saved: $('saved'), toast: $('toast'),
    sheet: $('sheet'), google: $('google'), magic: $('magic'), email: $('email'), sheetMsg: $('sheet-msg'), sheetClose: $('sheet-close')
  };

  var state = {
    tasks: [], view: 'open', recording: false, rec: null, seconds: 0, tick: null,
    final: '', interim: '', sb: null, user: null, freshId: null
  };

  /* ---------- אחסון ---------- */
  function loadLocal() {
    try {
      var raw = localStorage.getItem(STORE) || localStorage.getItem(OLD_STORE) || '{}';
      var data = JSON.parse(raw);
      state.tasks = (Array.isArray(data.tasks) ? data.tasks : []).map(normalize).filter(Boolean);
    } catch (e) { state.tasks = []; }
  }
  function saveLocal() {
    try { localStorage.setItem(STORE, JSON.stringify({ tasks: state.tasks })); } catch (e) {}
  }
  function normalize(t) {
    if (!t || !t.title) return null;
    return {
      id: String(t.id), title: String(t.title).slice(0, 300), transcript: t.transcript ? String(t.transcript).slice(0, 5000) : null,
      status: t.status === 'done' ? 'done' : 'open', createdAt: t.createdAt || t.created_at || new Date().toISOString(),
      completedAt: t.completedAt || t.completed_at || null
    };
  }
  function toRow(t) {
    return { id: t.id, title: t.title, transcript: t.transcript, status: t.status, created_at: t.createdAt, completed_at: t.completedAt, updated_at: new Date().toISOString() };
  }
  function flashSaved(text) {
    els.saved.textContent = text;
    els.saved.style.opacity = 1;
    clearTimeout(flashSaved.t);
    flashSaved.t = setTimeout(function () { els.saved.style.opacity = 0; }, 1800);
  }
  function persist(task) {
    saveLocal();
    if (!state.sb || !state.user) { flashSaved('נשמר במכשיר'); return; }
    state.sb.from(TABLE).upsert(task ? [toRow(task)] : state.tasks.map(toRow)).then(function (r) {
      flashSaved(r.error ? 'נשמר במכשיר, הסנכרון ייכשל עד חיבור' : 'נשמר');
    });
  }

  /* ---------- סנכרון ---------- */
  function initSupabase() {
    if (!window.supabase || !window.supabase.createClient) { setSyncUi(); return; }
    state.sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    state.sb.auth.onAuthStateChange(function (_e, session) {
      var u = session ? session.user : null;
      var changed = (u && u.id) !== (state.user && state.user.id);
      state.user = u;
      setSyncUi();
      if (changed && u) pullAndMerge();
    });
    fetch(SB_URL + '/auth/v1/settings', { headers: { apikey: SB_KEY } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) { if (s && s.external && s.external.google) els.google.hidden = false; })
      .catch(function () {});
  }
  function pullAndMerge() {
    state.sb.from(TABLE).select('*').order('created_at', { ascending: false }).then(function (r) {
      if (r.error) { toast('לא הצלחתי לטעון מהענן. העבודה נמשכת במכשיר.'); return; }
      var remote = r.data.map(normalize).filter(Boolean);
      var ids = {};
      remote.forEach(function (t) { ids[t.id] = true; });
      var localOnly = state.tasks.filter(function (t) { return !ids[t.id]; });
      state.tasks = localOnly.concat(remote).sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; });
      saveLocal();
      render();
      if (localOnly.length) {
        state.sb.from(TABLE).upsert(localOnly.map(toRow)).then(function (u) {
          if (!u.error) toast(localOnly.length + ' משימות מהמכשיר עלו לענן.');
        });
      }
    });
  }
  function setSyncUi() {
    var on = !!state.user;
    els.syncDot.hidden = !on;
    els.syncLbl.textContent = on ? 'מסונכרן' : 'במכשיר';
    els.sync.setAttribute('aria-label', on ? 'מסונכרן: ' + (state.user.email || '') : 'סנכרון בין מכשירים');
    updateMenu();
  }
  function updateMenu() {
    var menu = document.querySelector('ai-menu');
    if (!menu) return;
    try {
      menu.items = state.user
        ? [{ label: 'יציאה (' + (state.user.email || '') + ')', onSelect: signOut }]
        : [{ label: 'כניסה וסנכרון', onSelect: openSheet }];
    } catch (e) {}
  }
  function openSheet() {
    if (state.user) {
      if (confirm('מחוברת בתור ' + (state.user.email || '') + '. לצאת?')) signOut();
      return;
    }
    if (!state.sb) { toast('שירות הסנכרון לא נטען. בדקי חיבור לרשת.'); return; }
    els.sheetMsg.textContent = '';
    els.sheet.hidden = false;
    setTimeout(function () { els.email.focus(); }, 50);
  }
  function closeSheet() { els.sheet.hidden = true; }
  function signOut() {
    if (!state.sb) return;
    state.sb.auth.signOut().then(function () { toast('יצאת. המשימות נשארות במכשיר.'); });
  }

  /* ---------- הקלטה ---------- */
  function platformNote() {
    var ua = navigator.userAgent || '';
    var ios = /iPhone|iPad|iPod/i.test(ua);
    var secure = window.isSecureContext;
    if (!secure) return 'הקלטה דורשת קישור HTTPS';
    if (!Rec) return ios ? 'באייפון: הקלטה ב-Safari מעודכן, או כתיבה במעגן' : 'הדפדפן לא מתמלל. Chrome או Edge, או כתיבה במעגן';
    return 'עברית, תמלול חי';
  }
  function startRecording() {
    if (!Rec) { toast(platformNote()); els.quick.focus(); return; }
    var r = new Rec();
    r.lang = 'he-IL'; r.continuous = true; r.interimResults = true;
    state.final = ''; state.interim = ''; state.seconds = 0;
    r.onresult = function (ev) {
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var txt = ev.results[i][0].transcript.trim();
        if (ev.results[i].isFinal) state.final += txt + ' '; else interim += txt + ' ';
      }
      state.interim = interim.trim();
      showLive(transcript() || 'מקשיבה...');
    };
    r.onerror = function (ev) { onRecError(ev.error); };
    r.onend = function () { if (state.recording && state.rec === r) { try { r.start(); } catch (e) { stopRecording(true); } } };
    try { r.start(); } catch (e) { toast('לא ניתן להתחיל הקלטה כרגע.'); return; }
    state.rec = r; state.recording = true;
    els.record.classList.add('on');
    els.record.setAttribute('aria-label', 'עצירה ויצירת משימה');
    els.recTitle.textContent = 'מקשיבה. לחיצה עוצרת';
    els.liveK.textContent = 'תמלול חי';
    els.timer.textContent = '00:00';
    showLive('מקשיבה...');
    state.tick = setInterval(function () {
      state.seconds++;
      els.timer.textContent = String(Math.floor(state.seconds / 60)).padStart(2, '0') + ':' + String(state.seconds % 60).padStart(2, '0');
    }, 1000);
  }
  function stopRecording(create) {
    var r = state.rec;
    state.recording = false; state.rec = null;
    if (r) { r.onresult = null; r.onerror = null; r.onend = null; try { r.stop(); } catch (e) {} }
    clearInterval(state.tick); state.tick = null;
    els.record.classList.remove('on');
    els.record.setAttribute('aria-label', 'התחלת הקלטה');
    els.recTitle.textContent = 'לחצי ודברי';
    els.liveK.textContent = 'תמלול';
    if (create) {
      var t = transcript();
      if (!t) { showLive('לא נקלט דיבור. נסי שוב, קרוב יותר למיקרופון.'); return; }
      addTask(t, t);
    }
  }
  function onRecError(code) {
    if (code === 'no-speech') { els.recTitle.textContent = 'לא שומעת. אפשר להמשיך לדבר'; return; }
    var msg = {
      'not-allowed': 'המיקרופון חסום. מאשרים אותו בהגדרות האתר בדפדפן.',
      'service-not-allowed': 'שירות התמלול חסום בדפדפן הזה. נסי Chrome.',
      'audio-capture': 'לא נמצא מיקרופון פעיל.',
      'network': 'שירות התמלול לא זמין. בדקי חיבור.',
      'aborted': 'ההקלטה הופסקה.'
    }[code] || ('שגיאת הקלטה: ' + code);
    stopRecording(false);
    showLive(msg);
    toast(msg);
  }
  function transcript() { return (state.final + ' ' + state.interim).replace(/\s+/g, ' ').trim(); }
  function showLive(text) {
    els.live.textContent = text;
    els.live.classList.toggle('has', !!transcript());
  }

  /* ---------- משימות ---------- */
  var PREFIXES = ['אני צריכה ', 'אני צריך ', 'תזכירי לי ', 'תזכיר לי ', 'צריך ', 'צריכה ', 'לזכור ', 'משימה ', 'משימה: '];
  function extractTitle(text) {
    var s = text.replace(/\s+/g, ' ').trim();
    for (var i = 0; i < PREFIXES.length; i++) {
      if (s.indexOf(PREFIXES[i]) === 0) { s = s.slice(PREFIXES[i].length).trim(); break; }
    }
    var first = s.split(/[.!?؟\n]/).map(function (p) { return p.trim(); }).filter(Boolean)[0] || s;
    first = first.slice(0, 120);
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function addTask(text, spoken) {
    var title = extractTitle(text);
    if (!title) return;
    var task = { id: uid(), title: title, transcript: spoken || null, status: 'open', createdAt: new Date().toISOString(), completedAt: null };
    state.tasks.unshift(task);
    state.freshId = task.id;
    state.view = 'open';
    persist(task);
    render();
    if (spoken) showLive('נוצרה משימה: ' + title);
    toast('נוספה: ' + title);
  }
  function toggle(id) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.status = t.status === 'done' ? 'open' : 'done';
    t.completedAt = t.status === 'done' ? new Date().toISOString() : null;
    persist(t);
    render();
    toast(t.status === 'done' ? 'בוצע. עבר לארכיון.' : 'חזרה לפתוחות.');
  }

  /* ---------- תצוגה ---------- */
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function render() {
    var open = state.tasks.filter(function (t) { return t.status !== 'done'; });
    var done = state.tasks.filter(function (t) { return t.status === 'done'; });
    els.nOpen.textContent = open.length;
    els.nDone.textContent = done.length;
    els.fOpen.setAttribute('aria-pressed', String(state.view === 'open'));
    els.fDone.setAttribute('aria-pressed', String(state.view === 'done'));
    var list = state.view === 'open' ? open : done.sort(function (a, b) { return (b.completedAt || '') < (a.completedAt || '') ? -1 : 1; });
    els.listTitle.textContent = state.view === 'open' ? 'משימות פתוחות' : 'ארכיון';
    els.listCount.textContent = list.length ? list.length + (state.view === 'open' ? ' פתוחות' : ' בוצעו') : '';
    els.tasks.innerHTML = '';
    if (!list.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = state.view === 'open' ? 'אין משימות פתוחות. לוחצים על הנקודה האדומה ואומרים משפט אחד.' : 'עוד לא סומנו משימות כבוצעו.';
      els.tasks.appendChild(li);
      return;
    }
    list.forEach(function (t) {
      var li = document.createElement('li');
      li.className = 'task' + (t.status === 'done' ? ' done' : '') + (t.id === state.freshId ? ' fresh' : '');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'm check'; b.dataset.id = t.id;
      b.setAttribute('aria-pressed', String(t.status === 'done'));
      b.setAttribute('aria-label', (t.status === 'done' ? 'החזרה לפתוחות: ' : 'סימון כבוצע: ') + t.title);
      b.innerHTML = CHECK;
      var body = document.createElement('div'); body.className = 'task-body';
      var title = document.createElement('div'); title.className = 'task-title'; title.textContent = t.title;
      var meta = document.createElement('div'); meta.className = 'task-meta';
      meta.textContent = (t.status === 'done' ? 'בוצעה ' + when(t.completedAt) : when(t.createdAt)) + (t.transcript ? ' · קולית' : '');
      body.appendChild(title); body.appendChild(meta);
      li.appendChild(b); li.appendChild(body);
      els.tasks.appendChild(li);
    });
    state.freshId = null;
  }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso), now = new Date();
    var time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'היום ' + time;
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'אתמול ' + time;
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) + ' ' + time;
  }
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { els.toast.classList.remove('on'); }, 2400);
  }

  /* ---------- אירועים ---------- */
  function bind() {
    els.record.addEventListener('click', function () { state.recording ? stopRecording(true) : startRecording(); });
    els.fOpen.addEventListener('click', function () { state.view = 'open'; render(); });
    els.fDone.addEventListener('click', function () { state.view = 'done'; render(); });
    els.write.addEventListener('click', function () { els.quick.focus(); });
    els.sync.addEventListener('click', openSheet);
    els.tasks.addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]');
      if (b) toggle(b.dataset.id);
    });
    els.dock.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = els.quick.value.trim();
      if (!v) { els.quick.focus(); return; }
      addTask(v, null);
      els.quick.value = '';
    });
    els.sheetClose.addEventListener('click', closeSheet);
    els.sheet.addEventListener('click', function (e) { if (e.target === els.sheet) closeSheet(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !els.sheet.hidden) closeSheet(); });
    els.google.addEventListener('click', function () {
      state.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    });
    els.magic.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = els.email.value.trim();
      els.sheetMsg.textContent = 'שולחת...';
      state.sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
        els.sheetMsg.textContent = r.error ? 'השליחה נכשלה: ' + r.error.message : 'נשלח קישור ל-' + email + '. פותחים אותו במכשיר הזה.';
      });
    });
    customElements.whenDefined && customElements.whenDefined('ai-menu').then(updateMenu).catch(function () {});
  }

  function init() {
    loadLocal();
    els.platform.textContent = platformNote();
    bind();
    render();
    initSupabase();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
