// 실행: node test/logic.test.mjs   (의존성 없음 — vendor 의 JSZip 만 씀)
// 가상 메모 3건(js/samples.js)과 그 정답 견본으로 규칙 초안 · AI 답 읽기 · 이름 가리기 · 내보내기를 검사합니다.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');
const S = require('../js/samples.js');
const JSZip = require('../vendor/jszip.min.js');

let passed = 0, failed = 0;
const pending = [];
function test(name, fn) {
  const done = () => { passed++; console.log('  ok  ' + name); };
  const fail = (e) => { failed++; console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; };
  try { const r = fn(); if (r && r.then) pending.push(r.then(done, fail)); else done(); } catch (e) { fail(e); }
}
const T = (id) => L.defaultTemplates().find((t) => t.id === id);
const byRole = (tpl, values, role) => values[tpl.fields.find((f) => f.role === role).key];
const pickA = (list) => list.map((a) => ({ task: a.task, owner: a.owner, due: a.due }));
const samplePath = (f) => new URL('../samples/' + f, import.meta.url);

console.log('\n[1] 서식');
test('기본 서식 3종 — 일반 회의 · 시험·검증 결과 리뷰 · 일정 점검, 모두 결정 사항 · Action Item 칸이 있음', () => {
  const ts = L.defaultTemplates();
  assert.deepEqual(ts.map((t) => t.name), ['일반 회의', '시험·검증 결과 리뷰', '일정 점검']);
  ts.forEach((t) => {
    assert.ok(t.fields.some((f) => f.role === 'decisions'), t.name + ' 결정');
    assert.equal(t.fields.filter((f) => f.type === 'actions').length, 1, t.name + ' Action Item');
    assert.equal(new Set(t.fields.map((f) => f.key)).size, t.fields.length, t.name + ' key 겹침');
  });
  // 원본을 고쳐도 기본값은 그대로(복사본을 줌)
  const a = L.defaultTemplates(); a[0].fields.pop();
  assert.equal(L.defaultTemplates()[0].fields.length, 9);
});
test('칸 이름 → 역할: 회사마다 다른 이름도 같은 역할로', () => {
  const cases = { '회의명': 'title', '회의 일시': 'datetime', '참석 인원': 'attendees', '결론': 'decisions', '합의 사항': 'decisions',
    '후속 조치 (담당/기한)': 'actions', 'Action Items': 'actions', '할 일': 'actions', '차기 회의': 'next', '주요 논의 내용': 'discussion',
    '불합격 항목': 'issues', '시험 결과': 'results', '진행 현황': 'status', '작성자': 'other' };
  for (const [k, v] of Object.entries(cases)) assert.equal(L.guessRole(k), v, k);
});
test('서식 글(워드 양식 표 · 번호 제목)로 새 서식 만들기 — 빈 칸 옆 칸 이름, 문서 제목은 뺌', () => {
  const t = L.templateFromText(S.FORM_TEXT, '팀 양식');
  assert.deepEqual(t.fields.map((f) => f.label), ['회의명', '일시', '장소', '작성자', '참석자', '회의 안건', '주요 논의 내용', '결정 사항', '후속 조치 (담당/기한)', '차기 회의']);
  assert.deepEqual(t.fields.map((f) => f.type), ['text', 'text', 'text', 'para', 'text', 'list', 'list', 'list', 'actions', 'text']);
  assert.equal(t.name, '팀 양식');
  // 「회의명: ___」 「■ 결정사항」 「[Action Item]」 모양도
  const t2 = L.templateFromText('회의명: ____\n■ 결정사항\n[Action Item]\n- 비고 :');
  assert.deepEqual(t2.fields.map((f) => f.role), ['title', 'decisions', 'actions', 'other']);
});
test('서식 다듬기: 빈 칸 이름 빼고 key 겹침 풀고 이상한 type 은 역할에 맞춤', () => {
  const t = L.cleanTemplate({ name: ' x ', fields: [{ key: 'a', label: '결정 사항' }, { key: 'a', label: '할 일', type: 'zz' }, { label: '' }, null] });
  assert.deepEqual(t.fields.map((f) => [f.key, f.role, f.type]), [['a', 'decisions', 'list'], ['a_', 'actions', 'actions']]);
});

console.log('\n[2] 날짜');
test('날짜 모양 — 연월일 · 월/일 · ○월 ○일 · 이번 주/다음 주 요일 · 내일, 회의일 기준', () => {
  const base = '2026-10-19';                                  // 월요일
  const cases = { '2026-10-21': '2026-10-21', '2026.10.16 오후': '2026-10-16', '2026년 10월 14일': '2026-10-14', '10/22까지': '2026-10-22',
    '~10.24': '2026-10-24', '10월 23일': '2026-10-23', '이번 주 금요일까지': '2026-10-23', '다음 주 수요일': '2026-10-28', '차주 월': '2026-10-26',
    '금요일까지': '2026-10-23', '내일': '2026-10-20', '3일 후': '2026-10-22', '26.11.02': '2026-11-02' };
  for (const [k, v] of Object.entries(cases)) assert.equal(L.parseDate(k, base), v, k);
});
test('날짜 아닌 수는 날짜로 읽지 않음 — 1.5배 · 3.2% · 5/5 OK 의 비율은 OK, 13/40 같은 범위 밖 · 2시간', () => {
  for (const s of ['효율 1.5배', '불량률 3.2%', '13/40 통과', '3축 각 2시간', 'IPX7', 'B-2 시료']) assert.equal(L.parseDate(s, '2026-10-19'), '', s);
  assert.equal(L.findTime('3축 각 2시간'), '');
  assert.deepEqual(['오후 3시', '14:00', '오전 9시 반', '10시'].map(L.findTime), ['15:00', '14:00', '09:30', '10:00']);
});

console.log('\n[3] 이름 가리기');
test('메모에서 이름 후보 찾기 — 참석자 줄 · 「○○○ 책임」 · @이름 · 담당: 이름, 직무 낱말은 이름이 아님', () => {
  for (const s of S.SAMPLES) assert.deepEqual(L.detectNames(s.memo), s.expected.names, s.id);
  assert.deepEqual(L.detectNames('참석: 품질 담당, 시험 담당\n검증 책임 확인'), []);
});
test('가리기 → 되돌리기: 같은 이름은 같은 번호, 긴 이름 먼저, 인물10 과 인물1 이 엉키지 않음', () => {
  const names = ['김가', '김가람', 'A1', '박', '이나', '정다', '최라', '한마', '오바', '유사', '임아'].filter((n) => n.length >= 2);
  const map = L.buildAliasMap(names.concat(['김가']));
  assert.equal(map.length, 10);
  const memo = '김가람 책임과 김가 선임, 임아 님이 참석. 김가람 → 보고서';
  const masked = L.maskText(memo, map);
  assert.equal(masked, '인물2 책임과 인물1 선임, 인물10 님이 참석. 인물2 → 보고서');
  assert.deepEqual(L.findLeaks(masked, names), []);
  assert.equal(L.unmaskText(masked, map), memo);
  assert.equal(L.unmaskText('인물 2 담당, 인물99 는 모름', map), '김가람 담당, 인물99 는 모름');
});
test('예시 1: 가린 프롬프트에 이름이 하나도 없고, 서식 칸 · 규칙 · 메모가 모두 들어감', () => {
  const s = S.SAMPLES[0], tpl = T(s.templateId), names = L.detectNames(s.memo), map = L.buildAliasMap(names);
  const p = L.buildPrompt(tpl, L.maskText(s.memo, map), { meetingDate: s.expected.meetingDate, masked: true });
  assert.deepEqual(L.findLeaks(p, names), []);
  for (const f of tpl.fields) assert.ok(p.includes('"' + f.label + '"'), f.label);
  assert.ok(p.includes('지어내지 말고') && p.includes('회의일은 2026-10-19') && p.includes('인물1') && p.includes('이름을 추측하지 말고'));
  // 가리기 끄면 이름 그대로, 「인물」 규칙 없음
  const p2 = L.buildPrompt(tpl, s.memo, {});
  assert.ok(p2.includes('한도윤') && !p2.includes('이름을 추측하지 말고'));
});

console.log('\n[4] 규칙 초안 (AI 없이) — 정답 견본과 비교');
for (const s of S.SAMPLES) {
  test(s.name + ' — 회의명 · 일시 · 결정 · Action Item(담당 · 기한) · 다음 회의', () => {
    const tpl = T(s.templateId), e = s.expected;
    const r = L.ruleDraft(tpl, s.memo);
    const v = r.values;
    assert.equal(r.meetingDate, e.meetingDate);
    assert.equal(byRole(tpl, v, 'title'), e.title);
    assert.equal(byRole(tpl, v, 'datetime'), e.datetime);
    if (e.place && tpl.fields.some((f) => f.role === 'place')) assert.equal(byRole(tpl, v, 'place'), e.place);
    if (e.place && !tpl.fields.some((f) => f.role === 'place')) assert.equal(L.ruleDraft(T('general'), s.memo).values.place, e.place);   // 장소 칸이 있는 서식이면
    if (e.target) assert.equal(byRole(tpl, v, 'target'), e.target);
    if (e.agenda) assert.deepEqual(byRole(tpl, v, 'agenda'), e.agenda);
    assert.deepEqual(byRole(tpl, v, 'decisions'), e.decisions);
    assert.deepEqual(pickA(byRole(tpl, v, 'actions')), e.actions);
    assert.ok(byRole(tpl, v, 'next').startsWith(e.nextStartsWith), byRole(tpl, v, 'next'));
    if (e.discussionCount != null) assert.equal(byRole(tpl, v, 'discussion').length, e.discussionCount);
    if (e.resultsCount != null) assert.equal(byRole(tpl, v, 'results').length, e.resultsCount);
    if (e.issuesIncludes) assert.ok(byRole(tpl, v, 'issues').some((x) => x.includes(e.issuesIncludes)), '이슈');
    if (e.statusIncludes) e.statusIncludes.forEach((x) => assert.ok(byRole(tpl, v, 'status').includes(x), x));
    // 결정 사항은 Action Item 에 섞이지 않음 · 할 일은 결정에 섞이지 않음
    byRole(tpl, v, 'actions').forEach((a) => assert.ok(!e.decisions.includes(a.task)));
  });
}
test('규칙 초안: 서식을 바꿔도(예시 1 메모 → 일정 점검 서식) 결정 · 할 일은 같고 남는 글은 가까운 칸으로', () => {
  const s = S.SAMPLES[0], r = L.ruleDraft(T('schedule'), s.memo), tpl = T('schedule');
  assert.deepEqual(pickA(byRole(tpl, r.values, 'actions')), s.expected.actions);
  assert.deepEqual(byRole(tpl, r.values, 'decisions'), s.expected.decisions);
  const status = byRole(tpl, r.values, 'status');
  assert.ok(status.some((x) => x.includes('외부 인증 서류')), '논의 → 진행 현황');
});
test('규칙 초안: 미정 · 검토 중 · 물음표 문장은 결정으로 넣지 않음, 담당 없는 「~하기로」 는 결정(할 일 아님)', () => {
  const tpl = T('general');
  const r = L.ruleDraft(tpl, '팀 회의\n- 장비 교체는 아직 미정\n- 예산 확정 여부 검토 중\n- 다음 주 월요일부터 새 양식 쓰기로 함\n- 보고 양식 통일하기로?');
  assert.deepEqual(r.values.decisions, ['다음 주 월요일부터 새 양식 쓰기로 함']);
  assert.deepEqual(r.values.actions, []);
});
test('규칙 초안: 메모장(ANSI) 파일 · 워드 파일로 읽은 메모도 같은 결과', async () => {
  const ansi = L.decodeText(readFileSync(samplePath('회의메모_예시2_시험결과리뷰_ANSI.txt')));
  assert.ok(ansi.includes('백승호') && !ansi.includes('�'));
  const s2 = S.SAMPLES[1], r2 = L.ruleDraft(T('test-review'), ansi);
  assert.deepEqual(pickA(r2.values.actions), s2.expected.actions);
  assert.equal(r2.values.title, s2.expected.title);                  // 긴 줄표가 「-」 로 바뀌어도
  const zip = await JSZip.loadAsync(readFileSync(samplePath('회의메모_예시3_일정점검.docx')));
  const text = L.docxXmlToText(await zip.file('word/document.xml').async('string'));
  assert.equal(text, S.SAMPLES[2].memo.trim());
  assert.deepEqual(pickA(L.ruleDraft(T('schedule'), text).values.actions), S.SAMPLES[2].expected.actions);
});
test('워드 서식 파일(표 + 번호 제목) → 서식 글 → 서식', async () => {
  const zip = await JSZip.loadAsync(readFileSync(samplePath('회의록_서식_예시.docx')));
  const text = L.docxXmlToText(await zip.file('word/document.xml').async('string'));
  const t = L.templateFromText(text, '양식');
  assert.deepEqual(t.fields.map((f) => f.label), L.templateFromText(S.FORM_TEXT).fields.map((f) => f.label));
});

console.log('\n[5] AI 답 읽기 → 서식 채우기');
test('예시 1 답(코드 블록 · 앞뒤 설명 · 끝 쉼표 · 가린 이름) → 모든 칸, 인물N → 이름', () => {
  const s = S.SAMPLES[0], tpl = T(s.templateId), map = L.buildAliasMap(L.detectNames(s.memo));
  const r = L.parseAnswer(tpl, S.AI_ANSWERS[s.id], { meetingDate: s.expected.meetingDate, aliasMap: map });
  assert.equal(r.format, 'json');
  assert.equal(r.filled.length, tpl.fields.length);
  assert.deepEqual(pickA(r.values.actions).map((a) => [a.owner, a.due]), s.expected.actions.map((a) => [a.owner, a.due]));
  assert.equal(r.values.attendees, '한도윤 책임, 서지민 선임, 문태오, 윤채원 매니저');
  assert.ok(!JSON.stringify(r.values).includes('인물'));
  assert.deepEqual(L.traceCheck(tpl, r.values, s.memo, { meetingDate: s.expected.meetingDate }), []);
});
test('예시 2 답(「칸 이름:」 · ## 제목 · 번호 목록 · 마크다운 표) → 모든 칸, 표의 빈 기한은 빈칸', () => {
  const s = S.SAMPLES[1], tpl = T(s.templateId);
  const r = L.parseAnswer(tpl, S.AI_ANSWERS[s.id], { meetingDate: s.expected.meetingDate });
  assert.equal(r.format, 'sections');
  assert.equal(r.filled.length, tpl.fields.length);
  assert.deepEqual(pickA(r.values.actions), s.expected.actions);
  assert.deepEqual(r.values.decisions, ['열충격 NG 1건 재시험(시료 3개 추가)', '진동·방수 합격 판정']);
  assert.equal(r.values.results.length, 3);
  assert.equal(r.values.title, s.expected.title);
});
test('예시 3 답(<think> · 한 줄 JSON · 다른 키 이름 「내용 · 담당자 · 마감」 · 상대 날짜 · 모르는 키) → 날짜는 회의일 기준', () => {
  const s = S.SAMPLES[2], tpl = T(s.templateId);
  const r = L.parseAnswer(tpl, S.AI_ANSWERS[s.id], { meetingDate: s.expected.meetingDate });
  assert.equal(r.format, 'json');
  assert.deepEqual(pickA(r.values.actions), s.expected.actions);
  assert.deepEqual(r.values.status, ['고온 수명시험 진행 중 60%(예정대로)', '염수분무 시험 완료', '중간 보고서 초안 작성 중']);  // 「- 」 글머리 줄 글 → 목록
  assert.equal(r.values.attendees, '윤채원, 문태오, 강하린 선임');                                                      // 배열 → 한 줄
  assert.deepEqual(r.unknownKeys, ['요약']);
});
test('답이 망가져도 — 둥근 따옴표 JSON · 「없음」 · 키를 칸 key 로 · 빈 답', () => {
  const tpl = T('general');
  const r = L.parseAnswer(tpl, '{“회의명”: “A”, “결정 사항”: “없음”, "actions": "- 자료 정리 (담당: 문태오, 기한: 10/30)", "next": "미정"}', { meetingDate: '2026-10-19' });
  assert.equal(r.values.title, 'A');
  assert.deepEqual(r.values.decisions, []);
  assert.deepEqual(pickA(r.values.actions), [{ task: '자료 정리', owner: '문태오', due: '2026-10-30' }]);
  assert.equal(r.values.next, '');
  const none = L.parseAnswer(tpl, '죄송하지만 이해하지 못했습니다.');
  assert.deepEqual([none.format, none.filled.length], ['none', 0]);
});
test('메모 근거 점검: AI 가 지어낸 담당 · 기한 · 결정은 「확인 필요」', () => {
  const s = S.SAMPLES[0], tpl = T(s.templateId);
  const values = L.ruleDraft(tpl, s.memo).values;
  values.actions.push({ task: '고객사 방문 일정 잡기', owner: '홍길동', due: '2026-11-30', done: false });
  values.decisions.push('신규 장비 3대 구매 승인');
  const kinds = L.traceCheck(tpl, values, s.memo, { meetingDate: s.expected.meetingDate }).map((x) => x.kind + '#' + x.index);
  assert.deepEqual(kinds.sort(), ['due-not-in-memo#3', 'owner-not-in-memo#3', 'weak#2', 'weak#3'].sort());
});

console.log('\n[6] Action Item 모아 보기 · 내보내기 · 저장');
test('회의록 여러 건의 할 일 모아 보기 — 기한 지남 · 3일 안 · 기한 없음, 완료는 맨 뒤', () => {
  const ms = S.SAMPLES.map((s) => { const t = T(s.templateId); const r = L.ruleDraft(t, s.memo); return L.newMinute(t, r.values, { meetingDate: r.meetingDate, memo: s.memo }); });
  ms[2].values.actions[0].done = true;                               // 견적 받기 완료
  const list = L.collectActions(ms, '2026-10-21');
  assert.equal(list.length, 9);
  assert.equal(list[list.length - 1].task, '외부 시험소 견적 2곳 받기');
  const overdue = list.filter((a) => a.overdue).map((a) => a.due);
  assert.deepEqual(overdue, ['2026-10-16', '2026-10-20']);
  const sum = L.actionSummary(list);
  assert.deepEqual([sum.total, sum.open, sum.done, sum.overdue, sum.noDue], [9, 8, 1, 2, 1]);
  assert.equal(sum.dueSoon, 5);                                      // 10/21 · 10/21 · 10/22 · 10/23 · 10/23 (0~3일)
  assert.equal(list[0].title, '일정 점검 회의');
});
test('내보내기 — 글(복사용) · HTML(Word · 인쇄): 칸 순서대로, 이름 이스케이프, 빈 칸은 (없음)', () => {
  const s = S.SAMPLES[1], tpl = T(s.templateId), v = L.ruleDraft(tpl, s.memo).values;
  v.title = '결과 <리뷰> & 판정';
  const txt = L.toPlainText(tpl, v);
  assert.ok(txt.startsWith('■ 회의명 : 결과 <리뷰> & 판정'));
  assert.ok(txt.includes('1. 크랙 단면 분석 의뢰 — 담당: 이수아 / 기한: 2026-10-22'));
  assert.ok(txt.includes('기한: 미정'));
  const html = L.toHtml(tpl, v, { title: '회의록' });
  assert.ok(html.includes('결과 &lt;리뷰&gt; &amp; 판정') && !html.includes('<리뷰>'));
  assert.equal((html.match(/<tr><th>/g) || []).length, tpl.fields.length + 1);  // 칸 + Action Item 표 머리
  assert.ok(html.includes('word-break:keep-all'));
  assert.equal(L.safeFileName('a/b: 회의?'), 'a_b_회의');
});
test('저장 형식 다듬기 — 망가진 값 · 옛 기본 서식 빠짐 · 회의록 값 type 맞춤', () => {
  const db = L.cleanDb({ templates: [{ id: 'mine', name: '내 것', fields: [{ label: '결정' }] }], minutes: [{ template: T('general'), values: { decisions: '하나', actions: [{ task: 'x' }] } }, null, { values: {} }], maskNames: [' 가 ', ''] });
  assert.deepEqual(db.templates.map((t) => t.id), ['mine', 'general', 'test-review', 'schedule']);
  assert.equal(db.minutes.length, 1);
  assert.deepEqual(db.minutes[0].values.decisions, ['하나']);
  assert.deepEqual(db.minutes[0].values.actions, [{ task: 'x', owner: '', due: '', done: false }]);
  assert.deepEqual([db.maskNames, db.maskDefault, db.keepMemo], [['가'], true, true]);
  assert.equal(L.cleanDb(null).templates.length, 3);
});

const { versions } = await import('../scripts/bump-version.mjs');
test('판 맞추기 — index.html ?v= · logic.js · app.js 가 같은 판 (scripts/bump-version.mjs)', () => {
  const v = versions();
  assert.equal(v.logic, L.VERSION, 'logic.js VERSION'); assert.equal(v.app, L.VERSION, 'app.js APP_VERSION');
  assert.ok(v.html.length >= 7 && v.html.every(x => x === L.VERSION), 'index.html 의 모든 js·css 에 ?v=' + L.VERSION + ' — ' + JSON.stringify(v.html));
});

await Promise.all(pending);
console.log('\n' + passed + '개 통과' + (failed ? ' · 실패 ' + failed : ''));
