import { describe, it, expect } from 'bun:test';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render } from 'svelte/server';
import { HOOKS, SURFACE_ATTR, SURFACES } from '@formatavern/shared';

// Components under test
import TopBar from '../src/lib/components/nav/TopBar.svelte';
import NavDrawer from '../src/lib/components/nav/NavDrawer.svelte';
import CharacterCard from '../src/lib/components/nav/CharacterCard.svelte';
import CompanionCard from '../src/lib/components/discovery/CompanionCard.svelte';
import ConfirmDialog from '../src/lib/components/dialogs/ConfirmDialog.svelte';
import EditTurnDialog from '../src/lib/components/dialogs/EditTurnDialog.svelte';
import PersonaPicker from '../src/lib/components/showcase/PersonaPicker.svelte';
import ShowcaseHero from '../src/lib/components/showcase/ShowcaseHero.svelte';
import ShowcaseBody from '../src/lib/components/showcase/ShowcaseBody.svelte';
import ActionHub from '../src/lib/components/showcase/ActionHub.svelte';
import TagChips from '../src/lib/components/showcase/TagChips.svelte';
import CreatorCredit from '../src/lib/components/showcase/CreatorCredit.svelte';
import ResumeMenu from '../src/lib/components/showcase/ResumeMenu.svelte';
import CompanionGrid from '../src/lib/components/discovery/CompanionGrid.svelte';
import SettingsSheet from '../src/lib/components/settings/SettingsSheet.svelte';
import Backdrop from '../src/lib/components/chat/Backdrop.svelte';
import MessageLog from '../src/lib/components/chat/MessageLog.svelte';
import MessageTurn from '../src/lib/components/chat/MessageTurn.svelte';
import SpeechBubble from '../src/lib/components/chat/SpeechBubble.svelte';
import NarratorBlock from '../src/lib/components/chat/NarratorBlock.svelte';
import Composer from '../src/lib/components/composer/Composer.svelte';
import LoreDrawer from '../src/lib/components/chat/LoreDrawer.svelte';
import SwipeCarousel from '../src/lib/components/chat/SwipeCarousel.svelte';
import TurnToolbar from '../src/lib/components/chat/TurnToolbar.svelte';
import StreamCaret from '../src/lib/components/chat/StreamCaret.svelte';
import JumpToLatest from '../src/lib/components/chat/JumpToLatest.svelte';
import ChatViewport from '../src/lib/components/chat/ChatViewport.svelte';
import StudioShell from '../src/lib/components/studio/StudioShell.svelte';
import DecorLayers from '../src/lib/components/custom/DecorLayers.svelte';
import { CharacterDraft } from '../src/lib/studio/draft.svelte';

function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (/\.(svelte|ts|js)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const SRC_DIR = resolve(import.meta.dir, '../src');

describe('Hook Contract & Manifest Invariants (Invariant C1)', () => {
  it('enforces manifest structure, ft- prefix and uniqueness across all hook values', () => {
    expect(SURFACE_ATTR).toBe('data-ft-surface');
    expect(SURFACES).toEqual(['shell', 'character', 'chat']);

    const allHooks: string[] = [];
    for (const [groupName, group] of Object.entries(HOOKS)) {
      expect(['chrome', 'shell', 'character', 'chat']).toContain(groupName);
      for (const [hookName, hookValue] of Object.entries(group)) {
        expect(hookValue.startsWith('ft-')).toBe(true);
        allHooks.push(hookValue);
      }
    }

    const uniqueHooks = new Set(allHooks);
    expect(uniqueHooks.size).toBe(allHooks.length);
    expect(allHooks.length).toBe(36);
  });

  it('prohibits hardcoded ft- class literal strings in frontend/src outside manifest', () => {
    const allSourceFiles = walkDir(SRC_DIR);
    // Matches literal class="... ft-something or class='... ft-something where ft- is not from a template interpolation
    // e.g. class="... ft-topbar ..." or class='... ft-topbar ...'
    const hardcodedFtClassRegex = /class\s*=\s*["'][^"']*\bft-[a-z0-9-]+[^"']*["']/i;

    for (const file of allSourceFiles) {
      const content = readFileSync(file, 'utf-8');
      const match = content.match(hardcodedFtClassRegex);
      if (match) {
        throw new Error(`Hardcoded ft-* class literal found in ${file}: "${match[0]}". Must consume HOOKS.* from shared manifest.`);
      }
    }
  });

  describe('Per-component DOM presence of manifest hooks', () => {
    const mockCharacter: any = {
      id: 'test-char',
      name: 'Test Character',
      creator: 'Author',
      tagline: 'A character for tests',
      tags: ['fantasy', 'adventurer'],
      firstMessage: 'Hello traveler.',
      style: {
        font: { family: 'Cinzel' },
        colors: { charBubbleBg: '#111', charBubbleText: '#eee', accent: '#38bdf8' },
        bubble: {},
        background: {}
      }
    };

    it('renders TopBar with ft-topbar', () => {
      const { html } = render(TopBar, { props: { onToggleNav: () => {}, onToggleSettings: () => {} } });
      expect(html).toContain(HOOKS.chrome.topbar);
    });

    it('renders NavDrawer with ft-navdrawer', () => {
      const { html } = render(NavDrawer, { props: { open: true, onClose: () => {} } });
      expect(html).toContain(HOOKS.chrome.navdrawer);
    });

    it('renders CompanionCard with ft-char-card', () => {
      const { html } = render(CompanionCard, { props: { companion: mockCharacter } });
      expect(html).toContain(HOOKS.chrome.card);
    });

    it('renders CharacterCard with ft-char-card', () => {
      const { html } = render(CharacterCard, { props: { character: mockCharacter } });
      expect(html).toContain(HOOKS.chrome.card);
    });

    it('renders ConfirmDialog with ft-dialog', () => {
      const { html } = render(ConfirmDialog, { props: { open: true, onConfirm: () => {}, onCancel: () => {} } });
      expect(html).toContain(HOOKS.chrome.dialog);
    });

    it('renders EditTurnDialog with ft-dialog', () => {
      const { html } = render(EditTurnDialog, { props: { open: true, content: 'test', onSave: () => {}, onClose: () => {} } });
      expect(html).toContain(HOOKS.chrome.dialog);
    });

    it('renders PersonaPicker with ft-dialog', () => {
      const { html } = render(PersonaPicker, { props: { open: true, characterId: 'test-char', personas: [], onSelect: () => {}, onClose: () => {} } });
      expect(html).toContain(HOOKS.chrome.dialog);
    });

    it('renders ShowcaseHero with ft-hero', () => {
      const { html } = render(ShowcaseHero, { props: { character: mockCharacter } });
      expect(html).toContain(HOOKS.character.hero);
    });

    it('renders ShowcaseBody with ft-showcase-body and showcase-body', () => {
      const { html } = render(ShowcaseBody, { props: { markdown: '# Hello' } });
      expect(html).toContain(HOOKS.character.showcaseBody);
      expect(html).toContain('showcase-body');
    });

    it('renders ActionHub with ft-action-hub', () => {
      const { html } = render(ActionHub, { props: { character: mockCharacter, personas: [] } });
      expect(html).toContain(HOOKS.character.actionHub);
    });

    it('renders TagChips with ft-tag-chips', () => {
      const { html } = render(TagChips, { props: { tags: ['tag1', 'tag2'] } });
      expect(html).toContain(HOOKS.character.tagChips);
    });

    it('renders CreatorCredit with ft-creator-credit', () => {
      const { html } = render(CreatorCredit, { props: { creator: 'Author' } });
      expect(html).toContain(HOOKS.character.creatorCredit);
    });

    it('renders ResumeMenu with ft-resume-menu', () => {
      const mockChat: any = { id: 'c1', title: 'Story 1', primaryCharacterId: 'test-char', updatedAt: 1000 };
      const { html } = render(ResumeMenu, { props: { chats: [mockChat] } });
      expect(html).toContain(HOOKS.character.resumeMenu);
    });

    it('renders CompanionGrid with ft-foyer-grid', () => {
      const { html } = render(CompanionGrid, { props: { companions: [mockCharacter] } });
      expect(html).toContain(HOOKS.shell.foyerGrid);
    });

    it('renders SettingsSheet with ft-settings', () => {
      const { html } = render(SettingsSheet, { props: { open: true, onClose: () => {} } });
      expect(html).toContain(HOOKS.shell.settings);
    });

    it('renders Backdrop with ft-backdrop', () => {
      const { html } = render(Backdrop, { props: {} });
      expect(html).toContain(HOOKS.chat.backdrop);
    });

    it('renders MessageLog with ft-message-log', () => {
      const mockSession: any = { messages: [], hasOlder: false, busy: false, live: null };
      const { html } = render(MessageLog, { props: { session: mockSession } });
      expect(html).toContain(HOOKS.chat.messageLog);
    });

    it('renders MessageTurn with ft-turn', () => {
      const { html } = render(MessageTurn, { props: { segments: [{ kind: 'narrator', text: 'Scene begins.' }] } });
      expect(html).toContain(HOOKS.chat.turn);
    });

    it('renders SpeechBubble variants with ft-bubble-char, ft-bubble-user, and ft-bubble-npc', () => {
      const charOut = render(SpeechBubble, { props: { variant: 'character', text: 'Hello' } });
      expect(charOut.html).toContain(HOOKS.chat.bubbleChar);

      const userOut = render(SpeechBubble, { props: { variant: 'persona', text: 'Hi' } });
      expect(userOut.html).toContain(HOOKS.chat.bubbleUser);

      const npcOut = render(SpeechBubble, { props: { variant: 'npc', name: 'Guard', text: 'Halt!' } });
      expect(npcOut.html).toContain(HOOKS.chat.bubbleNpc);
    });

    it('renders NarratorBlock with ft-narrator', () => {
      const { html } = render(NarratorBlock, { props: { text: 'A silence fell.' } });
      expect(html).toContain(HOOKS.chat.narrator);
    });

    it('renders Composer with ft-composer', () => {
      const { html } = render(Composer, { props: { onSend: () => {}, onStop: () => {}, onStandingChange: () => {} } });
      expect(html).toContain(HOOKS.chat.composer);
    });

    it('renders LoreDrawer with ft-lore-drawer', () => {
      const { html } = render(LoreDrawer, { props: { open: true, character: mockCharacter, onClose: () => {}, onSwitchPersona: async () => {} } });
      expect(html).toContain(HOOKS.chat.loreDrawer);
    });

    it('renders SwipeCarousel with ft-swipe-carousel', () => {
      const { html } = render(SwipeCarousel, { props: { messageId: 'm1', siblingIndex: 0, siblingCount: 2 } });
      expect(html).toContain(HOOKS.chat.swipeCarousel);
    });

    it('renders TurnToolbar with ft-turn-toolbar', () => {
      const { html } = render(TurnToolbar, { props: { messageId: 'm1', role: 'assistant' } });
      expect(html).toContain(HOOKS.chat.turnToolbar);
    });

    it('renders StreamCaret with ft-stream-caret', () => {
      const { html } = render(StreamCaret, { props: {} });
      expect(html).toContain(HOOKS.chat.streamCaret);
    });

    it('renders JumpToLatest with ft-jump-to-latest', () => {
      const { html } = render(JumpToLatest, { props: { visible: true } });
      expect(html).toContain(HOOKS.chat.jumpToLatest);
    });

    it('renders ChatViewport with ft-viewport and data-ft-surface="chat"', () => {
      const mockSession: any = { character: mockCharacter, chat: { id: 'c1' }, messages: [], busy: false };
      const mockThemeEngine: any = { styleAttr: '', themeScheme: 'dark', backgroundImage: null };
      const { html } = render(ChatViewport, { props: { session: mockSession, themeEngine: mockThemeEngine } });
      expect(html).toContain(HOOKS.chat.viewport);
      expect(html).toContain('data-ft-surface="chat"');
    });

    it('renders StudioShell with ft-studio and data-ft-surface="shell"', () => {
      const draft = new CharacterDraft();
      const { html } = render(StudioShell, { props: { draft } });
      expect(html).toContain(HOOKS.shell.studio);
      expect(html).toContain('data-ft-surface="shell"');
    });

    it('renders DecorLayers with ft-decor-layers and ft-decor-layer for character variant', () => {
      const { html } = render(DecorLayers, {
        props: {
          variant: 'character',
          layers: [{ image: '/assets/test.png' }]
        }
      });
      expect(html).toContain(HOOKS.character.decorLayers);
      expect(html).toContain(HOOKS.character.decorLayer);
      expect(html).toContain('data-slot="1"');
    });

    it('renders DecorLayers with ft-chat-decor-layers and ft-chat-decor-layer for chat variant', () => {
      const { html } = render(DecorLayers, {
        props: {
          variant: 'chat',
          layers: [{ image: '/assets/test.png' }]
        }
      });
      expect(html).toContain(HOOKS.chat.decorLayers);
      expect(html).toContain(HOOKS.chat.decorLayer);
      expect(html).toContain('data-slot="1"');
    });

    it('verifies surface roots and hooks in route source files', () => {
      const foyerSource = readFileSync(resolve(SRC_DIR, 'routes/+page.svelte'), 'utf-8');
      expect(foyerSource.includes('data-ft-surface="shell"') || foyerSource.includes('<ShellSurface')).toBe(true);
      expect(foyerSource).toContain('HOOKS.shell.foyerHeader');
      expect(foyerSource).toContain('HOOKS.shell.foyerGrid');
      expect(foyerSource).toContain('HOOKS.shell.recentStories');

      const charPageSource = readFileSync(resolve(SRC_DIR, 'routes/character/[id]/+page.svelte'), 'utf-8');
      expect(charPageSource).toContain('data-ft-surface="character"');

      const personasSource = readFileSync(resolve(SRC_DIR, 'routes/personas/+page.svelte'), 'utf-8');
      expect(personasSource.includes('data-ft-surface="shell"') || personasSource.includes('<ShellSurface')).toBe(true);
      expect(personasSource).toContain('HOOKS.shell.personas');
    });
  });
});
