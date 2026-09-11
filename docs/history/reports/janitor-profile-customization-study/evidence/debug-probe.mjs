/* Debug: find why Runtime.evaluate returns no data. Tiny probes first, print RAW response. */
const CDP = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      if (msg.id && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg); // RAW full message incl. exceptionDetails
      }
    } catch {}
  };
  function sendRaw(method, params = {}) {
    return new Promise((resolve, reject) => {
      const cur = ++id;
      pending.set(cur, { resolve });
      const payload = JSON.stringify({ id: cur, method, params });
      if (ready) ws.send(payload); else queue.push(() => ws.send(payload));
      setTimeout(() => { if (pending.has(cur)) { pending.delete(cur); reject(new Error("timeout " + method)); } }, 30000);
    });
  }
  return { ws, sendRaw };
}

async function main() {
  const tabs = await (await fetch(CDP + "/json/list")).json();
  const page = tabs.find((t) => t.type === "page" && (t.url || "").includes("janitorai.com/profiles/19e6"));
  console.log("reusing tab:", page?.id, page?.url);
  const c = makeClient(page.webSocketDebuggerUrl);
  await sleep(1500);

  const tests = [
    ["one-plus-one", "1+1"],
    ["title", "document.title"],
    ["iife", "(() => 42)()"],
    ["regex-s", "(() => { const s = 'a b'; return s.split(/\\s+/); })()"],
    ["label-fn", "(() => { const label = (el) => el.tagName; return label(document.body); })()"],
    ["optional-chain", "(() => document.querySelector('nav')?.parentElement?.tagName || 'none')()"],
    ["innerText", "(() => document.body.innerText.slice(0,50))()"],
    ["styleSheets-len", "(() => document.styleSheets.length)()"],
    ["cssRules-try", "(() => { try { return document.styleSheets[0].cssRules.length; } catch(e) { return 'blocked:'+e.message; } })()"],
    ["getComputedStyle", "(() => getComputedStyle(document.body).fontFamily)()"],
  ];
  for (const [name, expr] of tests) {
    try {
      const raw = await c.sendRaw("Runtime.evaluate", { expression: expr, returnByValue: true });
      console.log(`--- ${name}:`, JSON.stringify(raw).slice(0, 500));
    } catch (e) { console.log(`--- ${name} ERROR:`, e.message); }
  }
  c.ws.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
