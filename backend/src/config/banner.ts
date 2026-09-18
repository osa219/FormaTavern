import type { ServerConfig } from './schema';
import type { LanCandidate } from './network';
import { renderQrHalfBlocks } from './qr';

export interface BannerOptions {
  config: ServerConfig;
  candidates: LanCandidate[];
  primaryCandidate: LanCandidate | null;
  tailscaleCandidate: LanCandidate | null;
  isDev: boolean;
  isTty?: boolean;
  columns?: number;
  sourceSummary?: string;
}

/**
 * Pure function that formats the server startup banner.
 */
export function formatBanner(options: BannerOptions): string {
  const {
    config,
    candidates,
    primaryCandidate,
    tailscaleCandidate,
    isDev,
    isTty = true,
    columns = 80,
    sourceSummary
  } = options;

  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

  const devPort = 5173;
  const prodPort = config.network.port;
  const effectivePort = isDev ? devPort : prodPort;

  // Localhost mode
  if (config.network.mode === 'localhost') {
    if (isDev) {
      return `
  ${bold('FormaTavern')} ${dim('— LLM Roleplay Studio')}
  ${dim('──────────────────────────────────────────────')}
  ➜ ${bold('Web UI:')}   ${cyan(`http://127.0.0.1:${devPort}/`)}  ${dim('(Vite dev server)')}
  ➜ ${bold('API:')}      ${green(`http://127.0.0.1:${prodPort}/`)}    ${dim('(Elysia backend)')}
  ${dim('──────────────────────────────────────────────')}
`;
    }
    return `
  ${bold('FormaTavern')} ${dim('— LLM Roleplay Studio')}
  ${dim('──────────────────────────────────────────────')}
  ➜ ${bold('Local:')}    ${cyan(`http://127.0.0.1:${prodPort}/`)}
  ${dim('──────────────────────────────────────────────')}
`;
  }

  // LAN / Custom mode
  const localUrl = `http://127.0.0.1:${effectivePort}/`;
  const lines: string[] = [];

  lines.push('');
  lines.push(`  ${bold('FormaTavern')} ${dim('— LLM Roleplay Studio')}`);
  lines.push(`  ${dim('──────────────────────────────────────────────')}`);
  lines.push(`  ➜ ${bold('Local:')}    ${cyan(localUrl)}`);

  // Target candidate for QR and primary announcement.
  // announceLan:false suppresses every LAN detail (addresses, Tailscale, QR) —
  // the host stays reachable on the LAN, but the terminal prints nothing routable.
  let targetUrl = localUrl;
  const announce = config.network.announceLan !== false;

  if (announce) {
    if (config.network.mode === 'custom' && config.network.host) {
      targetUrl = `http://${config.network.host}:${effectivePort}/`;
      lines.push(`  ➜ ${bold('Custom:')}   ${green(targetUrl)}`);
    } else if (primaryCandidate) {
      targetUrl = primaryCandidate.url(effectivePort);
      lines.push(`  ➜ ${bold('Network:')}  ${green(targetUrl)} ${dim(`(${primaryCandidate.kind})`)}`);

      // List alternate candidates if any
      const alternates = candidates.filter((c) => c.address !== primaryCandidate.address && c.kind !== 'tailscale');
      for (const alt of alternates) {
        lines.push(`            ${dim(alt.url(effectivePort))} ${dim(`(${alt.kind})`)}`);
      }
    } else {
      lines.push(`  ➜ ${bold('Network:')}  ${yellow(`http://0.0.0.0:${effectivePort}/ (no active LAN interface detected)`)}`);
    }

    if (tailscaleCandidate) {
      lines.push(`  ➜ ${bold('Tailscale:')} ${cyan(tailscaleCandidate.url(effectivePort))}`);
    }
  }

  if (config.security.authMode === 'pin') {
    lines.push(`  ➜ ${bold('Security:')} ${green('PIN Protected [••••]')}`);
  } else {
    lines.push(`  ➜ ${bold('Security:')} ${yellow('OPEN — anyone on Wi-Fi can access chats')}`);
  }

  if (sourceSummary) {
    lines.push(`  ➜ ${bold('Config:')}   ${dim(sourceSummary)}`);
  }

  // QR Code Rendering
  const shouldRenderQr = config.network.qrCode && isTty && columns >= 40;
  if (shouldRenderQr && targetUrl.startsWith('http://') && !targetUrl.includes('127.0.0.1')) {
    lines.push('');
    lines.push(`  Scan with your phone's camera to connect:`);
    lines.push('');
    const qrBlocks = renderQrHalfBlocks(targetUrl);
    for (const row of qrBlocks) {
      lines.push(`  ${row}`);
    }
  }

  lines.push(`  ${dim('──────────────────────────────────────────────')}`);
  lines.push('');

  return lines.join('\n');
}
