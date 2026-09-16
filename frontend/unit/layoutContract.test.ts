import { describe, it, expect } from 'bun:test';
import { render } from 'svelte/server';
import { resolveLayout, NEUTRAL_LAYOUT_DOC, CLASSIC_LAYOUT, type Segment } from '@formatavern/shared';
import MessageTurn from '../src/lib/components/chat/MessageTurn.svelte';
import TurnRow from '../src/lib/components/chat/TurnRow.svelte';
import SegmentAvatar from '../src/lib/components/chat/SegmentAvatar.svelte';

describe('Layout Contract & Primitives (Invariants L1, L2, L8)', () => {
  const multiVoiceSegments: Segment[] = [
    { kind: 'narrator', text: 'The tavern was loud.' },
    { kind: 'character', name: 'Eldrin', text: 'Listen closely.' },
    { kind: 'npc', name: 'Barkeep', text: 'More ale?' },
    { kind: 'persona', name: 'Adventurer', text: 'We need to move.' }
  ];

  it('renders a row-per-segment primitive with data-kind and hooks (Invariant L1)', () => {
    const layout = resolveLayout(undefined, 'narrative');
    const { html } = render(MessageTurn, {
      props: {
        segments: multiVoiceSegments,
        narrativeRole: 'character',
        primaryName: 'Eldrin',
        layout
      }
    });

    expect(html).toContain('class="turn');
    expect(html).toContain('data-role="character"');
    expect(html).toContain('data-headers="voices"');

    // Each segment row has ft-row and data-kind
    expect(html).toContain('data-kind="narrator"');
    expect(html).toContain('data-kind="character"');
    expect(html).toContain('data-kind="npc"');
    expect(html).toContain('data-kind="persona"');

    expect(html).toContain('ft-row');
    expect(html).toContain('ft-turn-body');
  });

  it('emits zero avatar elements when avatars are off (default neutral)', () => {
    const layout = resolveLayout(undefined, 'narrative');
    const { html } = render(MessageTurn, {
      props: {
        segments: multiVoiceSegments,
        narrativeRole: 'character',
        primaryName: 'Eldrin',
        layout
      }
    });

    // Avatars are off by default: no ft-avatar in DOM
    expect(html).not.toContain('ft-avatar');
    expect(html).not.toContain('<img');
  });

  it('renders monograms when avatars are on without images', () => {
    const layout = resolveLayout(
      { avatars: { character: true, persona: true, npc: true, shape: 'circle' } },
      'narrative'
    );
    const { html } = render(MessageTurn, {
      props: {
        segments: multiVoiceSegments,
        narrativeRole: 'character',
        primaryName: 'Eldrin',
        layout
      }
    });

    expect(html).toContain('ft-avatar');
    // Initials monograms for Eldrin, Barkeep, Adventurer
    expect(html).toContain('EL');
    expect(html).toContain('BA');
    expect(html).toContain('AD');
  });

  it('preserves non-owner inline voice tags in single header mode (Invariant L8)', () => {
    const layout = resolveLayout({ headers: 'single' }, 'narrative');
    const { html } = render(MessageTurn, {
      props: {
        segments: multiVoiceSegments,
        narrativeRole: 'character',
        primaryName: 'Eldrin',
        layout
      }
    });

    // In single mode, non-owner segments (Barkeep, Adventurer) retain inline voice tags
    expect(html).toContain('[Barkeep]');
    expect(html).toContain('[Adventurer]');
    expect(html).toContain('ft-turn-name inline');
    // Plain format stays neutral: inline tags must not use the accent color
    expect(html).not.toContain('ft-turn-name inline text-accent');
  });

  it('renders inline voice tags in accent under classic names format (Invariant L8)', () => {
    const layout = resolveLayout(
      { headers: 'single', names: { showCharacter: true, showPersona: true, showNpc: true, format: 'classic' } },
      'narrative'
    );
    const { html } = render(MessageTurn, {
      props: {
        segments: multiVoiceSegments,
        narrativeRole: 'character',
        primaryName: 'Eldrin',
        layout
      }
    });

    expect(html).toContain('[Barkeep]');
    expect(html).toContain('text-accent');
  });

  it('prohibits role-branched justify-end/justify-start in chat component source (Invariant L2)', () => {
    const speechBubbleSource = Bun.file('src/lib/components/chat/SpeechBubble.svelte').text();
    // Verify SpeechBubble has no role-conditional justify-end
    expect(speechBubbleSource).not.resolves.toContain('justify-end');
    expect(speechBubbleSource).not.resolves.toContain('justify-start');
  });

  it('renders SegmentAvatar with correct shape classes and decorative alt', () => {
    const circle = render(SegmentAvatar, {
      props: { name: 'Eldrin', shape: 'circle', kind: 'character' }
    });
    expect(circle.html).toContain('rounded-full');
    expect(circle.html).toContain('EL');

    const square = render(SegmentAvatar, {
      props: { name: 'Eldrin', shape: 'square', kind: 'character' }
    });
    expect(square.html).toContain('rounded-none');

    const withImg = render(SegmentAvatar, {
      props: { name: 'Eldrin', src: '/assets/avatar.png', kind: 'character' }
    });
    expect(withImg.html).toContain('<img');
    expect(withImg.html).toContain('alt=""');
    expect(withImg.html).toContain('loading="lazy"');
    expect(withImg.html).toContain('decoding="async"');
  });
});
