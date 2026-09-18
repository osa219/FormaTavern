/**
 * Starts a Cloudflare Tunnel pointing to the local FormaTavern instance.
 * Checks for a user-installed `cloudflared` binary on PATH. Never auto-downloads binaries.
 *
 * Usage: `bun run tunnel`
 */

const port = Number(process.env.FORMATAVERN_PORT ?? 3000);

async function checkCloudflared(): Promise<boolean> {
  try {
    const probe = Bun.spawn(['cloudflared', '--version'], {
      stdout: 'ignore',
      stderr: 'ignore'
    });
    const exitCode = await probe.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

const isInstalled = await checkCloudflared();
if (!isInstalled) {
  console.error(`
\x1b[31m[ERROR]\x1b[0m cloudflared is not installed or not found in PATH.
To expose FormaTavern via Cloudflare Tunnel, please install cloudflared:
  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

FormaTavern strictly avoids downloading external binaries automatically for security.
`);
  process.exit(2);
}

console.log(`\x1b[36m➜\x1b[0m Starting Cloudflare Tunnel forwarding to http://127.0.0.1:${port}/...`);
console.log(`\x1b[33m➜\x1b[0m Copy the generated *.trycloudflare.com URL from the output below:\n`);

const tunnel = Bun.spawn(['cloudflared', 'tunnel', '--url', `http://127.0.0.1:${port}`], {
  stdio: ['inherit', 'inherit', 'inherit']
});

process.on('SIGINT', () => {
  try {
    tunnel.kill();
  } catch {}
  process.exit(0);
});

process.on('SIGTERM', () => {
  try {
    tunnel.kill();
  } catch {}
  process.exit(0);
});

const exitCode = await tunnel.exited;
process.exit(exitCode ?? 0);
