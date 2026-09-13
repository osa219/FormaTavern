/**
 * Stops locally running FormaTavern dev servers by port.
 *
 * Usage: `bun run stop`
 *
 * Finds the PIDs listening on the backend and frontend dev ports and
 * terminates them. Windows-first (`netstat`/`taskkill`) with a `lsof`
 * fallback for macOS/Linux. Exits 0 when nothing is listening.
 */

const BACKEND_PORT = Number(process.env.FORMATAVERN_PORT ?? 3000);
const FRONTEND_PORT = 5173;

async function run(cmd: string[], opts: { stdout?: 'pipe' | 'ignore' } = {}): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: opts.stdout === 'ignore' ? 'ignore' : 'pipe', stderr: 'ignore' });
  const out = opts.stdout === 'ignore' ? '' : await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

function pidsListeningOnWindows(netstat: string, ports: Set<number>): Set<number> {
  const pids = new Set<number>();
  for (const line of netstat.split('\n')) {
    // e.g. `  TCP    127.0.0.1:3000    0.0.0.0:0    LISTENING    1234`
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4 || parts[0] !== 'TCP' || parts[3] !== 'LISTENING') continue;
    const local = parts[1] ?? '';
    const port = Number(local.slice(local.lastIndexOf(':') + 1));
    const pid = Number(parts[parts.length - 1]);
    if (ports.has(port) && Number.isInteger(pid) && pid > 4 && pid !== process.pid) {
      pids.add(pid);
    }
  }
  return pids;
}

async function stop(): Promise<void> {
  const ports = new Set([BACKEND_PORT, FRONTEND_PORT]);
  let pids = new Set<number>();

  if (process.platform === 'win32') {
    const out = await run(['netstat', '-ano', '-p', 'TCP']);
    pids = pidsListeningOnWindows(out, ports);
    if (pids.size > 0) {
      await run(['taskkill', '/F', ...[...pids].flatMap((pid) => ['/PID', String(pid)])], {
        stdout: 'ignore'
      });
    }
  } else {
    for (const port of ports) {
      const out = await run(['lsof', '-ti', `tcp:${port}`]);
      for (const token of out.split(/\s+/)) {
        const pid = Number(token.trim());
        if (Number.isInteger(pid) && pid > 4 && pid !== process.pid) pids.add(pid);
      }
    }
    if (pids.size > 0) {
      await run(['kill', '-9', ...[...pids].map(String)], { stdout: 'ignore' });
    }
  }

  if (pids.size === 0) {
    console.log(`[stop] nothing listening on ${[...ports].join('/')}`);
  } else {
    console.log(`[stop] terminated PID(s) ${[...pids].join(', ')} on port(s) ${[...ports].join('/')}`);
  }
}

await stop();
