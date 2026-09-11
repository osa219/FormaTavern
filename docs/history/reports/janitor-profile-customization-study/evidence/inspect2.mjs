/* F12-style inspection, DevTools way: many small focused probes, one question each.
 * Each probe is a tiny Runtime.evaluate. Failures log RAW so nothing fails silently.
 * Usage: bun inspect2.mjs
 */
const CDP = "http://127.0.0.1:9222";
const OUT = "C:\\Users\\osama\\AppData\\Local\\Temp\\opencode\\janitor-study";
const URLS = [
  { key: "p1", url: "https://janitorai.com/profiles/6874ce55-bb26-4dce-8997-0ee837ef42c0" },
  { key: "p2", url: "https://janitorai.com/profiles/70d8bef9-497c-4be8-8f7a-9a8b1de8c05d" },
  { key: "p3", url: "https://janitorai.com/profiles/c0d395c1-42dc-46e7-b0a0-ccf7e3ae5da0_profile-of-heyaxo" },
  { key: "p4", url: "https://janitorai.com/profiles/19e6816f-7d70-40ea-a3e1-20ececd48ed6_profile-of-mayu-0910" },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.floor(a + Math.random() * (b - a));

function makeClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const queue = [];
  let ready = false;
  ws.onopen = () => { ready = true; for (const f of queue) f(); };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { const r = pending.get(msg.id); pending.delete(msg.id); r(msg); }
    } catch {}
  };
  function raw(method, params = {}) {
    return new Promise((resolve, reject) => {
      const cur = ++id;
      pending.set(cur, resolve);
      const payload = JSON.stringify({ id: cur, method, params });
      if (ready) ws.send(payload); else queue.push(() => ws.send(payload));
      setTimeout(() => { if (pending.has(cur)) { pending.delete(cur); reject(new Error("timeout " + method)); } }, 45000);
    });
  }
  return { ws, raw };
}

// Each probe: [name, jsExpression]. Keep each one TINY.
const PROBES = [
  ["landmarks",
    `(() => { const l = el => el ? el.tagName.toLowerCase() + (el.id ? '#'+el.id : '') + '.' + String(el.className||'').trim().split(/\\s+/).slice(0,3).join('.') : '(none)';
     const h = document.querySelector('header'); const m = document.querySelector('main');
     return { header: l(h), headerKids: h ? Array.from(h.children).slice(0,6).map(l) : [],
       main: l(m), mainKids: m ? Array.from(m.children).slice(0,8).map(c => ({n: l(c), t: (c.innerText||'').trim().slice(0,50)})) : [] }; })()`],
  ["profile-card",
    `(() => { const ds = Array.from(document.querySelectorAll('div'));
     const c = ds.find(d => /member since|followers/i.test(d.innerText||'') && d.querySelector('img') && (d.innerText||'').length < 4000);
     return c ? { cls: String(c.className).slice(0,300), html: c.outerHTML.slice(0,2500) } : { cls: '(not isolated)' }; })()`],
  ["bot-cards",
    `(() => { const links = Array.from(document.querySelectorAll('a[href*="/characters/"], a[href*="/bots/"]'));
     return { count: links.length, firstHref: links[0] ? links[0].getAttribute('href') : null,
       firstHtml: links[0] ? (links[0].closest('div[class]')||links[0]).outerHTML.slice(0,1500) : null }; })()`],
  ["style-overview",
    `(() => { const st = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '');
     return { sheets: document.styleSheets.length, inlineBlocks: st.length,
       inlineChars: st.reduce((a,s) => a + s.length, 0),
       biggest: Math.max(...st.map(s => s.length), 0) }; })()`],
  ["custom-css",
    `(() => { const all = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').join('\\n');
     const has = (re) => (all.match(re) || []).length;
     return { chars: all.length, ppRefs: has(/\\.pp-/g), pageDoll: has(/page-doll/g), overlayGif: has(/overlay-gif/g),
       profileHooks: has(/profile-info-hstack|profile-badges|profile-top-bar/g),
       chakraOverrides: has(/\\.css-[a-z0-9]+/g), contentDecls: has(/content\\s*:/g), important: has(/!important/g),
       bgAttachFixed: has(/background-attachment\\s*:\\s*fixed/g), urlRefs: has(/url\\(/g) }; })()`],
  ["keyframes-anims",
    `(() => { const all = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').join('\\n');
     const kf = [...new Set([...all.matchAll(/@keyframes\\s+([a-zA-Z0-9_-]+)/g)].map(m => m[1]))];
     return { keyframes: kf.slice(0,30), animations: (all.match(/animation\\s*:/g)||[]).length,
       transitions: (all.match(/transition\\s*:/g)||[]).length, hover: (all.match(/:hover/g)||[]).length,
       focus: (all.match(/:focus(?!-)/g)||[]).length,
       media: [...new Set([...all.matchAll(/@media\\s*([^\\{]+)\\{/g)].map(m => m[1].trim()))].slice(0,12) }; })()`],
  ["custom-selectors",
    `(() => { const all = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').join('\\n');
     const sels = [...new Set(all.match(/\\.[a-zA-Z][a-zA-Z0-9_-]*/g) || [])];
     const custom = sels.filter(s => /pp-|doll|overlay|series|tab|container|scrollbox|imgbackground|tags-wrap|page-|profile-/i.test(s));
     return { totalClassSels: sels.length, customSels: custom.slice(0,60) }; })()`],
  ["fixed-layers",
    `(() => { const res = []; const els = document.querySelectorAll('body *');
     for (let i = 0; i < els.length && res.length < 20; i++) { const el = els[i]; const cs = getComputedStyle(el);
       if (cs.position === 'fixed') res.push({ cls: String(el.className||'').slice(0,90), tag: el.tagName, z: cs.zIndex, pe: cs.pointerEvents }); }
     return res; })()`],
  ["fonts",
    `(() => { const all = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').join('\\n');
     return { links: Array.from(document.querySelectorAll('link[href*="font"]')).map(l => l.href).slice(0,6),
       families: [...new Set([...all.matchAll(/font-family\\s*:\\s*([^;\\}]+)/g)].map(m => m[1].trim().slice(0,70)))].slice(0,20),
       bodyFont: getComputedStyle(document.body).fontFamily.slice(0,100) }; })()`],
  ["backgrounds",
    `(() => { const all = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').join('\\n');
     return { urls: [...new Set([...all.matchAll(/url\\(([^)]+)\\)/g)].map(m => m[1].replace(/['"]/g,'').slice(0,120)))].slice(0,15),
       bodyBg: getComputedStyle(document.body).backgroundImage.slice(0,160),
       imgs: document.querySelectorAll('img').length,
       imgSample: Array.from(document.querySelectorAll('img')).slice(0,8).map(i => (i.src||'').slice(0,110)) }; })()`],
  ["pseudo-swaps",
    `(() => { const res = [];
     const cands = [['HEADER-LINK','header a'], ['HEADER','header'], ['ANY-BUTTON','button']];
     const fb = Array.from(document.querySelectorAll('button')).find(b => /follow/i.test(b.innerText||''));
     for (const [name, sel] of cands) { const el = document.querySelector(sel); if (!el) { res.push({name, sel, note:'no match'}); continue; }
       for (const p of ['::before','::after']) { const v = getComputedStyle(el, p).content;
         if (v && v !== 'none' && v !== 'normal') res.push({ name, pseudo: p, content: v.slice(0,100) }); } }
     if (fb) { for (const p of ['::before','::after']) { const v = getComputedStyle(fb, p).content;
       if (v && v !== 'none' && v !== 'normal') res.push({ name: 'FOLLOW-BTN', pseudo: p, content: v.slice(0,100) }); } }
     return res; })()`],
  ["nojs-interactive",
    `(() => ({ details: document.querySelectorAll('details').length,
     summaries: Array.from(document.querySelectorAll('summary')).slice(0,6).map(s => (s.innerText||'').trim().slice(0,50)),
     tabindex: document.querySelectorAll('[tabindex]').length }))()`],
];

async function main() {
  const tab = await (await fetch(CDP + "/json/new?about:blank", { method: "PUT" })).json();
  console.log("tab:", tab.id);
  const c = makeClient(tab.webSocketDebuggerUrl);
  await sleep(1500);
  await c.raw("Page.enable", {});
  await c.raw("Runtime.enable", {});
  await c.raw("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

  for (const u of URLS) {
    console.log(`\n===== ${u.key} ${u.url}`);
    await c.raw("Page.navigate", { url: u.url });
    await sleep(11000);
    try { await c.raw("Input.dispatchMouseEvent", { type: "mouseMoved", x: rand(300, 1000), y: rand(300, 700) }); } catch {}
    await sleep(800);
    const out = {};
    for (const [name, expr] of PROBES) {
      try {
        const msg = await c.raw("Runtime.evaluate", { expression: expr, returnByValue: true });
        if (msg.result?.result?.value !== undefined) {
          out[name] = msg.result.result.value;
          const s = JSON.stringify(out[name]);
          console.log(`[${u.key}/${name}]`, s.slice(0, 900));
        } else {
          console.log(`[${u.key}/${name}] NO VALUE:`, JSON.stringify(msg).slice(0, 400));
          out[name] = { _error: JSON.stringify(msg).slice(0, 400) };
        }
      } catch (e) { console.log(`[${u.key}/${name}] THREW:`, e.message); out[name] = { _error: e.message }; }
      await sleep(300);
    }
    await Bun.write(`${OUT}/${u.key}-inspect2.json`, JSON.stringify({ key: u.key, url: u.url, ...out }, null, 1));
    console.log(`saved ${u.key}-inspect2.json`);
    await sleep(rand(2000, 3200));
  }
  c.ws.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
