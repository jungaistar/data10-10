/* 화면 점검 — 헤드리스 Chromium 으로 file:// 를 열어 흐름 전체를 눌러 봅니다(개발용, 배포 파일 아님)
   실행: PLAYWRIGHT=<playwright 패키지 폴더> node scripts/browser-check.cjs
   예)   PLAYWRIGHT="../hd-project05/node_modules/playwright" node scripts/browser-check.cjs */
const path = require('path');
const { chromium } = require(path.resolve(process.env.PLAYWRIGHT || 'playwright'));
const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + ROOT + '/index.html';
const S = require(path.join(ROOT, 'js/samples.js'));

let ok = 0, bad = 0;
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + name); } else { bad++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
async function overflow(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth, out = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      for (let p = el.parentElement; p; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return; }
      if (r.right > W + 1) out.push(el.tagName + '.' + el.className + ' ' + Math.round(r.right));
    });
    return out.slice(0, 5);
  });
}

(async () => {
  const browser = await chromium.launch();
  for (const width of [1280, 390]) {
    console.log('\n[폭 ' + width + 'px]');
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', (d) => d.accept());
    await page.goto(URL + '#/home');
    check('첫 화면 — 흐름 4단계 · 예시 3개', (await page.locator('.steps li').count()) === 4 && (await page.locator('.sample-list .btn').count()) === 3);
    let ov = await overflow(page); check('가로 넘침 없음(한눈에 보기)', !ov.length, ov.join(', '));

    // 예시 1 → 규칙 초안
    await page.click('.sample-list .btn >> nth=0');
    await page.waitForSelector('#memoIn');
    check('예시 1 메모가 들어감', (await page.inputValue('#memoIn')).includes('제품검증팀 주간회의'));
    check('이름 4명 찾음 · 대응표 · 남은 이름 없음', (await page.locator('#maskCard .chip').count()) === 4 && (await page.locator('#maskCard .alert.ok').count()) === 1);
    ov = await overflow(page); check('가로 넘침 없음(메모 → 회의록)', !ov.length, ov.join(', '));
    await page.click('text=규칙으로 초안 만들기');
    await page.waitForSelector('.ai-row');
    check('규칙 초안 → 편집 화면 · Action Item 3줄', (await page.locator('.ai-row').count()) === 3);
    check('메모 근거 점검 통과', (await page.locator('#checkBox .alert.ok').count()) === 1);
    check('담당 · 기한 칸 값', (await page.locator('.ai-row >> nth=0 >> input.owner').inputValue()) === '문태오' && (await page.locator('.ai-row >> nth=0 >> input.due').inputValue()) === '2026-10-21');
    ov = await overflow(page); check('가로 넘침 없음(편집)', !ov.length, ov.join(', '));
    // 지어낸 담당으로 바꾸면 확인 필요
    await page.fill('.ai-row >> nth=1 >> input.owner', '홍길동');
    await page.locator('.ai-row >> nth=1 >> input.owner').dispatchEvent('change');
    check('메모에 없는 담당 → 확인 필요', (await page.locator('#checkBox .alert.warn').innerText()).includes('홍길동'));
    await page.fill('.ai-row >> nth=1 >> input.owner', '윤채원');
    await page.locator('.ai-row >> nth=1 >> input.owner').dispatchEvent('change');
    await page.click('.sticky-bar >> text=저장');
    const dl = page.waitForEvent('download');
    await page.click('.sticky-bar >> text=Word(.doc)');
    const d = await dl;
    check('Word(.doc) 내려받기 이름', /^2026-10-19_제품검증팀_주간회의\.doc$/.test(d.suggestedFilename()), d.suggestedFilename());
    await page.click('.sticky-bar >> text=인쇄 / PDF');
    check('인쇄 영역에 회의록 표', (await page.evaluate(() => window.__printed)) === 1 && (await page.locator('#printArea th').count()) > 9);

    // 예시 2 → 반자동(답 붙여 넣기)
    await page.goto(URL + '#/home');
    await page.click('.sample-list .btn >> nth=1');
    await page.click('.tabs button >> nth=0');
    const prompt = await page.locator('textarea.prompt').inputValue();
    check('가린 프롬프트에 이름 없음 · 인물1 있음', !/백승호|한도윤|이수아/.test(prompt) && prompt.includes('인물1'));
    await page.fill('#orgCard textarea:not(.prompt)', S.AI_ANSWERS['sample-2']);
    await page.click('text=답으로 서식 채우기');
    await page.waitForSelector('.ai-row');
    check('반자동 답(표 · 제목 묶음) → Action Item 3줄', (await page.locator('.ai-row').count()) === 3);

    // 예시 1 → 가린 답(인물N)이 이름으로 돌아오는지
    await page.goto(URL + '#/home');
    await page.click('.sample-list .btn >> nth=0');
    await page.click('.tabs button >> nth=0');
    await page.fill('#orgCard textarea:not(.prompt)', S.AI_ANSWERS['sample-1']);
    await page.click('text=답으로 서식 채우기');
    await page.waitForSelector('.ai-row');
    const owners = await page.locator('.ai-row input.owner').evaluateAll((els) => els.map((e) => e.value));
    check('인물N → 이름으로 되돌림', owners.join(',') === '문태오,윤채원,서지민', owners.join(','));

    // 워드 메모 파일 읽기(예시 3)
    await page.goto(URL + '#/write');
    await page.setInputFiles('#main input[type=file]', path.join(ROOT, 'samples/회의메모_예시3_일정점검.docx'));
    await page.waitForFunction(() => document.querySelector('#memoIn') && document.querySelector('#memoIn').value.includes('일정 점검 회의'));
    check('워드(.docx) 메모 읽기', (await page.inputValue('#memoIn')).includes('차기 회의: 10/21(화) 10시'));
    await page.click('#main input[name=tpl][value=schedule]');
    await page.click('.tabs button >> nth=2');
    await page.click('text=규칙으로 초안 만들기');
    await page.waitForSelector('.ai-row');
    check('워드 메모 → 일정 점검 서식 규칙 초안 · 3줄', (await page.locator('.ai-row').count()) === 3);
    await page.goto(URL + '#/write');
    await page.setInputFiles('#main input[type=file]', path.join(ROOT, 'samples/회의메모_예시2_시험결과리뷰_ANSI.txt'));
    await page.waitForFunction(() => document.querySelector('#memoIn').value.includes('백승호'));
    check('메모장 ANSI(.txt) 읽기', !(await page.inputValue('#memoIn')).includes('�'));

    // 목록 · Action Item
    await page.goto(URL + '#/list');
    check('목록 4건', (await page.locator('table.list tr').count()) === 5);
    ov = await overflow(page); check('가로 넘침 없음(목록)', !ov.length, ov.join(', '));
    await page.goto(URL + '#/actions?f=all');
    check('할 일 모아 보기 12줄', (await page.locator('table.list tr').count()) === 13);
    check('기한 지남 표시(예시 3 의 10/16 · 10/17 — 오늘 기준)', (await page.locator('.badge.over').count()) >= 2);
    ov = await overflow(page); check('가로 넘침 없음(Action Item)', !ov.length, ov.join(', '));
    await page.locator('table.list tr >> nth=1 >> input[type=checkbox]').check();
    await page.waitForTimeout(100);
    check('완료 체크 → 저장', (await page.evaluate(() => JSON.parse(localStorage.getItem('data10-10.db')).minutes.some((m) => Object.values(m.values).some((v) => Array.isArray(v) && v.some((a) => a && a.done))))));

    // 서식 — 워드 양식으로 만들기
    await page.goto(URL + '#/templates');
    await page.setInputFiles('#main input[type=file]', path.join(ROOT, 'samples/회의록_서식_예시.docx'));
    await page.waitForFunction(() => document.querySelector('#main textarea').value.includes('차기 회의'));
    await page.click('button >> text="서식 만들기"');
    await page.waitForSelector('#tplEditor');
    check('워드 양식 → 칸 10개', (await page.locator('#tplEditor .fld-row:not(.fld-head)').count()) === 10);
    ov = await overflow(page); check('가로 넘침 없음(서식 관리)', !ov.length, ov.join(', '));
    await page.click('button >> text="서식 저장"');
    check('서식 4개', (await page.locator('.grid-2 .card').count()) === 4);

    await page.goto(URL + '#/settings');
    check('설정 — 서버 종류에 Ollama', (await page.locator('#aiSettings option').allInnerTexts()).some((t) => t.includes('Ollama')));
    ov = await overflow(page); check('가로 넘침 없음(설정)', !ov.length, ov.join(', '));

    check('콘솔 오류 없음', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log('\n화면 점검 ' + ok + '개 통과' + (bad ? ' · 실패 ' + bad : ''));
  process.exitCode = bad ? 1 : 0;
})();
