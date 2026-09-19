import { test, expect, type Page } from '@playwright/test';

// Mobile invariants M1–M4 local hard gate. See
// docs/history/reports/mobile-ux-optimization-proposal.md §8.
// M1 is two-halved on purpose: the `overflow-x: clip` shell guard alone turns
// a bare scrollWidth assertion green, so key-element rect sweeping closes it.

async function ensureSeedChat(request: any): Promise<string> {
  const list = await request.get('/api/chats?limit=1');
  const existing = (await list.json()) as Array<{ id: string }>;
  if (existing.length > 0) return existing[0].id;
  const created = await request.post('/api/chats', {
    data: { characterId: 'eldrin-the-mage' }
  });
  const body = (await created.json()) as { id: string };
  return body.id;
}

async function assertNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  expect(
    overflow.scrollWidth,
    `page overflow: scrollWidth=${overflow.scrollWidth} innerWidth=${overflow.innerWidth} at ${page.url()}`
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

async function assertKeyRectsInside(page: Page, selector: string) {
  const bad = await page.evaluate((sel) => {
    const vw = window.innerWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        out.push(`${el.tagName}.${(el as HTMLElement).className.toString().slice(0, 60)} right=${Math.round(r.right)} left=${Math.round(r.left)}`);
      }
    }
    return out;
  }, selector);
  expect(bad, `clipped elements (${selector}) at ${page.url()}: ${bad.join(' | ')}`).toEqual([]);
}

const SHELL_PAGES = ['/', '/chats', '/personas', '/character/new', '/character/eldrin-the-mage'];

test.describe('M1/M4 shell geometry', () => {
  for (const route of SHELL_PAGES) {
    test(`no overflow or clipped chrome at ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await assertNoPageOverflow(page);
      await assertKeyRectsInside(page, 'header, main, nav, dialog[open]');
    });
  }

  test('chat view has no overflow', async ({ page, request }) => {
    const chatId = await ensureSeedChat(request);
    await page.goto(`/chat/${chatId}`);
    await page.waitForLoadState('networkidle');
    await assertNoPageOverflow(page);
  });
});

test.describe('M1 hardened: adversarial unbroken strings', () => {
  // A 100-char unbroken name once stretched main to 1152px: mx-auto
  // disables flex stretch, so every centered main needs w-full and every
  // truncate-in-flex needs min-w-0. Seed data is short; this keeps the
  // adversarial case under test. Scratch DB is fresh per run; duplicate
  // creates across parallel workers are ignored.
  test.beforeAll(async ({ request }) => {
    const longWord = 'X'.repeat(100);
    const ref = await request.get('/api/characters/eldrin-the-mage');
    const style = ((await ref.json()) as any).style;
    await request.post('/api/characters', {
      data: {
        id: 'wide-e2e-char',
        name: `Wide${longWord}`,
        tagline: `tag-${longWord}`.slice(0, 140),
        description: 'd', personality: 'p', scenario: 's',
        firstMessage: 'hi', style
      }
    }).catch(() => {});
    await request.post('/api/chats', {
      data: { characterId: 'wide-e2e-char', title: `chat-${longWord}` }
    }).catch(() => {});
  });

  test('long names/titles truncate instead of widening the page', async ({ page }) => {
    await page.goto('/chats');
    await page.waitForLoadState('networkidle');
    await assertNoPageOverflow(page);
    const bad = await page.evaluate(() => {
      const vw = window.innerWidth;
      const out: string[] = [];
      const main = document.querySelector('main');
      if (!main) return ['no main'];
      for (const el of main.querySelectorAll('*')) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > vw + 1) {
          out.push(`${el.tagName}.${((el as HTMLElement).className?.toString?.() ?? '').slice(0, 60)}`);
          if (out.length > 10) break;
        }
      }
      return out;
    });
    expect(bad, `wide descendants at ${page.url()}: ${bad.join(' | ')}`).toEqual([]);
  });
});

test.describe('M2 bottom nav discipline', () => {
  test('visible below 768px except on chat view', async ({ page, request }, testInfo) => {
    if (testInfo.project.name === 'desktop-1280') {
      await page.goto('/');
      await expect(page.locator('.ft-bottomnav')).toBeHidden();
      return;
    }
    for (const route of SHELL_PAGES) {
      await page.goto(route);
      await expect(page.locator('.ft-bottomnav'), `nav missing at ${route}`).toBeVisible();
      for (const label of ['Home', 'Chats', 'Personas']) {
        await expect(
          page.locator('.ft-bottomnav', { hasText: label }).first(),
          `${label} missing at ${route}`
        ).toBeVisible();
      }
    }
    const chatId = await ensureSeedChat(request);
    await page.goto(`/chat/${chatId}`);
    await expect(page.locator('.ft-bottomnav')).toBeHidden();
  });
});

test.describe('M3 sheets fit the viewport', () => {
  test('settings sheet fits at 390px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop-1280', 'mobile-only assertion');
    await page.goto('/');
    await page.getByRole('button', { name: 'Open settings' }).first().click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box, 'settings dialog has no box').not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(viewport!.width + 1);
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    await assertNoPageOverflow(page);
  });
});
