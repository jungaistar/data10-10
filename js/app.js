/* 회의록 요약 도우미 — 화면 (로직은 js/logic.js)
   화면: 00 한눈에 보기 · 01 메모 → 회의록 · 02 회의록 편집 · 03 회의록 목록 · 04 Action Item · 05 서식 관리 · 06 설정
   저장: localStorage 'data10-10.db'(서식·회의록·가릴 이름) · 'data10-10.draft'(작성 중인 메모 — 새로고침해도 남음) */
(function () {
  'use strict';
  var L = window.MinutesLogic, SM = window.MinutesSamples, AIP = window.AIPanel, AIE = window.AIEndpoint;
  /* 판 맞추기 — 브라우저가 옛 logic.js 와 새 app.js 를 섞어 쓰면(Pages 캐시) 버튼과 결과가 어긋날 수 있어, 섞였으면 계산하지 않고 새로고침을 안내합니다.
     판은 scripts/bump-version.mjs 로 index.html(?v=) · logic.js 와 함께 올립니다. */
  var APP_VERSION = '2026-11-11.2';
  if (!L || L.VERSION !== APP_VERSION) {
    var m0 = document.getElementById('main') || document.body;
    m0.innerHTML = '<section class="card" id="versionMismatch"><h1>새 판이 나왔습니다 — 새로고침(Ctrl+F5)해 주세요</h1><p class="alert warn">이 브라우저가 옛 파일과 새 파일을 섞어 불러왔습니다(js/logic.js ' +
      (L && L.VERSION ? L.VERSION : '옛 판') + ' · 화면 ' + APP_VERSION + '). 이대로 계산하면 버튼과 결과가 어긋날 수 있어 멈췄습니다.</p>' +
      '<p>Windows 는 <b>Ctrl+F5</b>, Mac 은 <b>Cmd+Shift+R</b> 을 한 번 눌러 주세요. 쌓아 둔 자료는 지워지지 않습니다.</p></section>';
    return;
  }
  var SINGLE = !!window.__SINGLE_FILE__;   // scripts/build-single.mjs 가 만든 「HTML 한 파일」 판이면 true
  var SINGLE_NAME = 'data10-10_회의록요약도우미.html';
  (function () {
    var ft = document.querySelector('.site-footer .inner') || document.querySelector('.site-footer'); if (!ft) return;
    var s = document.createElement('span'); s.className = 'ver'; s.textContent = ' · 판 ' + APP_VERSION + (SINGLE ? ' (HTML 한 파일)' : ''); ft.appendChild(s);
    if (!SINGLE) { ft.appendChild(document.createTextNode(' · ')); var a = document.createElement('a'); a.href = '#/settings'; a.textContent = 'HTML 한 파일로 받기';
      a.addEventListener('click', function () { setTimeout(function () { var c = document.getElementById('singleCard'); if (c) c.scrollIntoView({ block: 'start' }); }, 50); }); ft.appendChild(a); }
  })();
  var DB_KEY = 'data10-10.db', DRAFT_KEY = 'data10-10.draft';
  var main = document.getElementById('main');

  /* ── 작은 도구 ───────────────────────────── */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function fld(label, control, hint, cls) {
    return h('label', { class: 'field' + (cls ? ' ' + cls : '') }, h('span', null, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
  }
  var toastTimer = null;
  function toast(msg, isErr) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, isErr ? 6000 : 3200);
  }
  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function copyText(t, okMsg) {
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0' }); ta.value = t;
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 없음 */ }
      ta.remove();
      toast(ok ? (okMsg || '복사했습니다.') : '복사하지 못했습니다. 글을 직접 골라 복사해 주세요.', !ok);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast(okMsg || '복사했습니다.'); }, fallback);
    else fallback();
  }
  function todayIso() { return L.isoOf(new Date()); }

  /* ── 저장 ────────────────────────────────── */
  var db = load();
  var storeOk = true;
  function load() {
    try { return L.cleanDb(JSON.parse(localStorage.getItem(DB_KEY) || 'null')); } catch (e) { storeOk = false; return L.cleanDb(null); }
  }
  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); storeOk = true; } catch (e) { storeOk = false; toast('브라우저 저장소에 저장하지 못했습니다(용량 · 사생활 보호 창). 「설정 → 백업」으로 파일을 받아 두세요.', true); }
    topbar();
  }
  function emptyDraft() { return { templateId: 'general', memo: '', source: '', maskOn: db.maskDefault, names: [], off: [], meetingDate: '', tab: 'semi', answer: '' }; }
  var draft = (function () {
    try { var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (d && typeof d === 'object') return Object.assign(emptyDraft(), d); } catch (e) { /* 없음 */ }
    return emptyDraft();
  })();
  function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* 저장소 막힘 — 이 창에서만 */ } }
  function tplById(id) { return db.templates.filter(function (t) { return t.id === id; })[0] || db.templates[0]; }
  function minuteById(id) { return db.minutes.filter(function (m) { return m.id === id; })[0] || null; }

  /* ── 메뉴 ────────────────────────────────── */
  var ROUTES = [
    { id: 'home', no: '00', t: '한눈에 보기', s: '흐름 · 예시로 시작' },
    { id: 'write', no: '01', t: '메모 → 회의록', s: '서식 · 메모 · 이름 가리기 · 정리' },
    { id: 'list', no: '02', t: '회의록 목록', s: '저장한 회의록 · 편집 · 내보내기' },
    { id: 'actions', no: '03', t: 'Action Item', s: '할 일 모아 보기 · 기한 지남' },
    { id: 'templates', no: '04', t: '서식 관리', s: '기본 3종 · 내 서식 만들기' },
    { id: 'settings', no: '05', t: '설정', s: 'AI 연결(로컬 LLM) · 가리기 · 백업' }
  ];
  function nav(active) {
    var el = document.getElementById('nav'); el.innerHTML = '';
    var over = L.actionSummary(L.collectActions(db.minutes, todayIso())).overdue;
    ROUTES.forEach(function (r) {
      el.appendChild(h('a', { href: '#/' + r.id, 'aria-current': r.id === active ? 'page' : null },
        h('span', { class: 'no' }, r.no),
        h('span', { class: 't' }, r.t, r.id === 'actions' && over ? h('span', { class: 'badge over' }, '기한 지남 ' + over) : null),
        h('span', { class: 's' }, r.s)));
    });
  }
  function topbar() {
    var cfg = AIE.load();
    var chip = document.getElementById('aiChip'); chip.innerHTML = '';
    add(chip, ['AI: ', h('a', { href: '#/settings' }, AIE.isReady(cfg) ? '자동 보내기 — ' + AIE.describe(cfg) : '반자동(복사 · 붙여 넣기)')]);
    document.getElementById('storeNote').textContent = storeOk ? '회의록 ' + db.minutes.length + '건 · 이 브라우저에 저장' : '브라우저 저장소를 쓸 수 없습니다 — 백업 파일을 받아 두세요';
  }
  function pageHead(stage, title, lead, extra) {
    return h('div', { class: 'page-head' }, h('div', { class: 'titles' }, h('div', { class: 'stage' }, stage), h('h1', null, title), lead ? h('p', { class: 'lead' }, lead) : null), extra || null);
  }

  /* ── 00 한눈에 보기 ──────────────────────── */
  function viewHome() {
    var acts = L.collectActions(db.minutes, todayIso()), sum = L.actionSummary(acts);
    main.appendChild(pageHead('00 · 한눈에 보기', '회의록 요약 도우미',
      '회의 직후 메모장 · 워드로 적은 메모와 회의록 서식을 넣으면, 결정 사항과 Action Item(담당 · 기한)까지 서식 칸에 맞춰 정리합니다.'));
    main.appendChild(h('ol', { class: 'steps' },
      h('li', null, h('span', { class: 'k' }, '1단계'), h('span', { class: 't' }, '서식 고르기'), h('span', { class: 's' }, '일반 회의 · 시험·검증 결과 리뷰 · 일정 점검, 또는 우리 팀 워드 양식으로 만든 서식')),
      h('li', null, h('span', { class: 'k' }, '2단계'), h('span', { class: 't' }, '메모 넣기'), h('span', { class: 's' }, '붙여 넣기 · 메모장(.txt) · 워드(.docx). 이름은 AI 로 보내기 전에 「인물1」 처럼 가립니다')),
      h('li', null, h('span', { class: 'k' }, '3단계'), h('span', { class: 't' }, '정리하기'), h('span', { class: 's' }, '프롬프트 복사 → 회사가 허용한 AI · 로컬 LLM 자동 보내기 · AI 없이 규칙 초안 중 하나')),
      h('li', null, h('span', { class: 'k' }, '4단계'), h('span', { class: 't' }, '확인 · 내보내기'), h('span', { class: 's' }, '메모에 없는 담당 · 기한은 「확인 필요」 표시. Word · 인쇄(PDF) · 글 복사, 할 일은 모아 보기'))));
    main.appendChild(h('div', { class: 'tiles' },
      h('a', { class: 'tile', href: '#/list' }, h('div', { class: 'k' }, '저장한 회의록'), h('div', { class: 'v' }, db.minutes.length + '건')),
      h('a', { class: 'tile', href: '#/actions' }, h('div', { class: 'k' }, '남은 할 일'), h('div', { class: 'v' }, sum.open + '건')),
      h('a', { class: 'tile' + (sum.overdue ? ' over' : ''), href: '#/actions?f=over' }, h('div', { class: 'k' }, '기한 지남'), h('div', { class: 'v' }, sum.overdue + '건')),
      h('a', { class: 'tile', href: '#/actions' }, h('div', { class: 'k' }, '3일 안에 기한'), h('div', { class: 'v' }, sum.dueSoon + '건'))));
    var sl = h('div', { class: 'sample-list' });
    SM.SAMPLES.forEach(function (s) {
      sl.appendChild(h('button', { type: 'button', class: 'btn', onclick: function () { loadSample(s); } }, s.name));
    });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '예시 메모로 해 보기'),
      h('p', { class: 'note' }, '정리되지 않은 회의 메모(가상) 3건입니다. 누르면 「01 메모 → 회의록」에 메모와 맞는 서식이 들어갑니다. 「AI 없이」 탭의 규칙 초안으로 바로 결과를 볼 수 있습니다.'),
      sl,
      h('p', { class: 'note', style: 'margin-top:10px' }, '같은 메모의 워드 · 메모장 파일은 samples 폴더에 있습니다(예시3 = .docx, 예시2 = 메모장 ANSI 저장).')));
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '정리하는 세 가지 방법'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('tr', null, h('th', null, '방법'), h('th', null, '메모가 가는 곳'), h('th', null, '언제 쓰나')),
        h('tr', null, h('td', null, '반자동(기본)'), h('td', null, '사용자가 복사해 붙여 넣은 AI 한 곳'), h('td', null, '회사가 허용한 AI(사내 AI 포털 등)가 있을 때. 이름 가리기를 켜 둡니다')),
        h('tr', null, h('td', null, '로컬 LLM 자동 보내기'), h('td', null, '내 PC(Ollama · LM Studio) — PC 밖으로 안 나감'), h('td', null, '사내 문서를 외부 AI 에 넣으면 안 될 때. 「05 설정」에서 주소 · 모델을 고릅니다')),
        h('tr', null, h('td', null, 'AI 없이 규칙 초안'), h('td', null, '어디로도 안 감'), h('td', null, '결정 · 할 일 · 담당 · 기한 줄을 낱말과 날짜 모양으로 찾습니다. 문장 요약은 하지 않습니다'))))));
  }
  function loadSample(s) {
    draft = emptyDraft();
    draft.templateId = s.templateId; draft.memo = s.memo; draft.source = s.name + '(가상)';
    draft.tab = 'rule';
    refreshNames(true);
    saveDraft();
    location.hash = '#/write';
    toast(s.name + ' 메모를 넣었습니다.');
  }

  /* ── 01 메모 → 회의록 ─────────────────────── */
  function refreshNames(reset) {
    var found = L.detectNames(draft.memo);
    db.maskNames.forEach(function (n) { if (draft.memo.indexOf(n) >= 0 && found.indexOf(n) < 0) found.push(n); });
    if (reset) { draft.names = found; draft.off = []; return; }
    found.forEach(function (n) { if (draft.names.indexOf(n) < 0) draft.names.push(n); });
  }
  function activeNames() { return draft.names.filter(function (n) { return draft.off.indexOf(n) < 0; }); }
  function aliasMap() { return draft.maskOn ? L.buildAliasMap(activeNames()) : []; }
  function meetingDate() {
    if (draft.meetingDate) return draft.meetingDate;
    var r = L.ruleDraft(tplById(draft.templateId), draft.memo);
    return r.meetingDate || '';
  }
  function promptText() {
    var tpl = tplById(draft.templateId), map = aliasMap();
    var memo = draft.maskOn ? L.maskText(draft.memo, map) : draft.memo;
    return L.buildPrompt(tpl, memo, { meetingDate: meetingDate(), masked: draft.maskOn && map.length > 0 });
  }

  function viewWrite() {
    var tpl = tplById(draft.templateId);
    main.appendChild(pageHead('01 · 메모 → 회의록', '메모를 회의록으로',
      '서식을 고르고 메모를 넣은 뒤, 세 가지 방법 중 하나로 정리합니다. 작성 중인 메모는 이 브라우저에 남아 있어 새로고침해도 사라지지 않습니다.',
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: function () {
        if (draft.memo && !confirm('작성 중인 메모를 비울까요?')) return;
        draft = emptyDraft(); saveDraft(); render();
      } }, '새로 쓰기'))));

    // ① 서식
    var pick = h('div', { class: 'tpl-pick', role: 'radiogroup', 'aria-label': '회의록 서식' });
    db.templates.forEach(function (t) {
      pick.appendChild(h('label', { class: 'tpl-opt' },
        h('input', { type: 'radio', name: 'tpl', value: t.id, checked: t.id === tpl.id, onchange: function () { draft.templateId = t.id; draft.answer = ''; saveDraft(); render(); } }),
        h('span', null, h('span', { class: 't' }, t.name), h('span', { class: 's' }, t.desc || (t.fields.length + '칸')))));
    });
    var chips = h('ul', { class: 'chips', 'aria-label': '이 서식의 칸' });
    tpl.fields.forEach(function (f) { chips.appendChild(h('li', null, f.label, f.type === 'actions' ? h('span', { class: 'badge info' }, '담당 · 기한') : null)); });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, h('span', { class: 'step' }, '1'), '서식 고르기'),
      pick, chips,
      h('p', { class: 'note', style: 'margin-top:8px' }, '우리 팀 워드 양식이 있으면 ', h('a', { href: '#/templates' }, '「04 서식 관리」'), '에서 양식 파일(.docx)로 서식을 만들 수 있습니다.')));

    // ② 메모
    var memoIn = h('textarea', { class: 'input memo', id: 'memoIn', placeholder: '회의 메모를 붙여 넣거나 아래에서 파일을 고르세요. 정리되지 않은 메모 그대로 괜찮습니다.', spellcheck: 'false' });
    memoIn.value = draft.memo;
    var count = h('span', { class: 'note' });
    function syncCount() { count.textContent = draft.memo.length.toLocaleString() + '자' + (draft.source ? ' · ' + draft.source : ''); }
    syncCount();
    var memoTimer = null;
    memoIn.addEventListener('input', function () {
      draft.memo = memoIn.value; syncCount();
      clearTimeout(memoTimer); memoTimer = setTimeout(function () { refreshNames(false); saveDraft(); renderMask(); }, 500);
    });
    var file = h('input', { type: 'file', accept: '.txt,.md,.docx,.text,text/plain', 'aria-label': '메모 파일 고르기' });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      readMemoFile(f).then(function (text) {
        draft.memo = text; draft.source = f.name; draft.meetingDate = ''; draft.answer = '';
        refreshNames(true); saveDraft(); render();
        toast(f.name + ' 을(를) 읽었습니다.');
      }, function (e) { toast(e.message, true); file.value = ''; });
    });
    var mdIn = h('input', { type: 'date', value: draft.meetingDate || meetingDate() });
    mdIn.addEventListener('change', function () { draft.meetingDate = mdIn.value; saveDraft(); });
    var sampleRow = h('div', { class: 'btn-row' }, h('span', { class: 'note' }, '예시 메모:'));
    SM.SAMPLES.forEach(function (s, i) { sampleRow.appendChild(h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { loadSample(s); render(); } }, '예시 ' + (i + 1))); });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, h('span', { class: 'step' }, '2'), '메모 넣기'),
      memoIn,
      h('div', { class: 'btn-row', style: 'margin:8px 0 12px' }, count),
      h('div', { class: 'form-grid' },
        fld('메모 파일(.txt · .docx)', file, '메모장 「ANSI」 저장도 읽습니다. 옛 워드(.doc) · 한글(.hwp)은 .docx 로 저장하거나 글을 복사해 붙여 넣어 주세요.'),
        fld('회의일', mdIn, '메모에서 찾은 날짜입니다. 「다음 주 금요일」 같은 기한을 이 날 기준으로 바꿉니다.')),
      h('div', { style: 'margin-top:10px' }, sampleRow)));

    // ③ 이름 가리기
    var maskCard = h('section', { class: 'card', id: 'maskCard' });
    main.appendChild(maskCard);
    renderMask();

    // ④ 정리하기
    main.appendChild(organizeCard());
  }

  function renderMask() {
    var card = document.getElementById('maskCard'); if (!card) return;
    card.innerHTML = '';
    var on = h('input', { type: 'checkbox', checked: draft.maskOn, onchange: function () { draft.maskOn = on.checked; saveDraft(); renderMask(); } });
    var chips = h('div', { class: 'chips' });
    draft.names.forEach(function (n) {
      var off = draft.off.indexOf(n) >= 0;
      var cb = h('input', { type: 'checkbox', checked: !off, 'aria-label': n + ' 가리기', onchange: function () {
        if (cb.checked) draft.off = draft.off.filter(function (x) { return x !== n; }); else draft.off.push(n);
        saveDraft(); renderMask();
      } });
      chips.appendChild(h('label', { class: 'chip' + (off ? ' off' : '') }, cb, n));
    });
    var addIn = h('input', { class: 'input', placeholder: '빠진 이름 더하기(쉼표로 여러 명)', style: 'max-width:320px' });
    function addNames() {
      addIn.value.split(/[,，\s]+/).forEach(function (n) { n = n.trim(); if (n && draft.names.indexOf(n) < 0) draft.names.push(n); });
      saveDraft(); renderMask();
    }
    addIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addNames(); } });
    var map = aliasMap();
    var body = [
      h('h2', null, h('span', { class: 'step' }, '3'), '이름 가리기', h('span', { class: 'badge' + (draft.maskOn ? ' done' : '') }, draft.maskOn ? '켜짐' : '꺼짐')),
      h('label', { class: 'opt' }, on, h('span', null, 'AI 로 보내기 전에 사람 이름을 「인물1」 「인물2」 로 바꿉니다. AI 답은 다시 이름으로 되돌려 서식에 넣습니다(대응표는 이 PC 에만).')),
      h('p', { class: 'note', style: 'margin:10px 0 4px' }, '메모에서 찾은 이름(참석자 줄 · 「○○○ 책임」 · @이름 · 담당: 이름). 체크를 끄면 그 이름은 가리지 않습니다.'),
      draft.names.length ? chips : h('p', { class: 'note' }, '찾은 이름이 없습니다. 메모를 넣으면 자동으로 찾습니다.'),
      h('div', { class: 'btn-row', style: 'margin-top:8px' }, addIn, h('button', { type: 'button', class: 'btn btn-sm', onclick: addNames }, '더하기'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { refreshNames(true); saveDraft(); renderMask(); } }, '다시 찾기'))
    ];
    if (draft.maskOn && map.length) {
      var leaks = L.findLeaks(promptText(), activeNames());
      body.push(h('details', { style: 'margin-top:10px' }, h('summary', null, '대응표 보기(' + map.length + '명)'),
        h('div', { class: 'table-wrap', style: 'margin-top:6px' }, h('table', { class: 'list alias-table' },
          h('tr', null, h('th', null, '보내는 표기'), h('th', null, '실제 이름')),
          map.map(function (p) { return h('tr', null, h('td', null, p.alias), h('td', null, p.name)); })))));
      body.push(h('p', { class: 'alert ' + (leaks.length ? 'bad' : 'ok'), style: 'margin-top:10px' },
        leaks.length ? '프롬프트에 이름이 남아 있습니다: ' + leaks.join(', ') : '점검: 프롬프트에 가린 이름이 남아 있지 않습니다. 부서 · 시료 · 고객 이름은 가리지 않으니 메모에서 직접 지워 주세요.'));
    } else if (!draft.maskOn) {
      body.push(h('p', { class: 'alert warn', style: 'margin-top:10px' }, '가리기가 꺼져 있습니다. 로컬 LLM 이나 사내 AI 처럼 메모가 회사 밖으로 나가지 않을 때만 끄세요.'));
    }
    add(card, body);
  }

  function readMemoFile(f) {
    var name = f.name.toLowerCase();
    if (/\.(doc|hwp|hwpx|pdf)$/.test(name)) return Promise.reject(new Error(f.name + ': 이 형식은 1단계에서 읽지 못합니다. 워드에서 「다른 이름으로 저장 → .docx」 로 저장하거나 글을 복사해 붙여 넣어 주세요.'));
    return new Promise(function (ok, bad) {
      var fr = new FileReader();
      fr.onload = function () { ok(new Uint8Array(fr.result)); };
      fr.onerror = function () { bad(new Error(f.name + ': 파일을 읽지 못했습니다.')); };
      fr.readAsArrayBuffer(f);
    }).then(function (bytes) {
      if (/\.docx$/.test(name)) {
        if (!window.JSZip) throw new Error('워드 읽기 도구(vendor/jszip.min.js)를 불러오지 못했습니다. 폴더째 받았는지 확인해 주세요.');
        return window.JSZip.loadAsync(bytes).then(function (zip) {
          var doc = zip.file('word/document.xml');
          if (!doc) throw new Error(f.name + ': 워드 본문(word/document.xml)이 없습니다.');
          return doc.async('string');
        }).then(function (xml) {
          var t = L.docxXmlToText(xml);
          if (!t.trim()) throw new Error(f.name + ': 글이 없습니다(그림만 있는 문서일 수 있음).');
          return t;
        });
      }
      return L.decodeText(bytes);
    });
  }

  function organizeCard() {
    var card = h('section', { class: 'card', id: 'orgCard' });
    var tabs = [
      { id: 'semi', t: '반자동(프롬프트 복사)' },
      { id: 'auto', t: '설정한 AI 서버로(로컬 LLM)' },
      { id: 'rule', t: 'AI 없이(규칙 초안)' }
    ];
    var bar = h('div', { class: 'tabs', role: 'tablist' });
    tabs.forEach(function (t) {
      bar.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': draft.tab === t.id ? 'true' : 'false', onclick: function () { draft.tab = t.id; saveDraft(); var n = organizeCard(); card.replaceWith(n); } }, t.t));
    });
    add(card, [h('h2', null, h('span', { class: 'step' }, '4'), '정리하기'), bar]);
    var tpl = tplById(draft.templateId);
    if (!draft.memo.trim()) { add(card, h('p', { class: 'alert warn' }, '먼저 2번에서 메모를 넣어 주세요.')); return card; }

    var answerIn = h('textarea', { class: 'input', placeholder: 'AI 의 답을 그대로 붙여 넣으세요. JSON 이 아니어도(「결정 사항: …」 처럼 칸 이름으로 나뉜 글) 읽습니다.' });
    answerIn.value = draft.answer || '';
    answerIn.addEventListener('input', function () { draft.answer = answerIn.value; saveDraft(); });
    function fillFromAnswer(text) {
      var r = L.parseAnswer(tpl, text, { meetingDate: meetingDate(), aliasMap: aliasMap(), knownNames: draft.names });
      if (r.format === 'none' || !r.filled.length) { toast('답에서 서식 칸을 찾지 못했습니다. AI 에게 「JSON 형식으로 다시」 라고 요청해 보세요.', true); return; }
      var msg = '서식 ' + tpl.fields.length + '칸 중 ' + r.filled.length + '칸을 채웠습니다' + (r.unknownKeys.length ? '(서식에 없는 칸 ' + r.unknownKeys.join(', ') + ' 은 뺌)' : '') + '.';
      createMinute(tpl, r.values, draft.tab === 'auto' ? 'ai-auto' : 'ai-semi', msg);
    }

    if (draft.tab === 'semi') {
      var pIn = h('textarea', { class: 'input prompt', readonly: true, 'aria-label': '만든 프롬프트' });
      pIn.value = promptText();
      add(card, [
        h('ol', { class: 'flow' },
          h('li', null, h('b', null, '프롬프트 복사'), ' — 서식 칸 · 규칙 · ' + (draft.maskOn ? '이름을 가린 ' : '') + '메모가 들어 있습니다.',
            h('div', { class: 'btn-row', style: 'margin:8px 0' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { copyText(pIn.value, '프롬프트를 복사했습니다. 회사가 허용한 AI 에 붙여 넣으세요.'); } }, '프롬프트 복사')),
            h('details', null, h('summary', null, '프롬프트 보기'), pIn)),
          h('li', null, h('b', null, 'AI 에 붙여 넣기'), ' — 회사가 허용한 AI(사내 AI 포털 · 로컬 LLM 채팅 창 등)에 붙여 넣고 답을 받습니다.'),
          h('li', null, h('b', null, '답 붙여 넣기 → 서식 채우기'), answerIn,
            h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { fillFromAnswer(answerIn.value); } }, '답으로 서식 채우기'))))
      ]);
    } else if (draft.tab === 'auto') {
      var cfg = AIE.load();
      add(card, [
        h('p', { class: 'note' }, '설정한 주소(' + (AIE.isReady(cfg) ? AIE.describe(cfg) : '아직 없음') + ')로 프롬프트를 보내고, 답이 오면 바로 서식을 채웁니다. 내 PC 의 로컬 LLM(Ollama · LM Studio)이면 메모가 PC 밖으로 나가지 않습니다.'),
        h('div', { class: 'btn-row', style: 'margin-bottom:10px' },
          AIP.sendButton('설정한 AI 서버로 보내기', promptText, function (text) { draft.answer = text; answerIn.value = text; saveDraft(); fillFromAnswer(text); },
            { toast: toast, settingsHref: '#/settings', system: '너는 회의록 정리 도우미야. 요청한 JSON 하나만 한국어로 답해줘.' })),
        h('details', null, h('summary', null, '받은 답 보기 · 고쳐서 다시 채우기'), answerIn,
          h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn', onclick: function () { fillFromAnswer(answerIn.value); } }, '이 답으로 서식 채우기')))
      ]);
    } else {
      add(card, [
        h('p', { class: 'note' }, 'AI 를 쓰지 않고 메모의 줄을 나눠 칸에 넣습니다. 「결정 · 확정 · 하기로」 줄은 결정 사항, 담당(이름 · @이름 · 담당:)이나 기한(10/24 · 다음 주 금요일)이 붙은 할 일 줄은 Action Item, 「다음 회의 · 차기 회의」 줄은 다음 회의로 갑니다. 문장을 요약하지는 않으니 결과를 다듬어 쓰세요.'),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          var r = L.ruleDraft(tpl, draft.memo, { meetingDate: draft.meetingDate, knownNames: draft.names });
          if (!draft.meetingDate && r.meetingDate) draft.meetingDate = r.meetingDate;
          createMinute(tpl, r.values, 'rule', '규칙으로 초안을 만들었습니다. 「확인 필요」 표시를 살펴 다듬어 주세요.');
        } }, '규칙으로 초안 만들기'))
      ]);
    }
    return card;
  }
  function createMinute(tpl, values, method, msg) {
    var m = L.newMinute(tpl, values, { memo: db.keepMemo ? draft.memo : '', method: method, meetingDate: meetingDate() });
    db.minutes.unshift(m); save();
    location.hash = '#/edit/' + m.id;
    toast(msg);
  }

  /* ── 회의록 편집 ──────────────────────────── */
  function viewEdit(id) {
    var m = minuteById(id);
    if (!m) { main.appendChild(h('p', { class: 'alert warn' }, '회의록을 찾지 못했습니다. ', h('a', { href: '#/list' }, '목록으로'))); return; }
    var work = JSON.parse(JSON.stringify(m));        // 저장 전 고치는 사본
    var tpl = work.template, dirty = false;
    var METHOD = { 'rule': 'AI 없이 규칙 초안', 'ai-semi': '반자동 AI 답', 'ai-auto': '설정한 AI 서버 답' };
    main.appendChild(pageHead('02 · 회의록 편집', L.minuteTitle(work),
      tpl.name + ' 서식 · ' + (METHOD[work.method] || '직접 작성') + ' · 만든 날 ' + work.createdAt.slice(0, 10) + '. 고친 뒤 「저장」을 눌러 주세요.',
      h('a', { class: 'btn btn-sm', href: '#/list' }, '목록으로')));

    var checkBox = h('div', { id: 'checkBox' });
    main.appendChild(checkBox);
    var form = h('section', { class: 'card' });
    main.appendChild(form);

    function markDirty() { dirty = true; }
    function flags() { return work.memo ? L.traceCheck(tpl, work.values, work.memo, { meetingDate: work.meetingDate }) : []; }
    function renderChecks() {
      checkBox.innerHTML = '';
      var fl = flags();
      if (!work.memo) { add(checkBox, h('p', { class: 'alert info' }, '메모 원문을 저장하지 않은 회의록이라 메모 근거 점검을 하지 않습니다.')); return; }
      if (!fl.length) { add(checkBox, h('p', { class: 'alert ok' }, '메모 근거 점검: 담당 · 기한 · 결정 문장이 모두 메모에서 확인됩니다.')); return; }
      add(checkBox, h('div', { class: 'alert warn' }, h('b', null, '확인 필요 ' + fl.length + '건'), ' — 메모에 없거나 비어 있는 값입니다. AI 가 지어낸 것인지 확인해 주세요.',
        h('ul', null, fl.map(function (x) { return h('li', null, x.label + (x.index != null ? ' ' + (x.index + 1) + '번' : '') + ': ' + x.message); }))));
    }
    function renderForm() {
      form.innerHTML = '';
      var fl = flags();
      var grid = h('div', { class: 'form-grid' });
      tpl.fields.forEach(function (f) {
        var v = work.values[f.key];
        var flagged = fl.some(function (x) { return x.key === f.key && f.type !== 'actions'; });
        if (f.type === 'actions') { grid.appendChild(h('div', { class: 'span-all' }, actionEditor(f))); return; }
        var ctl;
        if (f.type === 'text') {
          ctl = h('input', { value: v || '' });
          ctl.addEventListener('input', function () { work.values[f.key] = ctl.value; markDirty(); });
          grid.appendChild(fld(f.label, ctl, f.hint, ''));
        } else {
          ctl = h('textarea', { rows: Math.max(3, (f.type === 'list' ? v.length : String(v).split('\n').length) + 1) });
          ctl.value = f.type === 'list' ? (v || []).join('\n') : (v || '');
          ctl.addEventListener('input', function () {
            work.values[f.key] = f.type === 'list' ? ctl.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : ctl.value;
            markDirty();
          });
          ctl.addEventListener('change', renderChecks);
          grid.appendChild(fld(f.label, ctl, f.type === 'list' ? '한 줄에 한 항목' + (f.hint ? ' · ' + f.hint : '') : f.hint, 'span-all' + (flagged ? ' flag' : '')));
        }
      });
      add(form, grid);
    }
    function actionEditor(f) {
      var wrap = h('div', null, h('div', { class: 'field' }, h('span', null, f.label, ' ', h('small', { class: 'hint' }, '할 일 · 담당 · 기한(YYYY-MM-DD) · 완료'))));
      var rows = h('div', { class: 'ai-rows' });
      var list = work.values[f.key] || (work.values[f.key] = []);
      var fl = flags().filter(function (x) { return x.key === f.key; });
      list.forEach(function (a, i) {
        var mine = fl.filter(function (x) { return x.index === i; });
        function inp(cls, prop, ph) {
          var el = h('input', { type: 'text', class: cls, value: a[prop] || '', placeholder: ph, 'aria-label': (i + 1) + '번 ' + ph });
          el.addEventListener('input', function () { a[prop] = el.value; markDirty(); });
          el.addEventListener('change', function () { renderChecks(); });
          return el;
        }
        var done = h('input', { type: 'checkbox', checked: a.done, onchange: function () { a.done = done.checked; markDirty(); } });
        rows.appendChild(h('div', { class: 'ai-row' + (mine.length ? ' flag' : '') },
          h('span', { class: 'no' }, i + 1), inp('task', 'task', '할 일'), inp('owner', 'owner', '담당'), inp('due', 'due', '기한'),
          h('label', { class: 'done' }, done, '완료'),
          h('button', { type: 'button', class: 'btn btn-sm del', 'aria-label': (i + 1) + '번 지우기', onclick: function () { list.splice(i, 1); markDirty(); renderForm(); renderChecks(); } }, '지우기'),
          mine.length ? h('span', { class: 'warn-line' }, '확인 필요: ' + mine.map(function (x) { return x.message; }).join(' · ')) : null));
      });
      if (!list.length) rows.appendChild(h('p', { class: 'note' }, '할 일이 없습니다.'));
      add(wrap, [rows, h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { list.push({ task: '', owner: '', due: '', done: false }); markDirty(); renderForm(); } }, '할 일 더하기'))]);
      return wrap;
    }
    renderChecks(); renderForm();

    if (work.memo) main.appendChild(h('section', { class: 'card' }, h('details', { class: 'memo-src' }, h('summary', null, '메모 원문 보기(대조용)'), h('pre', null, work.memo))));

    function doSave(quiet) {
      work.updatedAt = new Date().toISOString();
      var i = db.minutes.findIndex(function (x) { return x.id === work.id; });
      var clean = L.cleanMinute(work);
      if (i >= 0) db.minutes[i] = clean; else db.minutes.unshift(clean);
      save(); dirty = false;
      if (!quiet) { toast('저장했습니다.'); render(); }
    }
    function fileBase() { return L.safeFileName((L.minuteDate(work) || '') + '_' + L.minuteTitle(work)); }
    function html() { return L.toHtml(tpl, work.values, { title: L.minuteTitle(work) + ' 회의록', footer: '회의록 요약 도우미(data10-10)로 정리한 초안 — 검토 후 사용' }); }
    main.appendChild(h('div', { class: 'sticky-bar' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { doSave(false); } }, '저장'),
      h('button', { type: 'button', class: 'btn', onclick: function () { download(fileBase() + '.doc', new Blob(['﻿' + html()], { type: 'application/msword' })); } }, 'Word(.doc)'),
      h('button', { type: 'button', class: 'btn', onclick: function () {
        var pa = document.getElementById('printArea');
        var doc = new DOMParser().parseFromString(html(), 'text/html');
        pa.innerHTML = doc.body.innerHTML;
        window.print();
      } }, '인쇄 / PDF'),
      h('button', { type: 'button', class: 'btn', onclick: function () { copyText(L.minuteTitle(work) + ' 회의록\n\n' + L.toPlainText(tpl, work.values), '회의록 글을 복사했습니다.'); } }, '글 복사'),
      h('button', { type: 'button', class: 'btn btn-danger', onclick: function () {
        if (!confirm('이 회의록을 지울까요? 되돌릴 수 없습니다.')) return;
        db.minutes = db.minutes.filter(function (x) { return x.id !== work.id; }); save();
        location.hash = '#/list'; toast('지웠습니다.');
      } }, '지우기')));
    leaveGuard = function () { return dirty; };
  }
  var leaveGuard = null;
  window.addEventListener('beforeunload', function (e) { if (leaveGuard && leaveGuard()) { e.preventDefault(); e.returnValue = ''; } });

  /* ── 02 회의록 목록 ──────────────────────── */
  function viewList() {
    main.appendChild(pageHead('02 · 회의록 목록', '저장한 회의록', '이 브라우저에 저장된 회의록입니다. 눌러서 고치고 Word · 인쇄 · 글 복사로 내보냅니다.',
      h('a', { class: 'btn btn-primary btn-sm', href: '#/write' }, '새 회의록')));
    if (!db.minutes.length) { main.appendChild(h('p', { class: 'alert info' }, '아직 없습니다. ', h('a', { href: '#/write' }, '「01 메모 → 회의록」'), '에서 만들어 보세요.')); return; }
    var q = h('input', { class: 'input', type: 'search', placeholder: '회의명 · 내용 · 담당자로 찾기', style: 'max-width:360px;margin-bottom:12px', 'aria-label': '회의록 찾기' });
    var wrap = h('div', { class: 'table-wrap' });
    function draw() {
      var kw = q.value.trim();
      var rows = db.minutes.slice().sort(function (a, b) { return L.minuteDate(b) < L.minuteDate(a) ? -1 : L.minuteDate(b) > L.minuteDate(a) ? 1 : 0; })
        .filter(function (m) { return !kw || JSON.stringify(m.values).indexOf(kw) >= 0; });
      wrap.innerHTML = '';
      var acts = L.collectActions(db.minutes, todayIso());
      wrap.appendChild(h('table', { class: 'list' },
        h('tr', null, h('th', null, '회의일'), h('th', null, '회의명'), h('th', null, '서식'), h('th', null, '할 일'), h('th', null, '고친 날')),
        rows.map(function (m) {
          var mine = acts.filter(function (a) { return a.minuteId === m.id; });
          var open = mine.filter(function (a) { return !a.done; }).length, over = mine.filter(function (a) { return a.overdue; }).length;
          return h('tr', null, h('td', { class: 'nowrap' }, L.minuteDate(m)), h('td', null, h('a', { href: '#/edit/' + m.id }, L.minuteTitle(m))),
            h('td', null, m.template.name), h('td', { class: 'nowrap' }, open + ' / ' + mine.length, over ? [' ', h('span', { class: 'badge over' }, '지남 ' + over)] : null),
            h('td', { class: 'nowrap' }, String(m.updatedAt).slice(0, 10)));
        })));
      if (!rows.length) wrap.appendChild(h('p', { class: 'note', style: 'padding:10px' }, '찾는 회의록이 없습니다.'));
    }
    q.addEventListener('input', draw);
    main.appendChild(q); main.appendChild(wrap); draw();
  }

  /* ── 03 Action Item ──────────────────────── */
  function viewActions(query) {
    var f = (/f=(\w+)/.exec(query || '') || [])[1] || 'open';
    var who = decodeURIComponent((/who=([^&]*)/.exec(query || '') || [])[1] || '');
    var all = L.collectActions(db.minutes, todayIso()), sum = L.actionSummary(all);
    main.appendChild(pageHead('03 · Action Item', '할 일 모아 보기', '저장한 회의록의 Action Item 을 한곳에 모았습니다. 오늘(' + todayIso() + ') 기준으로 기한이 지난 것을 표시합니다. 완료 체크는 그 회의록에도 바로 저장됩니다.'));
    var FILTERS = [['open', '남은 할 일 ' + sum.open], ['over', '기한 지남 ' + sum.overdue], ['all', '전체 ' + sum.total], ['done', '완료 ' + sum.done]];
    var owners = []; all.forEach(function (a) { var o = a.owner || '(담당 없음)'; if (owners.indexOf(o) < 0) owners.push(o); });
    var sel = h('select', { class: 'input', style: 'max-width:220px', 'aria-label': '담당자로 거르기' }, h('option', { value: '' }, '담당 전체'), owners.sort().map(function (o) { return h('option', { value: o }, o); }));
    sel.value = who;
    function go(nf, nw) { location.hash = '#/actions?f=' + nf + (nw ? '&who=' + encodeURIComponent(nw) : ''); }
    sel.addEventListener('change', function () { go(f, sel.value); });
    main.appendChild(h('div', { class: 'btn-row', style: 'margin-bottom:12px' },
      FILTERS.map(function (x) { return h('button', { type: 'button', class: 'btn btn-sm' + (x[0] === f ? ' btn-primary' : ''), 'aria-pressed': x[0] === f ? 'true' : 'false', onclick: function () { go(x[0], who); } }, x[1]); }), sel));
    var list = all.filter(function (a) {
      if (who && (a.owner || '(담당 없음)') !== who) return false;
      return f === 'all' ? true : f === 'done' ? a.done : f === 'over' ? a.overdue : !a.done;
    });
    if (!all.length) { main.appendChild(h('p', { class: 'alert info' }, '저장한 회의록에 Action Item 이 없습니다.')); return; }
    function dueBadge(a) {
      if (a.done) return h('span', { class: 'badge done' }, '완료');
      if (a.daysLeft == null) return h('span', { class: 'badge' }, a.due ? '날짜 아님' : '기한 없음');
      if (a.overdue) return h('span', { class: 'badge over' }, (-a.daysLeft) + '일 지남');
      if (a.daysLeft === 0) return h('span', { class: 'badge soon' }, '오늘');
      if (a.daysLeft <= 3) return h('span', { class: 'badge soon' }, a.daysLeft + '일 남음');
      return h('span', { class: 'badge' }, a.daysLeft + '일 남음');
    }
    main.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('tr', null, h('th', null, '완료'), h('th', null, '할 일'), h('th', null, '담당'), h('th', null, '기한'), h('th', null, '회의')),
      list.map(function (a) {
        var cb = h('input', { type: 'checkbox', checked: a.done, 'aria-label': a.task + ' 완료', onchange: function () {
          var m = minuteById(a.minuteId); if (!m) return;
          m.values[a.fieldKey][a.index].done = cb.checked; m.updatedAt = new Date().toISOString(); save(); render();
        } });
        return h('tr', { class: (a.overdue ? 'over' : '') + (a.done ? ' is-done' : '') },
          h('td', null, cb), h('td', { class: 'task' }, a.task || '(내용 없음)'), h('td', { class: 'nowrap' }, a.owner || '—'),
          h('td', { class: 'nowrap' }, a.due || '—', ' ', dueBadge(a)),
          h('td', null, h('a', { href: '#/edit/' + a.minuteId }, a.title), h('div', { class: 'note' }, a.date)));
      }))));
    if (!list.length) main.appendChild(h('p', { class: 'note', style: 'margin-top:8px' }, '이 조건에 맞는 할 일이 없습니다.'));
    main.appendChild(h('div', { class: 'btn-row', style: 'margin-top:12px' }, h('button', { type: 'button', class: 'btn', onclick: function () {
      copyText(list.map(function (a) { return '- ' + a.task + ' / 담당: ' + (a.owner || '미정') + ' / 기한: ' + (a.due || '미정') + (a.done ? ' [완료]' : a.overdue ? ' [기한 지남]' : '') + ' (' + a.title + ')'; }).join('\n'), '보이는 할 일을 글로 복사했습니다.');
    } }, '보이는 목록 글 복사')));
  }

  /* ── 04 서식 관리 ────────────────────────── */
  var editingTpl = null;
  function viewTemplates() {
    main.appendChild(pageHead('04 · 서식 관리', '회의록 서식', '서식 = 회의록의 칸 목록입니다. 칸마다 「역할」이 있어 규칙 초안이 어디에 무엇을 넣을지 압니다(결정 사항 · Action Item 등).'));
    var grid = h('div', { class: 'grid-2' });
    db.templates.forEach(function (t) {
      grid.appendChild(h('section', { class: 'card' }, h('h2', null, t.name, t.builtin ? h('span', { class: 'badge' }, '기본') : h('span', { class: 'badge info' }, '내 서식')),
        h('p', { class: 'note' }, t.desc || ''), h('ul', { class: 'chips' }, t.fields.map(function (f) { return h('li', null, f.label); })),
        h('div', { class: 'btn-row', style: 'margin-top:10px' },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { editingTpl = JSON.parse(JSON.stringify(t)); render(); scrollToEditor(); } }, '고치기'),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { var c = JSON.parse(JSON.stringify(t)); c.id = 'tpl-' + Date.now().toString(36); c.name = t.name + ' (복사)'; c.builtin = false; db.templates.push(L.cleanTemplate(c)); save(); render(); } }, '복사'),
          t.builtin ? h('button', { type: 'button', class: 'btn btn-sm', onclick: function () {
            var d = L.defaultTemplates().filter(function (x) { return x.id === t.id; })[0];
            db.templates = db.templates.map(function (x) { return x.id === t.id ? d : x; }); save(); render(); toast('기본값으로 되돌렸습니다.');
          } }, '기본값으로') : h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () {
            if (!confirm('「' + t.name + '」 서식을 지울까요? 이미 만든 회의록은 그대로 남습니다.')) return;
            db.templates = db.templates.filter(function (x) { return x.id !== t.id; }); save(); render();
          } }, '지우기'))));
    });
    main.appendChild(grid);

    // 새 서식 — 서식 글 · 워드 양식에서
    var formIn = h('textarea', { class: 'input', placeholder: '예)\n회의명:\n일시:\n참석자:\n1. 안건\n2. 결정 사항\n3. 후속 조치 (담당/기한)', rows: 7 });
    var nameIn = h('input', { class: 'input', placeholder: '서식 이름(예: 우리 팀 주간회의)' });
    var formFile = h('input', { type: 'file', accept: '.docx,.txt', 'aria-label': '서식 파일 고르기' });
    formFile.addEventListener('change', function () {
      var f = formFile.files && formFile.files[0]; if (!f) return;
      readMemoFile(f).then(function (t) { formIn.value = t; if (!nameIn.value) nameIn.value = f.name.replace(/\.[^.]+$/, ''); toast('양식 글을 읽었습니다. 「서식 만들기」를 눌러 칸을 확인하세요.'); }, function (e) { toast(e.message, true); });
    });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '우리 팀 양식으로 서식 만들기'),
      h('p', { class: 'note' }, '지금 쓰는 워드 회의록 양식(.docx)을 고르거나 양식의 칸 이름을 붙여 넣으면 칸을 찾아 서식을 만듭니다. 표 칸(「회의명 | (빈칸) | 일시 | (빈칸)」) · 「회의명:」 · 「1. 결정 사항」 모양을 읽습니다. 만든 뒤 아래 편집에서 역할을 확인해 주세요.'),
      h('div', { class: 'form-grid' }, fld('양식 파일(.docx · .txt)', formFile), fld('서식 이름', nameIn), h('div', { class: 'span-all' }, formIn)),
      h('div', { class: 'btn-row', style: 'margin-top:10px' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          var t = L.templateFromText(formIn.value, nameIn.value);
          if (!t.fields.length) { toast('칸 이름을 찾지 못했습니다. 한 줄에 칸 이름 하나씩 적어 주세요.', true); return; }
          editingTpl = t; editingTpl.isNew = true; render(); scrollToEditor();
          toast(t.fields.length + '칸을 찾았습니다. 역할을 확인하고 저장해 주세요.');
        } }, '서식 만들기'),
        h('button', { type: 'button', class: 'btn', onclick: function () { formIn.value = SM.FORM_TEXT; nameIn.value = '양식 예시'; } }, '예시 양식 글 넣기'),
        h('button', { type: 'button', class: 'btn', onclick: function () { editingTpl = { id: 'tpl-' + Date.now().toString(36), name: '새 서식', desc: '', isNew: true, fields: [{ key: 'f1', label: '회의명', role: 'title', type: 'text', hint: '' }, { key: 'f2', label: '결정 사항', role: 'decisions', type: 'list', hint: '' }, { key: 'f3', label: 'Action Item', role: 'actions', type: 'actions', hint: '' }] }; render(); scrollToEditor(); } }, '빈 서식부터'))));

    if (editingTpl) main.appendChild(templateEditor());
  }
  function scrollToEditor() { var e = document.getElementById('tplEditor'); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function templateEditor() {
    var t = editingTpl;
    var card = h('section', { class: 'card', id: 'tplEditor' });
    var ROLE_OPTS = L.ROLE_KEYS.map(function (r) { return [r, L.ROLES[r].label + (r === 'other' ? '(규칙 초안은 비워 둠)' : '')]; });
    var TYPE_OPTS = [['text', '한 줄'], ['para', '여러 줄 글'], ['list', '목록(한 줄 한 항목)'], ['actions', 'Action Item 표']];
    function sel(opts, val, onch, label) {
      var s = h('select', { 'aria-label': label }, opts.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
      s.value = val; s.addEventListener('change', function () { onch(s.value); }); return s;
    }
    function draw() {
      card.innerHTML = '';
      var nameIn = h('input', { class: 'input', value: t.name }); nameIn.addEventListener('input', function () { t.name = nameIn.value; });
      var descIn = h('input', { class: 'input', value: t.desc || '' }); descIn.addEventListener('input', function () { t.desc = descIn.value; });
      var rows = h('div', { class: 'fld-rows' }, h('div', { class: 'fld-row fld-head' }, h('span', null, '칸 이름'), h('span', null, '역할'), h('span', null, '모양'), h('span', null, '도움말(선택)'), h('span', null, '')));
      t.fields.forEach(function (f, i) {
        var lbl = h('input', { class: 'lbl', value: f.label, 'aria-label': (i + 1) + '번 칸 이름' });
        lbl.addEventListener('input', function () { f.label = lbl.value; });
        var hint = h('input', { class: 'hint-in', value: f.hint || '', placeholder: '예: 할 일 · 담당 · 기한', 'aria-label': (i + 1) + '번 도움말' });
        hint.addEventListener('input', function () { f.hint = hint.value; });
        rows.appendChild(h('div', { class: 'fld-row' }, lbl,
          sel(ROLE_OPTS, f.role, function (v) { f.role = v; f.type = L.typeOfRole(v); draw(); }, (i + 1) + '번 역할'),
          sel(TYPE_OPTS, f.type, function (v) { f.type = v; }, (i + 1) + '번 모양'), hint,
          h('span', { class: 'ops' },
            h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': '위로', disabled: i === 0, onclick: function () { t.fields.splice(i - 1, 0, t.fields.splice(i, 1)[0]); draw(); } }, '위'),
            h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': '아래로', disabled: i === t.fields.length - 1, onclick: function () { t.fields.splice(i + 1, 0, t.fields.splice(i, 1)[0]); draw(); } }, '아래'),
            h('button', { type: 'button', class: 'btn btn-sm btn-danger', 'aria-label': '칸 지우기', onclick: function () { t.fields.splice(i, 1); draw(); } }, '빼기'))));
      });
      var acts = t.fields.filter(function (f) { return f.type === 'actions'; }).length;
      add(card, [h('h2', null, (t.isNew ? '새 서식' : '서식 고치기') + ' — ' + t.name),
        h('div', { class: 'form-grid', style: 'margin-bottom:12px' }, fld('서식 이름', nameIn), fld('설명', descIn)),
        rows,
        acts > 1 ? h('p', { class: 'alert warn', style: 'margin-top:8px' }, 'Action Item 표 칸이 ' + acts + '개입니다. 할 일 모아 보기는 모두 모으지만, 규칙 초안은 첫 칸에만 넣습니다.') : null,
        acts === 0 ? h('p', { class: 'alert info', style: 'margin-top:8px' }, 'Action Item 표 칸이 없으면 할 일 모아 보기에 나오지 않습니다.') : null,
        h('div', { class: 'btn-row', style: 'margin-top:10px' },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { t.fields.push({ key: 'f' + Date.now().toString(36), label: '새 칸', role: 'other', type: 'para', hint: '' }); draw(); } }, '칸 더하기'),
          h('span', { style: 'flex:1' }),
          h('button', { type: 'button', class: 'btn', onclick: function () { editingTpl = null; render(); } }, '그만두기'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
            var c = L.cleanTemplate(t);
            if (!c.fields.length) { toast('칸이 하나는 있어야 합니다.', true); return; }
            var i = db.templates.findIndex(function (x) { return x.id === c.id; });
            if (i >= 0) db.templates[i] = c; else db.templates.push(c);
            save(); editingTpl = null; render(); toast('「' + c.name + '」 서식을 저장했습니다. 이미 만든 회의록은 만들 때의 서식을 그대로 씁니다.');
          } }, '서식 저장'))]);
    }
    draw();
    return card;
  }

  /* ── 05 설정 ─────────────────────────────── */
  function viewSettings() {
    main.appendChild(pageHead('05 · 설정', '설정', 'AI 연결(로컬 LLM)은 선택입니다. 설정하지 않아도 반자동과 규칙 초안은 그대로 쓸 수 있습니다.'));
    main.appendChild(singleFileCard());
    main.appendChild(AIP.settingsCard({ toast: toast, onChange: topbar }));
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '로컬 LLM 준비(내 PC)'),
      h('ol', { class: 'flow' },
        h('li', null, 'Ollama(ollama.com) 또는 LM Studio(lmstudio.ai)를 설치합니다. 회사 PC 라면 설치 가능 여부를 IT 에 먼저 확인해 주세요.'),
        h('li', null, '한국어를 잘 하는 모델을 받습니다. 예) 명령 창에서 ', h('code', null, 'ollama pull qwen3:8b'), ' (PC 메모리 16GB 이상 권장. 8GB 면 더 작은 모델)'),
        h('li', null, '위 「HTML 한 파일로 받기」로 받은 파일을 더블클릭해 엽니다(file://). 위 「서버 종류」에서 Ollama 를 고르고 「모델 목록 불러오기」 → 모델 고르기 → 「저장」.'),
        h('li', null, '「01 메모 → 회의록」의 「설정한 AI 서버로」 탭에서 보내기. LM Studio 는 Developer 화면에서 서버를 켜고 「Enable CORS」를 켭니다. Ollama 가 연결을 거절하면 환경 변수 OLLAMA_ORIGINS 에 허용할 출처를 넣고 다시 켭니다.')),
      h('p', { class: 'note' }, '로컬 LLM 은 메모가 PC 밖으로 나가지 않지만, 작은 모델은 담당 · 기한을 틀리기 쉽습니다. 편집 화면의 「확인 필요」 표시를 꼭 살펴 주세요.')));

    var always = h('textarea', { class: 'input', rows: 3, placeholder: '예) 팀원 이름을 쉼표로' });
    always.value = db.maskNames.join(', ');
    var md = h('input', { type: 'checkbox', checked: db.maskDefault });
    var km = h('input', { type: 'checkbox', checked: db.keepMemo });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '이름 가리기 · 메모 저장'),
      h('label', { class: 'opt' }, md, h('span', null, '새 메모는 이름 가리기를 켠 채로 시작')),
      h('label', { class: 'opt', style: 'margin-top:6px' }, km, h('span', null, '회의록에 메모 원문도 저장(메모 근거 점검 · 대조에 씀). 끄면 정리한 결과만 남습니다.')),
      fld('늘 가릴 이름', always, '메모에 이 이름이 있으면 자동으로 가릴 목록에 넣습니다. 참석자 줄에 없는 사람(고객 담당자 등)을 적어 두세요.', ''),
      h('div', { class: 'btn-row', style: 'margin-top:10px' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        db.maskNames = always.value.split(/[,，\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
        db.maskDefault = md.checked; db.keepMemo = km.checked; save(); toast('저장했습니다.');
      } }, '저장'))));

    var imp = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '백업 파일 고르기' });
    imp.addEventListener('change', function () {
      var f = imp.files && imp.files[0]; if (!f) return;
      f.text().then(function (t) {
        var j = JSON.parse(t);
        if (!j || j.app !== 'data10-10') throw new Error('이 도구의 백업 파일이 아닙니다.');
        if (!confirm('지금 저장된 서식 · 회의록을 백업 파일 내용으로 바꿀까요?')) return;
        db = L.cleanDb(j.db); save(); render(); toast('백업을 불러왔습니다(회의록 ' + db.minutes.length + '건).');
      }).catch(function (e) { toast('불러오지 못했습니다: ' + e.message, true); });
    });
    main.appendChild(h('section', { class: 'card' }, h('h2', null, '백업 · 옮기기'),
      h('p', { class: 'note' }, '회의록은 이 브라우저에만 있습니다. 브라우저 기록을 지우면 사라지니 가끔 백업 파일을 받아 두세요. 다른 PC 로 옮길 때도 씁니다. AI 키는 백업에 들어가지 않습니다.'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: function () { download('회의록요약_백업_' + todayIso() + '.json', new Blob([JSON.stringify({ app: 'data10-10', schema: L.SCHEMA, savedAt: new Date().toISOString(), db: db }, null, 1)], { type: 'application/json' })); } }, '백업 파일 받기(.json)'),
        h('label', { class: 'btn' }, '백업 불러오기', h('span', { hidden: true }, imp)),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: function () {
          if (!confirm('서식 · 회의록 · 작성 중 메모를 모두 지울까요? 되돌릴 수 없습니다.')) return;
          db = L.cleanDb(null); draft = emptyDraft(); save(); saveDraft(); render(); toast('모두 지웠습니다.');
        } }, '모두 지우기'))));
  }

  /* HTML 한 파일 — 회사 보안으로 웹 주소가 막힐 수 있어(2026-11-10 요청) 사내 PC 에 저장해 두고 더블클릭해 씁니다(설치 · exe 없음) */
  function singleFileCard() {
    var steps = h('ol', { class: 'flow' },
      h('li', null, '아래 단추로 ', h('code', null, SINGLE_NAME), ' 한 파일을 받아 PC 의 알맞은 폴더(예: 문서\\회의록)에 둡니다. 인터넷이 되는 PC 에서 받아 사내 메일 · USB 로 옮겨도 됩니다.'),
      h('li', null, '파일을 더블클릭하면 브라우저(Edge · Chrome)로 열립니다. 설치 · 실행 파일(exe)이 없고, 로그인 없이 바로 씁니다. 외부 주소를 부르지 않습니다.'),
      h('li', null, '회의록 · 서식은 그 PC 의 그 브라우저 안에만 저장됩니다. 다른 브라우저로 열면 빈 화면에서 시작하니, PC 를 바꿀 때는 아래 「백업 · 옮기기」의 JSON 으로 옮깁니다.'),
      h('li', null, '새 판으로 바꿀 때는 새 파일을 같은 이름 · 같은 폴더에 덮어쓰고 다시 엽니다. 같은 브라우저로 열면 쌓아 둔 회의록이 그대로 이어집니다. 바꾸기 전에 JSON 백업을 한 번 받아 두세요.'),
      h('li', null, 'AI 자동 보내기: 내 PC 의 로컬 LLM(Ollama · LM Studio)은 그대로 쓸 수 있습니다. 사내 AI 서버는 파일에서 오는 요청(Origin: null)을 허용(CORS)해야 하므로, 막히면 반자동(프롬프트 복사 · 붙여 넣기)을 쓰세요.'));
    return h('section', { class: 'card', id: 'singleCard' }, h('h2', null, 'HTML 한 파일로 쓰기 (내 PC · 설치 없음)'),
      SINGLE ? h('p', { class: 'alert info' }, '지금 열린 것이 HTML 한 파일 판입니다(판 ' + APP_VERSION + '). 새 판은 인터넷이 되는 PC 에서 이 도구 사이트(처음 이 파일을 받은 주소)를 열어 「설정 → HTML 한 파일로 받기」로 받습니다.')
        : h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', id: 'singleDownload', href: 'dist/' + SINGLE_NAME, download: SINGLE_NAME }, 'HTML 한 파일로 받기 (판 ' + APP_VERSION + ')')),
      steps,
      h('p', { class: 'note' }, '실행 파일(exe)이 꼭 필요하면 리포의 tools/local-exe 에 PyInstaller 「폴더형 · 아카이브 없음(--onedir --noarchive)」으로 만드는 순서가 있습니다. 회사 보안 프로그램에 따라 이것도 막힐 수 있어 HTML 한 파일을 먼저 권합니다.'));
  }

  /* ── 길잡이 ───────────────────────────────── */
  function render() {
    leaveGuard = null;
    var hash = location.hash.replace(/^#\/?/, '') || 'home';
    var parts = hash.split('?'), path = parts[0].split('/'), id = path[0];
    main.innerHTML = '';
    nav(id === 'edit' ? 'list' : id);
    topbar();
    if (id === 'write') viewWrite();
    else if (id === 'edit') viewEdit(path[1]);
    else if (id === 'list') viewList();
    else if (id === 'actions') viewActions(parts[1]);
    else if (id === 'templates') viewTemplates();
    else if (id === 'settings') viewSettings();
    else viewHome();
  }
  var lastHash = location.hash;
  window.addEventListener('hashchange', function () {
    if (leaveGuard && leaveGuard() && !confirm('저장하지 않은 고친 내용이 있습니다. 이동할까요?')) { history.replaceState(null, '', lastHash); return; }
    lastHash = location.hash;
    render(); main.focus({ preventScroll: true }); window.scrollTo(0, 0);
  });
  render();
})();
