/* data10-10 · 회의록 요약 도우미 — 순수 로직 (화면·저장소와 무관, node 로도 불러 씀)

   하는 일
   · 서식(회의록 양식) — 기본 3종, 서식 글(워드 양식에서 뽑은 글)로 새 서식 만들기
   · 이름 가리기 — 메모 속 사람 이름을 「인물1」 처럼 바꿔 보내고, AI 답은 다시 이름으로 되돌림
   · AI 프롬프트 만들기(서식 + 메모 + 규칙) → AI 답(JSON 또는 「제목: 내용」 묶음) 읽어 서식 칸 채우기
   · AI 없이 규칙으로 초안 — 결정/할 일/담당/기한 줄을 낱말과 날짜 모양으로 찾음
   · 메모 근거 점검 — 메모에 없는 담당자·기한·결정 문장은 「확인 필요」
   · Action Item 모아 보기(기한 지남 표시), 글·HTML(Word·인쇄) 만들기, .docx 본문 XML → 글

   클래식 스크립트(UMD) — 브라우저에서는 window.MinutesLogic, node 에서는 require. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MinutesLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* 판(版) — index.html 의 ?v= · app.js 의 APP_VERSION 과 같아야 합니다(scripts/bump-version.mjs 로 함께 올림).
     브라우저가 옛 logic.js 와 새 app.js 를 섞어 쓰면 app.js 가 이 값을 보고 계산을 멈춥니다. */
  var VERSION = '2026-11-11.7';

  var SCHEMA = 1;

  function str(v) { return v == null ? '' : String(v); }
  function trim(v) { return str(v).replace(/^[\s 　]+|[\s 　]+$/g, ''); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function escRe(s) { return str(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function escHtml(s) {
    return str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* 칸 이름 비교용 — 띄어쓰기·기호를 떼고 소문자 */
  function normLabel(s) { return trim(s).toLowerCase().replace(/[\s·.\-_/()（）\[\]【】<>「」『』:：*#■□●○◆◇▶▷►•‣•&+,]/g, ''); }

  /* ── 1. 칸의 역할 ─────────────────────────────────────────────
     서식의 칸마다 「역할(role)」이 있어야 규칙 초안이 어디에 무엇을 넣을지 압니다.
     칸 이름이 회사마다 달라도(「결론」·「합의 사항」) 같은 역할로 알아보게 동의어를 둡니다. */
  var ROLES = {
    title:      { label: '회의명',        type: 'text',    syn: ['회의명', '회의제목', '제목', '회의주제', '주제', '회의명칭', '건명'] },
    datetime:   { label: '일시',          type: 'text',    syn: ['일시', '회의일시', '날짜', '일자', '회의일', '회의일자', '시간', '회의시간', '일시장소'] },
    place:      { label: '장소',          type: 'text',    syn: ['장소', '회의실', '회의장소', '위치'] },
    attendees:  { label: '참석자',        type: 'text',    syn: ['참석자', '참석', '참석인원', '참여자', '배석자', '참가자', '참석대상'] },
    target:     { label: '대상',          type: 'text',    syn: ['시험대상', '검증대상', '대상', '점검대상', '대상제품', '시료', '대상과제', '과제명'] },
    agenda:     { label: '안건',          type: 'list',    syn: ['안건', '회의안건', '의제', '회의목적', '목적', '협의안건', '논의안건'] },
    discussion: { label: '논의 내용',     type: 'list',    syn: ['논의내용', '논의사항', '회의내용', '주요내용', '협의내용', '내용', '주요논의', '논의'] },
    results:    { label: '시험 결과',     type: 'list',    syn: ['시험결과', '검증결과', '시험항목결과', '시험항목', '결과', '측정결과', '평가결과'] },
    status:     { label: '진행 현황',     type: 'list',    syn: ['진행현황', '진행상황', '추진현황', '현황', '일정현황'] },
    issues:     { label: '이슈',          type: 'list',    syn: ['이슈', '이슈사항', '문제점', '불합격항목', '지연위험', '지연위험항목', '리스크', '위험', '특이사항', '문제'] },
    decisions:  { label: '결정 사항',     type: 'list',    syn: ['결정사항', '결정', '결론', '합의사항', '확정사항', '판정', '결정및판정', '판정결정'] },
    actions:    { label: 'Action Item',  type: 'actions', syn: ['actionitem', 'actionitems', 'action', '액션아이템', '할일', '조치사항', '후속조치', '담당기한', '실행항목', 'todo', '향후조치', '조치계획', '후속조치담당기한'] },
    next:       { label: '다음 회의',     type: 'text',    syn: ['다음회의', '차기회의', '향후일정', '다음일정', '재시험다음회의', '차기일정', '다음미팅'] },
    other:      { label: '기타',          type: 'para',    syn: ['기타', '비고', '참고'] }
  };
  var ROLE_KEYS = Object.keys(ROLES);
  var SYN_INDEX = (function () {
    var idx = {};
    ROLE_KEYS.forEach(function (r) { ROLES[r].syn.forEach(function (s) { idx[normLabel(s)] = r; }); });
    return idx;
  })();
  /* 칸 이름 → 역할. 정확히 같은 동의어가 우선, 없으면 동의어를 포함하는지(긴 것부터) */
  function guessRole(label) {
    var n = normLabel(label);
    if (!n) return 'other';
    if (SYN_INDEX[n]) return SYN_INDEX[n];
    var best = '', bestLen = 0;
    Object.keys(SYN_INDEX).forEach(function (s) {
      if (s.length >= 2 && s.length > bestLen && n.indexOf(s) >= 0) { best = SYN_INDEX[s]; bestLen = s.length; }
    });
    return best || 'other';
  }
  function typeOfRole(role) { return (ROLES[role] || ROLES.other).type; }

  /* ── 2. 서식 ──────────────────────────────────────────────── */
  function field(key, label, role, hint) {
    return { key: key, label: label, role: role, type: typeOfRole(role), hint: hint || '' };
  }
  var DEFAULT_TEMPLATES = [
    {
      id: 'general', name: '일반 회의', builtin: true,
      desc: '주간 회의·협의처럼 안건을 논의하고 결정·할 일을 남기는 회의',
      fields: [
        field('title', '회의명', 'title'), field('datetime', '일시', 'datetime'), field('place', '장소', 'place'),
        field('attendees', '참석자', 'attendees'), field('agenda', '안건', 'agenda'),
        field('discussion', '논의 내용', 'discussion'), field('decisions', '결정 사항', 'decisions'),
        field('actions', 'Action Item', 'actions', '할 일 · 담당 · 기한'), field('next', '다음 회의', 'next')
      ]
    },
    {
      id: 'test-review', name: '시험·검증 결과 리뷰', builtin: true,
      desc: '시험·검증 결과를 놓고 합격/불합격·재시험·개선을 정하는 회의',
      fields: [
        field('title', '회의명', 'title'), field('datetime', '일시', 'datetime'), field('attendees', '참석자', 'attendees'),
        field('target', '시험 대상', 'target', '제품·시료·사양'), field('results', '시험 항목·결과', 'results'),
        field('issues', '이슈·불합격 항목', 'issues'), field('decisions', '판정·결정 사항', 'decisions'),
        field('actions', 'Action Item', 'actions', '할 일 · 담당 · 기한'), field('next', '재시험·다음 회의', 'next')
      ]
    },
    {
      id: 'schedule', name: '일정 점검', builtin: true,
      desc: '과제·시험 일정의 진행 현황과 지연·위험을 점검하는 회의',
      fields: [
        field('title', '회의명', 'title'), field('datetime', '일시', 'datetime'), field('attendees', '참석자', 'attendees'),
        field('target', '점검 대상', 'target', '과제·시험 일정'), field('status', '진행 현황', 'status'),
        field('issues', '지연·위험 항목', 'issues'), field('decisions', '결정 사항', 'decisions'),
        field('actions', 'Action Item', 'actions', '할 일 · 담당 · 기한'), field('next', '다음 점검', 'next')
      ]
    }
  ];
  function defaultTemplates() { return clone(DEFAULT_TEMPLATES); }

  /* 서식 다듬기 — 저장·불러오기 때. 칸 key 겹침·빈 이름을 정리합니다 */
  function cleanTemplate(t) {
    t = t && typeof t === 'object' ? t : {};
    var out = { id: trim(t.id) || ('tpl-' + Date.now().toString(36)), name: trim(t.name) || '이름 없는 서식', desc: trim(t.desc), builtin: !!t.builtin, fields: [] };
    var seen = {};
    (Array.isArray(t.fields) ? t.fields : []).forEach(function (f, i) {
      if (!f) return;
      var label = trim(f.label); if (!label) return;
      var role = ROLES[f.role] ? f.role : guessRole(label);
      var type = ['text', 'para', 'list', 'actions'].indexOf(f.type) >= 0 ? f.type : typeOfRole(role);
      var key = trim(f.key) || ('f' + (i + 1));
      while (seen[key]) key += '_';
      seen[key] = true;
      out.fields.push({ key: key, label: label, role: role, type: type, hint: trim(f.hint) });
    });
    return out;
  }

  /* 서식 글 → 서식. 워드 양식에서 뽑은 글이나 붙여 넣은 글에서 칸 이름을 찾습니다.
     「회의명:」 「1. 결정 사항」 「■ 참석자」 「[Action Item]」, 표 행 「일시 |  | 장소 | 」 모두 받습니다. */
  function templateFromText(text, name) {
    var labels = [];
    function push(l) {
      l = trim(l).replace(/^[\s\-–*•·○●■□◆◇▶▷►☐☑✔\d]+[.)]?\s*/, '').replace(/\s*[:：]\s*$/, '');
      l = trim(l.replace(/^\[|\]$/g, '').replace(/^【|】$/g, '').replace(/^\*\*|\*\*$/g, ''));
      if (!l || l.length > 24) return;
      if (/\d/.test(l) && /^[\d\s\-.:/~()년월일시분]+$/.test(l)) return;           // 날짜·숫자만
      if (!/[가-힣A-Za-z]/.test(l)) return;
      if (/회의록$/.test(l.replace(/\s/g, '')) && !labels.length) return; // 문서 제목 「○○ 회의록」
      var n = normLabel(l);
      if (labels.some(function (x) { return normLabel(x) === n; })) return;
      labels.push(l);
    }
    str(text).split(/\r?\n/).forEach(function (line) {
      var t = trim(line); if (!t) return;
      if (t.indexOf('|') >= 0) {
        // 양식 표: 「칸 이름 | (빈 칸) | 칸 이름 | (빈 칸)」 — 뒤가 빈 칸이거나 알려진 칸 이름이면 칸 이름으로
        var raw = t.split('|').map(trim);
        raw.forEach(function (c, i) {
          if (!c || c.length > 16) return;
          if (raw[i + 1] === '' || i === raw.length - 1 && raw.filter(Boolean).length === 1 || guessRole(c) !== 'other' || /[:：]$/.test(c)) push(c);
        });
        return;
      }
      var m = /^(.{1,24}?)\s*[:：]/.exec(t);
      if (m) { push(m[1]); return; }
      if (t.length <= 24) push(t);
    });
    var tpl = { id: 'tpl-' + Date.now().toString(36), name: trim(name) || '내 서식', desc: '서식 글에서 만든 서식', fields: [] };
    labels.forEach(function (l, i) {
      var role = guessRole(l);
      tpl.fields.push({ key: 'f' + (i + 1), label: l, role: role, type: typeOfRole(role), hint: '' });
    });
    return cleanTemplate(tpl);
  }

  function emptyValue(f) { return f.type === 'list' || f.type === 'actions' ? [] : ''; }
  function emptyValues(tpl) {
    var v = {};
    (tpl.fields || []).forEach(function (f) { v[f.key] = emptyValue(f); });
    return v;
  }

  /* ── 3. 날짜 ──────────────────────────────────────────────── */
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function dateFromIso(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trim(s));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
  }
  function makeDate(y, mo, da) {
    var d = new Date(y, mo - 1, da);
    return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === da ? d : null;
  }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; }
  var DOW = { '월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5, '일': 6 };   // 월요일 시작
  function mondayOf(d) { return addDays(d, -((d.getDay() + 6) % 7)); }

  /* 글 속 첫 날짜 찾기 → { iso, raw, index } 또는 null. base(Date)는 상대 날짜(「다음 주 금요일」)와 연도 없는 날짜의 기준 */
  function findDate(text, base) {
    var s = str(text);
    base = base instanceof Date ? base : (dateFromIso(base) || new Date());
    var y0 = base.getFullYear();
    var cands = [];
    function add(re, fn) {
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(s))) {
        var d = fn(m);
        if (d) { cands.push({ iso: isoOf(d), raw: m[0], index: m.index + (m[0].length - m[0].replace(/^[^0-9가-힣]+/, '').length) }); }
        if (!re.global) break;
      }
    }
    // 2026-10-20 · 2026.10.20 · 2026/10/20 · 2026년 10월 20일
    add(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/g, function (m) { return makeDate(+m[1], +m[2], +m[3]); });
    // 26.10.20 (두 자리 연도)
    add(/(^|[^\d.])(\d{2})\.(\d{1,2})\.(\d{1,2})(?![\d.])/g, function (m) { return makeDate(2000 + (+m[2]), +m[3], +m[4]); });
    // 10월 20일
    add(/(^|[^\d])(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, function (m) { return makeDate(y0, +m[2], +m[3]); });
    // 10/20 · 10.20 (앞뒤에 숫자·점이 없을 때만 — 1.5배·3.2% 같은 수와 헷갈리지 않게)
    add(/(^|[\s~(（,·:\[<-])(\d{1,2})[/.](\d{1,2})(?![\d./%])(?!\s*(?:배|%|점|mm|kg|v|a|hz|g|℃|도))/gi, function (m) {
      var mo = +m[2], da = +m[3];
      if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
      return makeDate(y0, mo, da);
    });
    // 오늘 · 내일 · 모레
    add(/(오늘|금일|내일|명일|모레)/g, function (m) { return addDays(base, { '오늘': 0, '금일': 0, '내일': 1, '명일': 1, '모레': 2 }[m[1]]); });
    // 이번 주 금요일 · 다음 주 화요일 · 차주 수 · 금주 금요일
    add(/(이번\s*주|금주|이번주|다음\s*주|차주|다다음\s*주)\s*([월화수목금토일])(요일)?/g, function (m) {
      var w = m[1].replace(/\s/g, '');
      var off = /다다음/.test(w) ? 14 : (/다음|차주/.test(w) ? 7 : 0);
      return addDays(mondayOf(base), off + DOW[m[2]]);
    });
    // 금요일까지 (주 표시 없이) — 기준일과 같거나 뒤의 가장 가까운 그 요일
    add(/(^|[^가-힣])([월화수목금토일])요일/g, function (m) {
      var target = DOW[m[2]], cur = (base.getDay() + 6) % 7;
      return addDays(base, (target - cur + 7) % 7);
    });
    // 3일 후 · 2주 뒤
    add(/(\d{1,2})\s*(일|주)\s*(후|뒤|이내|내)/g, function (m) { return addDays(base, +m[1] * (m[2] === '주' ? 7 : 1)); });
    if (!cands.length) return null;
    cands.sort(function (a, b) { return a.index - b.index || b.raw.length - a.raw.length; });
    // 같은 자리에서 겹치는 후보(「이번 주 금요일」 안의 「금요일」)는 긴 것 하나만
    return cands[0];
  }
  function parseDate(text, base) { var f = findDate(text, base); return f ? f.iso : ''; }
  function findTime(text) {
    var s = str(text), m;
    if ((m = /(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/.exec(s))) {
      var h = +m[2] % 12 + (m[1] === '오후' ? 12 : 0);
      return pad2(h) + ':' + (m[4] ? '30' : pad2(+(m[3] || 0)));
    }
    if ((m = /(^|[^\d])([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?!\d)/.exec(s))) return pad2(+m[2]) + ':' + m[3];
    if ((m = /(^|[^\d])(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?(?![가-힣]*간)/.exec(s)) && +m[2] <= 23) return pad2(+m[2]) + ':' + pad2(+(m[3] || 0));
    return '';
  }

  /* ── 4. 이름 찾기·가리기 ──────────────────────────────────── */
  var TITLES = ['책임연구원', '선임연구원', '수석연구원', '연구원', '책임', '선임', '수석', '매니저', '프로', '팀장', '파트장', '파트리더', '그룹장', '실장', '센터장', '부장', '차장', '과장', '대리', '주임', '사원', '팀원', '님', '씨', '상무', '전무', '이사'];
  var TITLE_RE = TITLES.slice().sort(function (a, b) { return b.length - a.length; }).map(escRe).join('|');
  // 이름처럼 보여도 이름이 아닌 낱말(직무·부서·흔한 명사)
  var NOT_NAME = /^(제품|검증|품질|시험|신뢰|개발|설계|생산|구매|영업|기술|연구|담당|전체|팀원|참석|회의|각자|본인|해당|다음|이번|금주|차주|관련|고객|협력|외부|내부|우리|모두|일정|결과|진행|확인|공유|보고|요청|기한|검토|양산|시료|선행|평가|기구|전장|소프트|하드|인증|모든|각팀|팀|파트|그룹|센터|부서|담당자|책임자)$/;
  function looksName(s) { return /^[가-힣]{2,4}$/.test(s) && !NOT_NAME.test(s); }
  /* 메모에서 이름 후보 — 참석자 줄의 이름과 「○○○ 책임/선임/님」·「@○○○」·「담당: ○○○」 */
  function detectNames(text) {
    var s = str(text), found = [];
    function add(n) { n = trim(n); if (looksName(n) && found.indexOf(n) < 0) found.push(n); }
    s.split(/\r?\n/).forEach(function (line) {
      var m = /^\s*[\-*•·■\[]?\s*(참석자?|참석\s*인원|참여자|attendees?)\s*[\]:：]?\s*(.+)$/i.exec(line);
      if (m) {
        m[2].replace(/\(.*?\)/g, ' ').split(/[,，、/·;]|\s+외\s+\d+\s*명?|\s{2,}/).forEach(function (tok) {
          var t = trim(tok).replace(new RegExp('\\s*(' + TITLE_RE + ')$'), '');
          t = trim(t.split(/\s+/)[0] || '');
          add(t);
        });
      }
    });
    var re = new RegExp('([가-힣]{2,4})\\s?(' + TITLE_RE + ')(?![가-힣])', 'g'), m2;
    while ((m2 = re.exec(s))) add(m2[1]);
    var re2 = /@([가-힣]{2,4})/g;
    while ((m2 = re2.exec(s))) add(m2[1]);
    var re3 = /담당(?:자)?\s*[:：]?\s*([가-힣]{2,4})/g;
    while ((m2 = re3.exec(s))) add(m2[1]);
    return found;
  }
  /* 이름 → 「인물N」. names 는 순서대로 번호를 받습니다(같은 이름 = 늘 같은 번호). 긴 이름부터 바꿔 「김민」·「김민수」가 엉키지 않게 */
  function buildAliasMap(names) {
    var map = [], seen = {};
    (names || []).forEach(function (n) {
      n = trim(n); if (!n || seen[n]) return;
      seen[n] = true;
      map.push({ alias: '인물' + (map.length + 1), name: n });
    });
    return map;
  }
  function maskText(text, map) {
    var s = str(text);
    (map || []).slice().sort(function (a, b) { return b.name.length - a.name.length; }).forEach(function (p) {
      s = s.split(p.name).join('\u0000' + p.alias.replace('인물', '') + '\u0000');
    });
    return s.replace(/\u0000(\d+)\u0000/g, '인물$1');
  }
  function unmaskText(text, map) {
    var byNo = {};
    (map || []).forEach(function (p) { byNo[p.alias.replace('인물', '')] = p.name; });
    return str(text).replace(/인물\s?(\d+)(?!\d)/g, function (all, no) { return byNo[no] != null ? byNo[no] : all; });
  }
  function unmaskValues(values, map) {
    var out = {};
    Object.keys(values || {}).forEach(function (k) {
      var v = values[k];
      if (Array.isArray(v)) out[k] = v.map(function (x) {
        if (x && typeof x === 'object') { var o = {}; Object.keys(x).forEach(function (kk) { o[kk] = typeof x[kk] === 'string' ? unmaskText(x[kk], map) : x[kk]; }); return o; }
        return unmaskText(x, map);
      });
      else out[k] = typeof v === 'string' ? unmaskText(v, map) : v;
    });
    return out;
  }
  /* 가린 뒤에도 남은 이름 — 보내기 전에 마지막으로 점검 */
  function findLeaks(text, names) {
    var s = str(text);
    return (names || []).filter(function (n) { n = trim(n); return n && s.indexOf(n) >= 0; });
  }

  /* ── 5. 프롬프트 ──────────────────────────────────────────── */
  var TYPE_GUIDE = {
    text: '한 줄 글',
    para: '여러 줄 글',
    list: '문장 목록(배열). 한 항목 = 한 문장, 개조식',
    actions: '배열. 항목마다 {"할일": "…", "담당": "…", "기한": "YYYY-MM-DD 또는 메모 표현 그대로"}'
  };
  /* opts: { meetingDate: 'YYYY-MM-DD', masked: true/false, extraRules: [] } */
  function buildPrompt(tpl, memo, opts) {
    opts = opts || {};
    var f = tpl.fields || [];
    var skeleton = {};
    f.forEach(function (x) {
      skeleton[x.label] = x.type === 'actions' ? [{ '할일': '', '담당': '', '기한': '' }] : x.type === 'list' ? [''] : '';
    });
    var lines = [];
    lines.push('너는 제품검증팀의 회의록 작성 도우미야. 아래 [회의 메모]를 [회의록 서식]의 칸에 맞춰 정리해줘.');
    lines.push('');
    lines.push('[규칙]');
    lines.push('1. 메모에 적힌 사실만 써줘. 메모에 없는 담당자·기한·수치·결정은 지어내지 말고, 해당 칸은 비워 둬줘(글 칸은 "", 목록 칸은 []).');
    lines.push('2. 결정 사항에는 회의에서 정해진 것만, 논의 중이거나 미정인 것은 논의 내용에 넣어줘.');
    lines.push('3. Action Item 은 「누가 · 무엇을 · 언제까지」로 나눠줘. 담당이나 기한이 메모에 없으면 그 칸은 "" 로 둬줘.');
    lines.push('4. 기한은 날짜를 알 수 있으면 YYYY-MM-DD 로 써줘' + (opts.meetingDate ? ' (회의일은 ' + opts.meetingDate + ' 이야. 「다음 주 금요일」 같은 말은 회의일 기준으로 바꿔줘)' : '') + '. 알 수 없으면 메모 표현 그대로 써줘.');
    lines.push('5. 문장은 짧은 개조식으로(예: 「~ 확인」 「~ 하기로 함」), 같은 내용을 여러 칸에 되풀이하지 말아줘.');
    if (opts.masked) lines.push('6. 메모의 「인물1」 「인물2」 같은 표기는 사람 이름을 가린 것이야. 이름을 추측하지 말고 그 표기 그대로 써줘.');
    (opts.extraRules || []).forEach(function (r, i) { if (trim(r)) lines.push((opts.masked ? 7 : 6) + i + '. ' + trim(r)); });
    lines.push('');
    lines.push('[회의록 서식] — 칸 이름 : 쓰는 방법');
    f.forEach(function (x) {
      lines.push('- ' + x.label + ' : ' + TYPE_GUIDE[x.type] + (x.hint ? ' (' + x.hint + ')' : ''));
    });
    lines.push('');
    lines.push('[답 형식] 설명 없이 아래 JSON 하나만 답해줘. 키(칸 이름)는 그대로 둬줘.');
    lines.push(JSON.stringify(skeleton, null, 2));
    lines.push('');
    lines.push('[회의 메모]');
    lines.push('"""');
    lines.push(trim(memo));
    lines.push('"""');
    return lines.join('\n');
  }

  /* ── 6. AI 답 읽기 ───────────────────────────────────────────
     JSON(코드 블록·앞뒤 설명·끝 쉼표·둥근 따옴표가 섞여도) → 안 되면 「칸 이름: 내용」 묶음으로 읽습니다. */
  function stripThink(t) {
    var s = str(t).replace(/<think>[\s\S]*?<\/think>/gi, '');
    var c = s.toLowerCase().lastIndexOf('</think>');
    if (c >= 0) s = s.slice(c + 8);
    return s;
  }
  function looseJson(text) {
    var s = stripThink(text);
    var fence = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(s);
    if (fence) s = fence[1];
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    var body = s.slice(a, b + 1);
    var tries = [body,
      body.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),
      body.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1'),
      body.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1').replace(/\/\/[^\n"]*$/gm, '')];
    for (var i = 0; i < tries.length; i++) {
      try { var j = JSON.parse(tries[i]); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch (e) { /* 다음 */ }
    }
    return null;
  }
  /* 답의 키 → 서식 칸. 칸 key · 칸 이름 · 같은 역할의 동의어 순으로 */
  function matchField(tpl, key) {
    var n = normLabel(key), f = tpl.fields || [], i;
    for (i = 0; i < f.length; i++) if (normLabel(f[i].key) === n || normLabel(f[i].label) === n) return f[i];
    var role = guessRole(key);
    if (role !== 'other') { for (i = 0; i < f.length; i++) if (f[i].role === role) return f[i]; }
    for (i = 0; i < f.length; i++) if (n.length >= 2 && (normLabel(f[i].label).indexOf(n) >= 0 || n.indexOf(normLabel(f[i].label)) >= 0)) return f[i];
    return null;
  }
  var BULLET_RE = /^\s*(?:[-–*•·○●■□◆◇▶▷►☐☑✔✓→>]+|\d{1,2}[.)]|[가-하][.)]|\(\d{1,2}\)|[①-⑳])\s*/;
  function stripBullet(s) { return trim(str(s).replace(BULLET_RE, '')); }
  function isBlankish(s) { return /^(없음|해당\s*없음|미정|n\/a|na|none|-|—|\(메모에\s*없음\)|메모에\s*없음|정보\s*없음)$/i.test(trim(s)); }
  function toList(v) {
    if (v == null) return [];
    if (Array.isArray(v)) {
      var out = [];
      v.forEach(function (x) {
        if (x && typeof x === 'object') x = Object.keys(x).map(function (k) { return x[k]; }).filter(function (y) { return trim(y); }).join(' — ');
        toList(String(x)).forEach(function (y) { out.push(y); });
      });
      return out;
    }
    return str(v).split(/\r?\n/).map(stripBullet).filter(function (x) { return x && !isBlankish(x); });
  }
  function toText(v) {
    if (Array.isArray(v)) return toList(v).join(', ');
    if (v && typeof v === 'object') return Object.keys(v).map(function (k) { return v[k]; }).join(' ');
    var t = trim(v);
    return isBlankish(t) ? '' : t;
  }
  function pick(o, names) {
    var keys = Object.keys(o || {});
    for (var i = 0; i < names.length; i++) {
      for (var j = 0; j < keys.length; j++) if (normLabel(keys[j]) === normLabel(names[i])) return o[keys[j]];
    }
    return undefined;
  }
  var TASK_KEYS = ['할일', 'task', '내용', '조치', '조치내용', 'item', 'action', '업무', '항목', 'todo', 'what'];
  var OWNER_KEYS = ['담당', '담당자', 'owner', 'who', 'assignee', '책임자', '주관'];
  var DUE_KEYS = ['기한', '마감', '마감일', 'due', 'duedate', 'deadline', '일정', '완료예정일', '목표일', 'when', '완료일'];
  function normAction(a, base) {
    var task = trim(a.task), owner = trim(a.owner), due = trim(a.due);
    if (isBlankish(owner)) owner = '';
    if (isBlankish(due)) due = '';
    var iso = due ? parseDate(due, base) : '';
    return { task: task, owner: owner, due: iso || due, done: !!a.done };
  }
  /* 한 줄 글 → 할 일. 「내용 (담당: 김가상, 기한: 10/24)」 「내용 / 김가상 / 10/24」 「| 내용 | 담당 | 기한 |」 */
  function actionFromLine(line, base, knownNames) {
    var s = stripBullet(line);
    if (!s) return null;
    if (s.indexOf('|') >= 0) {
      var cells = s.split('|').map(trim).filter(function (c, i, arr) { return !(c === '' && (i === 0 || i === arr.length - 1)); });
      if (cells.every(function (c) { return /^:?-{2,}:?$/.test(c) || !c; })) return null;            // 표 구분선
      if (cells.some(function (c) { return /^(할\s*일|담당자?|기한|no\.?|번호|내용)$/i.test(c); }) && cells.length >= 2 && !cells.some(function (c) { return findDate(c, base); })) return null; // 표 머리
      cells = cells.filter(function (c) { return !/^\d{1,2}$/.test(c); });
      var dc = -1, oc = -1;
      cells.forEach(function (c, i) { if (dc < 0 && /^[\s~]*$/.test(c.replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[/.]\d{1,2}|\d{1,2}월\s*\d{1,2}일|미정|추후|[이다음금차]*\s*주\s*[월화수목금토일]요?일?|까지/g, ''))) dc = i; });
      cells.forEach(function (c, i) { if (oc < 0 && i !== dc && (looksName(c.replace(new RegExp('\\s*(' + TITLE_RE + ')$'), '')) || /^인물\d+/.test(c))) oc = i; });
      var rest = cells.filter(function (c, i) { return i !== dc && i !== oc; });
      return normAction({ task: rest.join(' '), owner: oc >= 0 ? cells[oc] : '', due: dc >= 0 ? cells[dc] : '' }, base);
    }
    var ex = extractOwnerDue(s, base, knownNames);
    return normAction({ task: ex.task, owner: ex.owner, due: ex.dueRaw ? ex.dueRaw : '' }, base);
  }
  function toActions(v, base, knownNames) {
    if (v == null) return [];
    var arr = Array.isArray(v) ? v : str(v).split(/\r?\n/);
    var out = [];
    arr.forEach(function (x) {
      if (x == null) return;
      if (typeof x === 'object' && !Array.isArray(x)) {
        var task = pick(x, TASK_KEYS), owner = pick(x, OWNER_KEYS), due = pick(x, DUE_KEYS);
        var a = normAction({ task: toText(task), owner: toText(owner), due: toText(due) }, base);
        if (a.task || a.owner || a.due) out.push(a);
        return;
      }
      if (!trim(x) || isBlankish(stripBullet(x))) return;
      var a2 = actionFromLine(String(x), base, knownNames);
      if (a2 && (a2.task || a2.owner)) out.push(a2);
    });
    return out;
  }
  function coerce(f, v, base, knownNames) {
    if (f.type === 'actions') return toActions(v, base, knownNames);
    if (f.type === 'list') return toList(v);
    if (f.type === 'para') return Array.isArray(v) ? toList(v).join('\n') : (isBlankish(v) ? '' : trim(v));
    return toText(v);
  }
  /* 「칸 이름: 내용」 묶음 읽기 — 줄 머리가 서식의 칸 이름(또는 같은 역할 동의어)이면 새 칸 시작 */
  function headingOf(tpl, line) {
    var t = trim(line);
    if (!t || /^[-–•·]\s|^\*\s|^\|/.test(t)) return null;   // 글머리 기호 줄 · 표 행은 내용
    var m = /^(?:#{1,6}\s*|\*\*|\[|【|<|■|□|●|○|◆|▶|►|\d{1,2}[.)]\s*|[가-하][.)]\s*)*\s*([^:：\]】>*]{1,24}?)\s*(?:\*\*|\]|】|>)?\s*(?:[:：]\s*(.*))?$/.exec(t);
    if (!m) return null;
    var label = trim(m[1]).replace(/\*\*$/, '');
    var rest = m[2] != null ? trim(m[2].replace(/^\*\*\s*/, '')) : null;
    var hasMark = /^(#|\*\*|\[|【|<|■|□|●|○|◆|▶|►|\d{1,2}[.)])/.test(t) || rest != null;
    if (!hasMark && t.length > 16) return null;
    var f = null, n = normLabel(label);
    (tpl.fields || []).forEach(function (x) { if (!f && (normLabel(x.label) === n || normLabel(x.key) === n)) f = x; });
    if (!f) { var role = SYN_INDEX[n]; if (role) (tpl.fields || []).forEach(function (x) { if (!f && x.role === role) f = x; }); }
    if (!f) return null;
    return { field: f, rest: rest };
  }
  function parseSections(tpl, text) {
    var lines = stripThink(text).replace(/```[a-z]*\n?|```/gi, '').split(/\r?\n/);
    var got = {}, cur = null;
    lines.forEach(function (line) {
      var h = headingOf(tpl, line);
      if (h) { cur = h.field.key; if (!got[cur]) got[cur] = []; if (h.rest) got[cur].push(h.rest); return; }
      if (cur && trim(line)) got[cur].push(line);
    });
    return got;
  }
  /* AI 답 → { values, format: 'json'|'sections'|'none', filled: [칸 key], unknownKeys: [] }
     opts: { meetingDate, aliasMap, knownNames } — aliasMap 이 있으면 「인물N」 을 이름으로 되돌립니다 */
  function parseAnswer(tpl, text, opts) {
    opts = opts || {};
    var base = dateFromIso(opts.meetingDate) || new Date();
    var values = emptyValues(tpl), filled = [], unknown = [], format = 'none';
    var j = looseJson(text);
    if (j) {
      format = 'json';
      Object.keys(j).forEach(function (k) {
        var f = matchField(tpl, k);
        if (!f) { unknown.push(k); return; }
        values[f.key] = coerce(f, j[k], base, opts.knownNames);
      });
    } else {
      var sec = parseSections(tpl, text);
      if (Object.keys(sec).length) format = 'sections';
      (tpl.fields || []).forEach(function (f) {
        if (!sec[f.key]) return;
        var raw = sec[f.key];
        values[f.key] = f.type === 'text' ? toText(raw.map(stripBullet).join(' ')) : coerce(f, raw.join('\n'), base, opts.knownNames);
      });
    }
    if (opts.aliasMap && opts.aliasMap.length) values = unmaskValues(values, opts.aliasMap);
    (tpl.fields || []).forEach(function (f) { if (!isEmptyValue(values[f.key])) filled.push(f.key); });
    return { values: values, format: format, filled: filled, unknownKeys: unknown };
  }
  function isEmptyValue(v) { return Array.isArray(v) ? v.length === 0 : !trim(v); }

  /* ── 7. 규칙 초안 (AI 없이) ───────────────────────────────── */
  var KW = {
    decision: /(결정|확정|합의|승인|채택|하기로|기로\s*함|으로\s*함|로\s*함|결론|판정|go\b|no-go|보류하기로|진행하기로|적용하기로)/i,
    actionMark: /^\s*(?:(?:AI|A\.I\.|TODO|To-?do|할\s*일|액션|action(?:\s*item)?|조치)\s*[:：)\]]|☐|□|\[\s\]|→)\s*/i,
    actionVerb: /(할\s*일|조치|요청|의뢰|준비|작성|공유|송부|회신|보고|제출|정리|업데이트|확인|검토\s*후|재시험|재측정|수정|반영|발송|전달|섭외|예약|주문|구매|분석|협의|문의|조율|챙기|받기|보내기|진행\s*예정|해\s*주세요|해주세요|부탁)/,
    next: /(다음\s*회의|차기\s*회의|차기회의|다음\s*미팅|다음\s*점검|next\s*meeting|후속\s*회의|재회의|재시험\s*일정)/i,
    attendees: /^\s*[\-*•·■\[]?\s*(참석자?|참석\s*인원|참여자|attendees?)\s*[\]:：]?\s*/i,
    place: /^\s*[\-*•·■\[]?\s*(장소|회의실|place)\s*[\]:：]?\s*/i,
    title: /^\s*[\-*•·■\[]?\s*(회의명|제목|회의\s*제목|주제|건명)\s*[\]:：]?\s*/i,
    datetime: /^\s*[\-*•·■\[]?\s*(일시|날짜|일자|회의일시?|시간)\s*[\]:：]?\s*/i,
    agenda: /^\s*[\-*•·■\[]?\s*(안건|의제|회의\s*목적|목적)\s*[\]:：]?\s*/i,
    target: /^\s*[\-*•·■\[]?\s*(시험\s*대상|검증\s*대상|점검\s*대상|대상|시료)\s*[\]:：]\s*/i,
    issue: /(이슈|문제|불합격|\bNG\b|미달|초과|불량|지연|리스크|위험|우려|부족|누락|고장|파손|크랙|균열|이상\s*발생|안\s*됨|못\s*함|차질)/i,
    result: /(결과|합격|불합격|\bOK\b|\bNG\b|PASS|FAIL|측정|시험\s*완료|만족|기준|이내|이상|이하|\d+(?:\.\d+)?\s*(?:%|mm|kg|N|V|A|Hz|G|℃|h|시간|회|cycle))/i,
    status: /(완료|(?:진행|작성|검토|준비|제작|시험)\s*중|착수|예정|대기|지연|%|공정률|진척|입고|출고|종료|시작)/
  };
  /* 줄 속 담당·기한 뽑기 → { owner, dueRaw, due, task } */
  function extractOwnerDue(line, base, knownNames) {
    var s = str(line), owner = '', dueRaw = '', m;
    // 담당
    if ((m = /담당(?:자)?\s*[:：]?\s*(인물\d+|[가-힣]{2,4}(?:\s?(?:책임연구원|선임연구원|수석연구원|책임|선임|수석|매니저|프로|팀장|파트장|과장|대리|차장|부장|주임|연구원))?)/.exec(s))) owner = m[1];
    else if ((m = /@(인물\d+|[가-힣]{2,4})/.exec(s))) owner = m[1];
    else if ((m = /(?:→|->|=>)\s*(인물\d+|[가-힣]{2,4})(?![가-힣])/.exec(s)) && ((knownNames || []).indexOf(m[1]) >= 0 || /^인물/.test(m[1]))) owner = m[1];
    else {
      var names = (knownNames || []).slice().sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < names.length && !owner; i++) { if (names[i] && s.indexOf(names[i]) >= 0) owner = names[i]; }
      if (!owner && (m = new RegExp('(인물\\d+|[가-힣]{2,4})\\s?(' + TITLE_RE + ')(?![가-힣])').exec(s)) && (looksName(m[1]) || /^인물/.test(m[1]))) owner = m[1];
      if (!owner && (m = /(^|\s)(인물\d+)(?!\d)/.exec(s))) owner = m[2];
    }
    owner = trim(owner.replace(new RegExp('\\s*(' + TITLE_RE + ')$'), ''));
    // 기한
    var f = null;
    if ((m = /(?:기한|마감|due|까지\s*[:：]|목표일|완료\s*예정일?)\s*[:：]?\s*([^,，;)\]]+)/i.exec(s))) f = findDate(m[1], base);
    if (!f) f = findDate(s, base);
    if (f) dueRaw = f.raw.replace(/^[^0-9가-힣]+/, '');
    // 할 일 글 — 표지·담당/기한 꼬리표·이름·기한 표현 떼기
    var task = stripBullet(s).replace(KW.actionMark, '');
    var SEP = '(?:\\s*[/|,，(（]\\s*|\\s+[-–]\\s+|\\s*(?:→|->|=>)\\s*|\\s+)';
    task = task.replace(/[,，/]?\s*담당(?:자)?\s*[:：]\s*[^,，/)）\]]*/g, '').replace(/[,，/]?\s*(?:기한|마감)\s*[:：]\s*[^,，)）\]]*/g, '');
    task = task.replace(/@(인물\d+|[가-힣]{2,4})/g, '');
    if (dueRaw) task = task.replace(new RegExp('[(（\\[]?\\s*[~∼]?\\s*' + escRe(dueRaw) + '\\s*(?:까지)?\\s*[)）\\]]?'), ' ');
    if (owner) {
      var on = escRe(owner), ot = '(?:\\s?(?:' + TITLE_RE + '))?';
      task = task.replace(new RegExp('^\\s*' + on + ot + '\\s*[:：,，]?\\s*'), '');                 // 「문태오: …」
      task = task.replace(new RegExp(SEP + on + ot + '(?=\\s*(?:[/|,，)）]|[-–]\\s|$))'), ' ');    // 「… / 이수아 / …」 「… - 한도윤 책임」
      task = task.replace(new RegExp('^\\s*' + on + ot + '(?![가-힣])\\s*'), '');
    }
    // 내용이 빈 괄호 「( , )」 · 끝에 남은 구분 기호
    task = task.replace(/[(（\[]\s*[,，/\s]*[)）\]]/g, ' ');
    task = trim(stripBullet(task)).replace(/\s{2,}/g, ' ').replace(/^[,，:：/|\-–→\s]+|[,，:：/|\-–→\s]+$/g, '');
    return { owner: owner, dueRaw: dueRaw, due: f ? f.iso : '', task: task };
  }

  /* 메모 머리(소제목) — 「[결정]」 「결정사항:」 「## 할 일」 「■ 논의」 처럼 내용 없이 칸 이름만 있는 줄 */
  function memoHeading(line) {
    var t = trim(line);
    var m = /^(?:#{1,6}\s*|\[|【|<|■|□|●|○|◆|▶|►|\*\*)?\s*([가-힣A-Za-z·\s/]{1,14}?)\s*(?:\]|】|>|\*\*)?\s*[:：]?\s*$/.exec(t);
    if (!m) return null;
    var role = SYN_INDEX[normLabel(m[1])];
    if (!role) return null;
    if (!/^(#|\[|【|<|■|□|●|○|◆|▶|►|\*\*)/.test(t) && !/[:：]\s*$/.test(t) && normLabel(m[1]).length > 6) return null;
    return role;
  }

  /* 규칙 초안: 메모 → 서식 값. opts: { meetingDate(없으면 메모에서), knownNames } → { values, meetingDate, used: { 줄번호: 역할 } } */
  function ruleDraft(tpl, memo, opts) {
    opts = opts || {};
    var lines = str(memo).split(/\r?\n/);
    var roles = {}; (tpl.fields || []).forEach(function (f) { if (!roles[f.role]) roles[f.role] = f; });
    var out = { title: '', datetime: '', place: '', attendees: '', target: '', next: '', agenda: [], discussion: [], results: [], status: [], issues: [], decisions: [], actions: [], other: [] };
    // 1) 회의일 — 「일시:」 줄, 없으면 앞 다섯 줄의 첫 날짜
    var meetingDate = trim(opts.meetingDate), dtLine = -1, i;
    for (i = 0; i < lines.length; i++) { if (KW.datetime.test(lines[i]) && findDate(lines[i], new Date())) { dtLine = i; break; } }
    if (dtLine < 0) for (i = 0; i < Math.min(5, lines.length); i++) {
      var fd0 = findDate(lines[i].replace(/[~∼]\s*\d.*$/, ''), new Date());       // 앞부분의 숫자 날짜만(「다음 주 월요일부터」 같은 말은 회의일이 아님)
      if (fd0 && /\d/.test(fd0.raw) && !KW.next.test(lines[i]) && !KW.actionMark.test(lines[i])) { dtLine = i; break; }
    }
    if (!meetingDate && dtLine >= 0) meetingDate = parseDate(lines[dtLine], new Date());
    var base = dateFromIso(meetingDate) || new Date();
    if (dtLine >= 0) {
      var tm = findTime(lines[dtLine]);
      out.datetime = (parseDate(lines[dtLine], base) || '') + (tm ? ' ' + tm : '');
    } else if (meetingDate) out.datetime = meetingDate;
    var names = (opts.knownNames || []).slice();
    detectNames(memo).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });

    var section = null, used = {}, firstContent = -1;
    for (i = 0; i < lines.length; i++) {
      var raw = lines[i], t = trim(raw);
      if (!t) continue;
      if (/^(?:\(|（|\[)?\s*가상\s*(?:예시|메모|자료)/.test(t)) { used[i] = 'skip'; continue; }
      if (firstContent < 0) firstContent = i;
      var hd = memoHeading(t);
      if (hd) { section = hd; used[i] = 'heading'; continue; }
      var m;
      if (KW.title.test(t)) { out.title = trim(t.replace(KW.title, '')); used[i] = 'title'; continue; }
      if (i === dtLine || KW.datetime.test(t) && findDate(t, base)) {
        used[i] = 'datetime';
        var pm = /(?:장소|회의실)\s*[:：]?\s*([^,/|]+)/.exec(t);
        if (pm && !out.place) out.place = trim(pm[1]);
        // 첫 줄이 「10/20 제품검증 주간회의」 처럼 날짜 + 제목이면 제목도
        if (i === firstContent && !out.title) {
          var tt = trim(t.replace(KW.datetime, '').replace(/\d{4}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2}\s*일?|\d{1,2}\s*[/.]\s*\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|\([월화수목금토일]\)|(오전|오후)\s*\d{1,2}\s*시(\s*\d{1,2}\s*분|반)?|\d{1,2}:\d{2}(\s*[~-]\s*\d{1,2}:\d{2})?|(?:장소|회의실)\s*[:：]?\s*[^,/|]+/g, ''))
            .replace(/^[\s,/|·\-—–]+|[\s,/|·\-—–]+$/g, '');
          // 「제품검증팀 주간회의 / 3층 소회의실」 — 띄어 쓴 / · | 로 나뉜 조각 중 장소처럼 보이는 것은 장소로
          tt.split(/\s+[/|]\s+|\s*\|\s*|\s+[—–]\s+/).forEach(function (seg) {
            seg = trim(seg).replace(/^[\s,·\-—–]+|[\s,·\-—–]+$/g, '');
            if (!seg) return;
            if (/(회의실|회의장|\d+\s*층|강당|온라인|화상|zoom|teams|웹엑스|webex)/i.test(seg) && seg.length <= 20) { if (!out.place) out.place = seg; return; }
            if (!out.title && seg.length <= 40 && /[가-힣A-Za-z]{2,}/.test(seg)) out.title = seg;
          });
        }
        continue;
      }
      if (KW.attendees.test(t)) { out.attendees = trim(t.replace(KW.attendees, '')); used[i] = 'attendees'; continue; }
      if (KW.place.test(t)) { out.place = trim(t.replace(KW.place, '')); used[i] = 'place'; continue; }
      if (KW.target.test(t)) { out.target = trim(t.replace(KW.target, '')); used[i] = 'target'; continue; }
      if ((m = KW.agenda.exec(t)) && trim(t.replace(KW.agenda, ''))) {
        trim(t.replace(KW.agenda, '')).split(/\s*(?:[,，;]|\d[.)])\s*/).forEach(function (a) { a = stripBullet(a); if (a) out.agenda.push(a); });
        used[i] = 'agenda'; continue;
      }
      if (KW.next.test(t)) {
        var after = trim(t.replace(/^.*?(다음\s*회의|차기\s*회의|차기회의|다음\s*미팅|다음\s*점검|next\s*meeting|후속\s*회의|재회의)\s*(은|는|:|：)?\s*/i, ''));
        var nd = findDate(t, base), ntm = findTime(t);
        out.next = nd ? nd.iso + (ntm ? ' ' + ntm : '') + (after && after.replace(nd.raw, '').replace(/^[\s,:~]+/, '') ? ' (' + stripBullet(t) + ')' : '') : stripBullet(t);
        used[i] = 'next'; continue;
      }
      // 제목 — 첫 내용 줄이 짧고 표지가 없으면
      if (i === firstContent && !out.title && t.length <= 40 && !KW.decision.test(t) && !KW.actionMark.test(t) && !BULLET_RE.test(raw)) {
        out.title = t.replace(/^[#\s]+/, ''); used[i] = 'title'; continue;
      }
      var body = stripBullet(t);
      if (!body) continue;
      // 할 일 / 결정 / 그 밖
      var ex = extractOwnerDue(t, base, names);
      var marked = KW.actionMark.test(t) || section === 'actions';
      var explicitDec = /^(결정|결론|합의|판정|결정\s*사항)\s*[:：]/.test(body);
      var undecided = /(미정|보류\s*중|결정\s*못|결정되지|논의\s*필요|검토\s*중|\?\s*$)/.test(t);
      var isDecision = section === 'decisions' || explicitDec || (KW.decision.test(t) && !undecided);
      var isAction = marked || (!explicitDec && section !== 'decisions' && (ex.owner || ex.due) && KW.actionVerb.test(t) &&
        !(isDecision && !ex.owner) && !/^(?:결과|판정)\s*[:：]/.test(body));
      if (isAction) {
        out.actions.push(normAction({ task: ex.task || body, owner: ex.owner, due: ex.dueRaw }, base));
        used[i] = 'actions';
        if (!marked && isDecision && /(결정|확정|합의|하기로)/.test(t)) { out.decisions.push(body); used[i] = 'actions+decisions'; }
        continue;
      }
      if (isDecision) { out.decisions.push(body.replace(/^(결정|결론|합의|판정|결정\s*사항)\s*[:：]\s*/, '')); used[i] = 'decisions'; continue; }
      if (section && section !== 'decisions' && section !== 'actions' && out[section] && Array.isArray(out[section])) {
        out[section].push(body); used[i] = section;
        if (section === 'results' && roles.issues && /(불합격|\bNG\b|FAIL|미달|초과|크랙|균열|파손)/i.test(t)) out.issues.push(body);
        continue;
      }
      if (section && (section === 'title' || section === 'place' || section === 'attendees' || section === 'target' || section === 'next') && !out[section]) {
        out[section] = body; used[i] = section; continue;
      }
      // 소제목 없는 줄 — 서식에 그 칸이 있을 때만 결과/현황/이슈로 나눔, 나머지는 논의
      if (roles.results && KW.result.test(t)) { out.results.push(body); used[i] = 'results'; if (roles.issues && /(불합격|\bNG\b|FAIL|미달|초과|크랙|균열|파손)/i.test(t)) out.issues.push(body); continue; }
      if (roles.issues && KW.issue.test(t)) { out.issues.push(body); used[i] = 'issues'; continue; }
      if (roles.status && KW.status.test(t)) { out.status.push(body); used[i] = 'status'; continue; }
      out.discussion.push(body); used[i] = 'discussion';
    }
    // 2) 서식 칸에 담기 — 서식에 없는 역할의 내용은 가까운 칸으로
    var values = emptyValues(tpl);
    function spill(from, to) { if (!roles[from] && roles[to]) out[to] = out[to].concat(out[from]); }
    spill('results', 'discussion'); spill('status', 'discussion'); spill('issues', 'discussion'); spill('agenda', 'discussion');
    spill('discussion', 'results'); spill('discussion', 'status');
    if (!roles.target && out.target) { if (roles.discussion) out.discussion.unshift('대상: ' + out.target); }
    (tpl.fields || []).forEach(function (f) {
      var v = out[f.role];
      if (v == null) return;
      if (f.type === 'actions') values[f.key] = out.actions.slice();
      else if (f.type === 'list') values[f.key] = Array.isArray(v) ? v.slice() : (v ? [v] : []);
      else if (f.type === 'para') values[f.key] = Array.isArray(v) ? v.join('\n') : v;
      else values[f.key] = Array.isArray(v) ? v.join(', ') : v;
    });
    // 같은 역할 칸이 둘이면 둘째 칸은 비움(앞 칸에만)
    var seenRole = {};
    (tpl.fields || []).forEach(function (f) { if (seenRole[f.role] && f.role !== 'other') values[f.key] = emptyValue(f); seenRole[f.role] = true; });
    return { values: values, meetingDate: meetingDate, used: used };
  }

  /* ── 8. 메모 근거 점검 ─────────────────────────────────────── */
  function tokens(s) {
    return (str(s).toLowerCase().match(/[가-힣a-z0-9]+/g) || []).filter(function (w) { return w.length >= 2; });
  }
  function overlap(sentence, memo) {
    var ws = tokens(sentence);
    if (!ws.length) return 1;
    var m = str(memo).toLowerCase().replace(/\s+/g, '');
    var hit = ws.filter(function (w) { return m.indexOf(w) >= 0 || (w.length >= 3 && m.indexOf(w.slice(0, -1)) >= 0); }).length;
    return hit / ws.length;
  }
  /* 메모에 근거가 약한 값 — [{ key, label, index, kind, message }] */
  function traceCheck(tpl, values, memo, opts) {
    opts = opts || {};
    var base = dateFromIso(opts.meetingDate) || new Date();
    var memoDates = {}, s = str(memo), out = [];
    s.split(/\r?\n/).forEach(function (line) {
      var rest = line, guard = 0, f;
      while ((f = findDate(rest, base)) && guard++ < 10) { memoDates[f.iso] = true; rest = rest.slice(f.index + Math.max(1, f.raw.length)); }
    });
    (tpl.fields || []).forEach(function (fd) {
      var v = values[fd.key];
      if (fd.type === 'actions') {
        (v || []).forEach(function (a, i) {
          if (!trim(a.owner)) out.push({ key: fd.key, label: fd.label, index: i, kind: 'owner-missing', message: '담당이 비어 있습니다' });
          else if (s.indexOf(trim(a.owner).replace(new RegExp('\\s*(' + TITLE_RE + ')$'), '')) < 0) out.push({ key: fd.key, label: fd.label, index: i, kind: 'owner-not-in-memo', message: '담당 「' + a.owner + '」이(가) 메모에 없습니다' });
          if (!trim(a.due)) out.push({ key: fd.key, label: fd.label, index: i, kind: 'due-missing', message: '기한이 비어 있습니다' });
          else if (/^\d{4}-\d{2}-\d{2}$/.test(a.due) && !memoDates[a.due]) out.push({ key: fd.key, label: fd.label, index: i, kind: 'due-not-in-memo', message: '기한 ' + a.due + ' 이(가) 메모의 날짜 표현과 맞지 않습니다' });
          if (trim(a.task) && overlap(a.task, s) < 0.4) out.push({ key: fd.key, label: fd.label, index: i, kind: 'weak', message: '할 일 문장이 메모와 많이 다릅니다' });
        });
      } else if (fd.type === 'list' && (fd.role === 'decisions' || fd.role === 'results' || fd.role === 'issues')) {
        (v || []).forEach(function (x, i) {
          if (overlap(x, s) < 0.4) out.push({ key: fd.key, label: fd.label, index: i, kind: 'weak', message: '「' + x.slice(0, 30) + '」 — 메모와 많이 다릅니다(지어낸 내용인지 확인)' });
        });
      }
    });
    return out;
  }

  /* ── 9. 회의록 · Action Item 모아 보기 ────────────────────── */
  function newMinute(tpl, values, extra) {
    extra = extra || {};
    var now = new Date().toISOString();
    return {
      id: 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      template: clone(tpl), values: clone(values || emptyValues(tpl)),
      memo: str(extra.memo), method: extra.method || '', meetingDate: trim(extra.meetingDate),
      createdAt: now, updatedAt: now
    };
  }
  function minuteTitle(m) {
    var tpl = m.template || { fields: [] }, t = '';
    (tpl.fields || []).forEach(function (f) { if (!t && f.role === 'title') t = toText(m.values[f.key]); });
    return t || '(제목 없음)';
  }
  function minuteDate(m) {
    if (m.meetingDate) return m.meetingDate;
    var d = '';
    ((m.template || {}).fields || []).forEach(function (f) { if (!d && f.role === 'datetime') d = parseDate(m.values[f.key], new Date()); });
    return d || str(m.createdAt).slice(0, 10);
  }
  /* 모든 회의록의 할 일 → [{ minuteId, title, date, index, task, owner, due, done, overdue, daysLeft }] */
  function collectActions(minutes, todayIso) {
    var today = dateFromIso(todayIso) || new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var out = [];
    (minutes || []).forEach(function (m) {
      ((m.template || {}).fields || []).forEach(function (f) {
        if (f.type !== 'actions') return;
        (m.values[f.key] || []).forEach(function (a, i) {
          var d = dateFromIso(a.due);
          var left = d ? Math.round((d - today) / 86400000) : null;
          out.push({ minuteId: m.id, fieldKey: f.key, title: minuteTitle(m), date: minuteDate(m), index: i,
            task: str(a.task), owner: str(a.owner), due: str(a.due), done: !!a.done,
            overdue: !a.done && left != null && left < 0, daysLeft: left });
        });
      });
    });
    out.sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      var ad = dateFromIso(a.due) ? a.due : '9999', bd = dateFromIso(b.due) ? b.due : '9999';
      return ad < bd ? -1 : ad > bd ? 1 : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    });
    return out;
  }
  function actionSummary(list) {
    var s = { total: list.length, open: 0, done: 0, overdue: 0, dueSoon: 0, noDue: 0 };
    list.forEach(function (a) {
      if (a.done) s.done++; else s.open++;
      if (a.overdue) s.overdue++;
      if (!a.done && a.daysLeft != null && a.daysLeft >= 0 && a.daysLeft <= 3) s.dueSoon++;
      if (!a.done && a.daysLeft == null) s.noDue++;
    });
    return s;
  }

  /* ── 10. 내보내기 ─────────────────────────────────────────── */
  function toPlainText(tpl, values) {
    var out = [];
    (tpl.fields || []).forEach(function (f) {
      var v = values[f.key];
      if (f.type === 'actions') {
        out.push('■ ' + f.label);
        if (!v || !v.length) out.push('  (없음)');
        (v || []).forEach(function (a, i) {
          out.push('  ' + (i + 1) + '. ' + (a.task || '') + ' — 담당: ' + (a.owner || '미정') + ' / 기한: ' + (a.due || '미정') + (a.done ? ' [완료]' : ''));
        });
      } else if (f.type === 'list') {
        out.push('■ ' + f.label);
        if (!v || !v.length) out.push('  (없음)');
        (v || []).forEach(function (x) { out.push('  - ' + x); });
      } else if (f.type === 'para') {
        out.push('■ ' + f.label);
        out.push(trim(v) ? str(v).split('\n').map(function (x) { return '  ' + x; }).join('\n') : '  (없음)');
      } else out.push('■ ' + f.label + ' : ' + (trim(v) || ''));
    });
    return out.join('\n');
  }
  /* Word(.doc) · 인쇄용 HTML. 칸 이름 | 내용 의 2열 표, Action Item 은 번호·할 일·담당·기한·상태 표 */
  function toHtml(tpl, values, opts) {
    opts = opts || {};
    var title = opts.title || '회의록';
    var css = 'body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:10.5pt;color:#111;word-break:keep-all;overflow-wrap:break-word}' +
      'h1{font-size:16pt;text-align:center;margin:0 0 12pt}table{border-collapse:collapse;width:100%}' +
      'th,td{border:1px solid #777;padding:5pt 7pt;vertical-align:top;text-align:left}th{background:#eef2f7;width:22%;white-space:nowrap}' +
      'table.ai th{width:auto}ul{margin:0;padding-left:16pt}li{margin:0 0 2pt}.muted{color:#777}.foot{margin-top:10pt;color:#666;font-size:9pt}';
    var rows = (tpl.fields || []).map(function (f) {
      var v = values[f.key], cell;
      if (f.type === 'actions') {
        cell = v && v.length ? '<table class="ai"><tr><th>No</th><th>할 일</th><th>담당</th><th>기한</th><th>상태</th></tr>' +
          v.map(function (a, i) { return '<tr><td>' + (i + 1) + '</td><td>' + escHtml(a.task) + '</td><td>' + escHtml(a.owner || '미정') + '</td><td>' + escHtml(a.due || '미정') + '</td><td>' + (a.done ? '완료' : '진행') + '</td></tr>'; }).join('') + '</table>'
          : '<span class="muted">(없음)</span>';
      } else if (f.type === 'list') {
        cell = v && v.length ? '<ul>' + v.map(function (x) { return '<li>' + escHtml(x) + '</li>'; }).join('') + '</ul>' : '<span class="muted">(없음)</span>';
      } else if (f.type === 'para') {
        cell = trim(v) ? escHtml(v).replace(/\n/g, '<br>') : '<span class="muted">(없음)</span>';
      } else cell = escHtml(v);
      return '<tr><th>' + escHtml(f.label) + '</th><td>' + cell + '</td></tr>';
    }).join('');
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + escHtml(title) + '</title><style>' + css + '</style></head><body>' +
      '<h1>' + escHtml(title) + '</h1><table>' + rows + '</table>' +
      (opts.footer ? '<p class="foot">' + escHtml(opts.footer) + '</p>' : '') + '</body></html>';
  }
  function safeFileName(s) { return trim(s).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || '회의록'; }

  /* ── 11. Word(.docx) 본문 → 글 ──────────────────────────────
     JSZip 으로 푼 word/document.xml 을 받습니다. 문단 = 한 줄, 표 한 행 = 한 줄(칸은 「 | 」). data09-27 과 같은 규칙 */
  function decodeXml(s) {
    return str(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (a, n) { return String.fromCharCode(+n); }).replace(/&#x([0-9a-f]+);/gi, function (a, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&amp;/g, '&');
  }
  function docxPara(p) {
    var out = '', re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>|<w:cr\/>/g, m;
    while ((m = re.exec(p))) {
      if (m[1] != null) out += decodeXml(m[1]);
      else if (m[0] === '<w:tab/>') out += '\t';
      else out += '\n';
    }
    return out;
  }
  function docxXmlToText(xml) {
    var body = (/<w:body[^>]*>([\s\S]*)<\/w:body>/.exec(str(xml)) || [])[1] || str(xml);
    var out = [], re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g, m;
    while ((m = re.exec(body))) {
      var blk = m[0];
      if (blk.indexOf('<w:tbl>') === 0) {
        (blk.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).forEach(function (tr) {
          var cells = (tr.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || []).map(function (tc) {
            return trim((tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(docxPara).join(' '));
          });
          out.push(cells.join(' | '));
        });
      } else out.push(blk === '<w:p/>' ? '' : docxPara(blk));
    }
    return out.map(function (l) { return l.replace(/[ \t]+$/g, ''); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  /* 글 파일 바이트 → 글 (UTF-8, 깨지면 EUC-KR — 메모장 「ANSI」 저장) */
  function decodeText(bytes) {
    var t = new TextDecoder('utf-8').decode(bytes);
    if ((t.match(/�/g) || []).length > 2) { try { t = new TextDecoder('euc-kr').decode(bytes); } catch (e) { /* 그대로 */ } }
    return t.replace(/^﻿/, '');
  }

  /* ── 12. 저장 형식 ────────────────────────────────────────── */
  function cleanMinute(m) {
    if (!m || typeof m !== 'object' || !m.template) return null;
    var tpl = cleanTemplate(m.template), values = emptyValues(tpl), v = m.values || {};
    tpl.fields.forEach(function (f) {
      var x = v[f.key];
      if (f.type === 'actions') values[f.key] = (Array.isArray(x) ? x : []).map(function (a) { return { task: str(a && a.task), owner: str(a && a.owner), due: str(a && a.due), done: !!(a && a.done) }; });
      else if (f.type === 'list') values[f.key] = (Array.isArray(x) ? x : x ? [x] : []).map(str);
      else values[f.key] = Array.isArray(x) ? x.join(', ') : str(x);
    });
    return { id: str(m.id) || ('m-' + Date.now().toString(36)), template: tpl, values: values, memo: str(m.memo), method: str(m.method), meetingDate: str(m.meetingDate), createdAt: str(m.createdAt), updatedAt: str(m.updatedAt) };
  }
  function cleanDb(db) {
    db = db && typeof db === 'object' ? db : {};
    var tpls = Array.isArray(db.templates) && db.templates.length ? db.templates.map(cleanTemplate) : defaultTemplates();
    DEFAULT_TEMPLATES.forEach(function (d) { if (!tpls.some(function (t) { return t.id === d.id; })) tpls.push(clone(d)); });
    return {
      schema: SCHEMA,
      templates: tpls,
      minutes: (Array.isArray(db.minutes) ? db.minutes : []).map(cleanMinute).filter(Boolean),
      maskNames: (Array.isArray(db.maskNames) ? db.maskNames : []).map(trim).filter(Boolean),
      maskDefault: db.maskDefault !== false,
      keepMemo: db.keepMemo !== false
    };
  }

  return {
    VERSION: VERSION,
    SCHEMA: SCHEMA, ROLES: ROLES, ROLE_KEYS: ROLE_KEYS, DEFAULT_TEMPLATES: DEFAULT_TEMPLATES,
    normLabel: normLabel, guessRole: guessRole, typeOfRole: typeOfRole, defaultTemplates: defaultTemplates, cleanTemplate: cleanTemplate,
    templateFromText: templateFromText, emptyValues: emptyValues, emptyValue: emptyValue, isEmptyValue: isEmptyValue,
    isoOf: isoOf, dateFromIso: dateFromIso, findDate: findDate, parseDate: parseDate, findTime: findTime,
    detectNames: detectNames, buildAliasMap: buildAliasMap, maskText: maskText, unmaskText: unmaskText, unmaskValues: unmaskValues, findLeaks: findLeaks,
    buildPrompt: buildPrompt, looseJson: looseJson, parseAnswer: parseAnswer, parseSections: parseSections, toActions: toActions, actionFromLine: actionFromLine,
    extractOwnerDue: extractOwnerDue, ruleDraft: ruleDraft, traceCheck: traceCheck,
    newMinute: newMinute, minuteTitle: minuteTitle, minuteDate: minuteDate, collectActions: collectActions, actionSummary: actionSummary,
    toPlainText: toPlainText, toHtml: toHtml, safeFileName: safeFileName, escHtml: escHtml,
    docxXmlToText: docxXmlToText, decodeText: decodeText, cleanMinute: cleanMinute, cleanDb: cleanDb
  };
});
