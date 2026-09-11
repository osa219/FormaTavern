/* Human-like JanitorAI capture via Edge CDP (headed, real timings, scrolls, mouse).
 * Usage: bun human-capture.mjs
 * Uses persistent human-profile Edge on :9222. Creates one tab, warms homepage, then visits 4 profiles.
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
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    } catch {}
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const cur = ++id;
      pending.set(cur, { resolve, reject });
      const payload = JSON.stringify({ id: cur, method, params });
      const doSend = () => ws.send(payload);
      if (ready) doSend(); else queue.push(doSend);
      setTimeout(() => { if (pending.has(cur)) { pending.delete(cur); reject(new Error("timeout " + method)); } }, 30000);
    });
  }
  return { ws, send };
}

async function main() {
  // 1. open a fresh tab (human opening a tab)
  console.log("opening tab...");
  const tab = await (await fetch(CDP + "/json/new?about:blank", { method: "PUT" })).json();
  console.log("tab:", tab.id, tab.webSocketDebuggerUrl);
  const c = makeClient(tab.webSocketDebuggerUrl);
  await sleep(1500);
  await c.send("Page.enable");
  await c.send("Runtime.enable");
  await c.send("Network.enable");
  // human viewport + UA override (match real Edge, en-US)
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await c.send("Emulation.setLocaleOverride", { locale: "en-US" });
  await c.send("Emulation.setTimezoneOverride", { timezoneId: "Europe/Berlin" });

  async function humanVisit(url, key) {
    console.log(`\n=== navigating ${key}: ${url}`);
    await c.send("Page.navigate", { url });
    // human reading wait: challenge + hydration need REAL seconds
    await sleep(12000);
    // check what we got
    const title = await c.send("Runtime.evaluate", { expression: "document.title", returnByValue: true });
    const bodyLen = await c.send("Runtime.evaluate", { expression: "document.body ? document.body.innerText.slice(0,300) : 'NO BODY'", returnByValue: true });
    console.log(`title[${key}]:`, title?.result?.value);
    console.log(`body[${key}]:`, JSON.stringify(bodyLen?.result?.value)?.slice(0, 400));

    // human mouse wiggles (dispatch a few moves)
    for (let i = 0; i < 4; i++) {
      try {
        await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rand(200, 1100), y: rand(200, 700) });
        await sleep(rand(250, 600));
      } catch {}
    }

    // screenshot TOP (viewport)
    const shot1 = await c.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await Bun.write(`${OUT}/${key}-human-top.png`, Buffer.from(shot1.data, "base64"));
    console.log(`saved ${key}-human-top.png (${shot1.data.length} chars)`);

    // slow human scroll down in steps, screenshot mid + bottom (catches animations at different frames)
    await c.send("Runtime.evaluate", { expression: "window.scrollBy({top: 700, behavior: 'smooth'})" });
    await sleep(2500);
    // small mouse move mid-page
    try { await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rand(300, 1000), y: rand(300, 700) }); } catch {}
    const shot2 = await c.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await Bun.write(`${OUT}/${key}-human-mid.png`, Buffer.from(shot2.data, "base64"));
    console.log(`saved ${key}-human-mid.png`);

    await c.send("Runtime.evaluate", { expression: "window.scrollBy({top: 900, behavior: 'smooth'})" });
    await sleep(2500);
    const shot3 = await c.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await Bun.write(`${OUT}/${key}-human-bottom.png`, Buffer.from(shot3.data, "base64"));
    console.log(`saved ${key}-human-bottom.png`);

    // scroll back to top for DOM dump consistency + full-page screenshot
    await c.send("Runtime.evaluate", { expression: "window.scrollTo(0,0)" });
    await sleep(1500);
    const full = await c.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true });
    await Bun.write(`${OUT}/${key}-human-full.png`, Buffer.from(full.data, "base64"));
    console.log(`saved ${key}-human-full.png`);

    // DOM dump (rendered DOM after hydration)
    const dom = await c.send("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true });
    const html = dom?.result?.value || "";
    await Bun.write(`${OUT}/${key}-human-dom.html`, html);
    console.log(`saved ${key}-human-dom.html (${html.length} chars)`);

    // also grab all <style> blocks (custom CSS lives here) separately for analysis
    const styles = await c.send("Runtime.evaluate", {
      expression: "Array.from(document.querySelectorAll('style')).map(s=>s.textContent).join('\\n/* ==== */\\n').slice(0,200000)",
      returnByValue: true,
    });
    await Bun.write(`${OUT}/${key}-human-styles.css.txt`, styles?.result?.value || "");
    console.log(`saved styles (${(styles?.result?.value || "").length} chars)`);

    // human pause between pages (like reading / copying next link)
    await sleep(rand(2500, 4500));
  }

  // warm-up: visit homepage first like a human would (sets cookies, passes challenge once)
  await humanVisit("https://janitorai.com/", "warm");
  for (const u of URLS) await humanVisit(u.url, u.key);

  console.log("\nDONE. Check PNGs + DOMs in", OUT);
  c.ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
