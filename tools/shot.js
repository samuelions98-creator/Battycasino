// Usage: PORT=8080 USER=CountBat PASS=secret1 node shot.js "hash1,hash2" [outdir]
// env: VW, VH (viewport), WAIT (ms after navigation), SUF (filename suffix), FULL=1 full-page, MOBILE=1 (390x844 touch)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const port = process.env.PORT || 8080, user = process.env.USER_NAME || 'CountBat', pass = process.env.PASS || 'secret1';
  const out = process.argv[3] || '.';
  const mobile = !!process.env.MOBILE;
  const vw = +(process.env.VW || (mobile ? 390 : 1280)), vh = +(process.env.VH || (mobile ? 844 : 800));
  const state = '/tmp/batty-state-' + user + '-' + port + '.json';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile, storageState: fs.existsSync(state) ? state : undefined });
  const p = await ctx.newPage();
  const errs = [];
  if (process.env.DBG) p.on('response', async r => { if (r.url().includes('api.php')) console.log(r.status(), (r.request().postData()||'').slice(0,60)); });
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  const base = 'http://127.0.0.1:' + port + '/index.html';
  const api = (d) => ctx.request.post('http://127.0.0.1:' + port + '/api.php', { headers: { 'X-Batty': '1', 'Content-Type': 'application/json' }, data: d });
  let r = await api({ a: 'me' }); let j = await r.json();
  if (!j.me) { r = await api({ a: 'login', name: user, pass }); if (r.status() !== 200) r = await api({ a: 'register', name: user, pass }); j = await r.json(); if (!j.me) console.log('login problem', JSON.stringify(j)); }
  await p.goto(base, { waitUntil: 'networkidle' });
  await ctx.storageState({ path: state });
  const hashes = (process.argv[2] || '').split(',');
  for (const h of hashes) {
    await p.evaluate((h) => { location.hash = h; }, h);
    await p.waitForTimeout(+(process.env.WAIT || 2500));
    await p.screenshot({ path: out + '/' + (h || 'lobby').replace(/\//g, '_') + (process.env.SUF || '') + '.png', fullPage: !!process.env.FULL });
  }
  if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
  await b.close();
})();
