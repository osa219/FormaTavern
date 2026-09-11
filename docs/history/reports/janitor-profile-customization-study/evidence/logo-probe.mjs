/* Micro-probe: how do creators swap header logo text / follower words without JS? */
const CDP = "http://127.0.0.1:9222";
const URLS = [
  { key: "p1", url: "https://janitorai.com/profiles/6874ce55-bb26-4dce-8997-0ee837ef42c0" },
  { key: "p3", url: "https://janitorai.com/profiles/c0d395c1-42dc-46e7-b0a0-ccf7e3ae5da0_profile-of-heyaxo" },
  { key: "p4", url: "https://janitorai.com/profiles/19e6816f-7d70-40ea-a3e1-20ececd48ed6_profile-of-mayu-0910" },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map(); const queue = []; let ready = false;
  ws.onopen = () => { ready = true; for (const f of queue) f(); };
  ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const r = pending.get(m.id); pending.delete(m.id); r(m); } } catch {} };
  function raw(method, params = {}) { return new Promise((resolve, reject) => { const cur = ++id; pending.set(cur, resolve);
    const p = JSON.stringify({ id: cur, method, params }); if (ready) ws.send(p); else queue.push(() => ws.send(p));
    setTimeout(() => { if (pending.has(cur)) { pending.delete(cur); reject(new Error("timeout")); } }, 45000); }); }
  return { ws, raw };
}
const EXPR = `(() => { const res = [];
  const els = Array.from(document.querySelectorAll('[class*="top-bar-logo"], [class*="logo-name"], [class*="followers-count"], [class*="member-since"]')).slice(0,8);
  for (const el of els) { const cs = getComputedStyle(el);
    const b = getComputedStyle(el, '::before').content; const a = getComputedStyle(el, '::after').content;
    res.push({ cls: String(el.className).split(' ').slice(0,3).join('.'), text: (el.innerText||'').trim().slice(0,60),
      fontSize: cs.fontSize, visibility: cs.visibility, color: cs.color,
      before: (b && b !== 'none') ? b.slice(0,80) : null, after: (a && a !== 'none') ? a.slice(0,80) : null }); }
  return res; })()`;
async function main() {
  const tab = await (await fetch(CDP + "/json/new?about:blank", { method: "PUT" })).json();
  const c = makeClient(tab.webSocketDebuggerUrl);
  await sleep(1500);
  await c.raw("Page.enable", {}); await c.raw("Runtime.enable", {});
  for (const u of URLS) {
    await c.raw("Page.navigate", { url: u.url });
    await sleep(11000);
    const msg = await c.raw("Runtime.evaluate", { expression: EXPR, returnByValue: true });
    console.log(`\n===== ${u.key}:`, JSON.stringify(msg.result?.result?.value, null, 1));
  }
  c.ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
