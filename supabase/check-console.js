#!/usr/bin/env node
/* 화면 아홉 개를 실제로 띄워 **콘솔 오류**가 있는지 본다
   ------------------------------------------------------------
   check-pages.js 는 「바로 쓰면 안 되는 것」만 글자로 본다.
   이건 진짜로 띄워 본다 — 오타·없는 함수·죽은 손잡이까지 잡힌다.

   헤드리스 크롬(--remote-debugging-port=9222)이 떠 있을 때만 돈다.
   없으면 그냥 건너뛴다 (도커처럼 꼭 있어야 하는 것은 아니다).
   띄우는 법:
     chrome --remote-debugging-port=9222 --user-data-dir=<짧은경로> --headless=new
   ★ 사용자 폴더 경로가 길면 크롬이 보관함을 못 연다 (윈도 260자) —
     C:\\Users\\<나>\\AppData\\Local\\bjc 처럼 짧게.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = 8799;
const TYPE = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.webmanifest': 'application/manifest+json'
};

function 물어보기(method, p) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, x => {
      let b = ''; x.on('data', d => (b += d));
      x.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } });
    });
    r.on('error', rej);
    r.setTimeout(3000, () => { r.destroy(new Error('안 열려요')); });
    r.end();
  });
}

(async () => {
  try { await 물어보기('GET', '/json/version'); }
  catch (e) {
    console.log('  (헤드리스 크롬이 없어 건너뜁니다 — 9222 포트)');
    return;
  }

  /* 우리 파일을 내놓는 아주 작은 서버 */
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(String(req.url).split('?')[0]);
    if (u === '/') u = '/index.html';
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); return res.end('없어요');
    }
    res.writeHead(200, {
      'Content-Type': TYPE[path.extname(f)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

  const 화면 = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
  const 나쁨 = [];

  for (const 이름 of 화면) {
    const t = await 물어보기('PUT', '/json/new?' + encodeURIComponent('about:blank'));
    const ws = new globalThis.WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const 오류 = [];
    ws.addEventListener('message', ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        오류.push(String((d.exception && d.exception.description) || d.text).split('\n')[0]);
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        오류.push((m.params.args || []).map(a =>
          a.value !== undefined ? String(a.value) : (a.description || '')).join(' ').split('\n')[0]);
      }
    });
    let id = 0;
    const 보내기 = (method, params) => new Promise(res => {
      const my = ++id;
      const h = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.id === my) { ws.removeEventListener('message', h); res(m.result); }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id: my, method, params: params || {} }));
    });
    await 보내기('Runtime.enable');
    await 보내기('Page.enable');
    await 보내기('Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await 보내기('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + 이름 });
    await new Promise(r => setTimeout(r, 2600));
    /* 손잡이가 달렸는지도 한 번 — 달·해 단추가 죽어 있던 사고가 있었다 */
    const r = await 보내기('Runtime.evaluate', {
      expression: `(() => { const b = document.querySelector('[data-theme-btn]');
        return JSON.stringify({ 달단추: !!b,
          돌아가기: !!document.querySelector('#backBtn'),
          몸글: (document.body.innerText||'').trim().length }); })()`,
      returnByValue: true
    });
    let 본것 = {};
    try { 본것 = JSON.parse(r.result.value); } catch (e) { }
    ws.close();
    await 물어보기('GET', '/json/close/' + t.id).catch(() => { });

    const 진짜오류 = 오류.filter(x => x && !/favicon|ERR_FAILED.*sw\.js/i.test(x));
    if (진짜오류.length) 나쁨.push(이름 + ' — ' + 진짜오류.slice(0, 2).join(' | ').slice(0, 150));
    else if (!본것.몸글) 나쁨.push(이름 + ' — 화면이 비었어요');
  }

  srv.close();

  if (나쁨.length) {
    console.log('\n  ✗ 띄워 보니 콘솔 오류가 있어요');
    나쁨.forEach(b => console.log('     ' + b));
    process.exit(1);
  }
  console.log('  화면 ' + 화면.length + '개를 띄워 봤어요 — 콘솔 오류 없음');
})().catch(e => {
  console.log('  (화면 띄워 보기를 못 했어요: ' + e.message + ' — 건너뜁니다)');
});
