import type { CharacterCard } from '@formatavern/shared';

export const eldrin: CharacterCard = {
  id: 'eldrin-the-mage',
  name: 'Eldrin the Mage',
  description: 'An ancient archmage bound to a celestial observatory.',
  personality: 'Cryptic, deliberate, sharp-tongued, but secretly protective.',
  scenario: 'The observatory hums as cosmic alignments shift.',
  firstMessage: '*The observatory hums…* "You arrive as the ley lines align. Speak plainly—time is thin."',
  style: {
    font: { family: "'Cinzel', Georgia, serif", size: '1rem', lineHeight: '1.7' },
    colors: {
      charBubbleBg: 'rgba(69, 26, 3, 0.6)',
      charBubbleText: '#fef3c7',
      charBubbleBorder: 'rgba(180, 83, 9, 0.4)',
      userBubbleBg: 'rgba(15, 23, 42, 0.8)',
      userBubbleText: '#f8fafc',
      accent: '#d97706',
      quote: '#fde047',
      action: '#cbd5e1',
      narratorText: '#d6d3d1'
    },
    bubble: { radius: '1rem', charTail: 'left', padding: '1rem 1.25rem' },
    background: { overlay: 'rgba(10, 10, 15, 0.75)', blur: '4px' }
  },
  stateSchema: {
    mood: {
      type: 'enum',
      values: ['calm', 'curious', 'urgent', 'furious'],
      aliases: { angry: 'furious', anxious: 'urgent' },
      default: 'calm'
    },
    affinity: { type: 'int', min: 0, max: 10, default: 5 },
    danger: { type: 'enum', values: ['low', 'elevated', 'high'], default: 'low' },
    scene: { type: 'string', default: 'spire_observatory' }
  },
  stateBindings: [
    {
      when: { mood: 'furious' },
      set: { 'colors.accent': '#dc2626', 'colors.charBubbleBorder': 'rgba(220, 38, 38, 0.6)' }
    },
    { when: { danger: 'high' }, set: { 'background.overlay': 'rgba(40, 5, 5, 0.8)' } }
  ],
  initialState: { mood: 'calm', affinity: 5, danger: 'low', scene: 'spire_observatory' },
  tags: ['fantasy', 'seed'],
  creator: 'formatavern',
  version: '1'
};

export const alice: CharacterCard = {
  id: 'alice',
  name: 'Alice',
  description: 'A resourceful survivor navigating a hostile steampunk city.',
  personality: 'Guarded, defiant, razor-sharp instincts, fiercely loyal once won over.',
  scenario: 'Trapped in an abandoned tavern as rain lashes against the reinforced glass.',
  firstMessage: '*Rain lashes the glass.* "Step into the light where I can see your hands. Now."',
  style: {
    font: { family: "'Playfair Display', Georgia, serif", size: '1rem', lineHeight: '1.6' },
    colors: {
      charBubbleBg: 'rgba(24, 8, 16, 0.7)',
      charBubbleText: '#f5e6e8',
      charBubbleBorder: 'rgba(159, 18, 57, 0.4)',
      userBubbleBg: 'rgba(15, 23, 42, 0.8)',
      userBubbleText: '#f8fafc',
      accent: '#9f1239',
      quote: '#fda4af',
      action: '#c4b5fd',
      narratorText: '#e2e8f0'
    },
    bubble: { radius: '0.5rem', charTail: 'left', padding: '1rem 1.25rem' },
    background: { overlay: 'rgba(15, 5, 10, 0.8)', blur: '6px' },
    fx: { bubble: 'glow' }
  },
  stateSchema: {
    mood: {
      type: 'enum',
      values: ['guarded', 'defiant', 'warm', 'furious'],
      aliases: { cold: 'guarded' },
      default: 'guarded'
    },
    affinity: { type: 'int', min: 0, max: 10, default: 4 },
    danger: { type: 'enum', values: ['low', 'elevated', 'high'], default: 'elevated' },
    scene: { type: 'string', default: 'tavern_ambush' }
  },
  stateBindings: [
    {
      when: { mood: 'furious' },
      set: { 'colors.accent': '#e11d48', 'colors.charBubbleBorder': 'rgba(225, 29, 72, 0.7)' }
    }
  ],
  initialState: { mood: 'guarded', affinity: 4, danger: 'elevated', scene: 'tavern_ambush' },
  tags: ['gothic', 'steampunk', 'seed'],
  creator: 'formatavern',
  version: '1',
  customCss: `/* ==========================================================
   Alice — Gothic Gold Architectural Showpiece
   Theme: Victorian Steampunk / Gothic Gold Elegance
   ========================================================== */

/* Hero Banner Vignette & Gold Frame */
.ft-hero {
  border: 1px solid rgba(217, 119, 6, 0.45);
  background: radial-gradient(
    ellipse at top right,
    rgba(159, 18, 57, 0.25) 0%,
    rgba(24, 8, 16, 0.9) 70%,
    rgba(10, 4, 8, 0.98) 100%
  );
  box-shadow: 0 0 24px rgba(217, 119, 6, 0.12);
  border-radius: 8px;
}

/* Showcase Body Serif Polish */
.ft-showcase-body {
  font-family: 'Playfair Display', Georgia, serif;
  color: #fce7f3;
}

/* Character Bubble: Gothic Parchment Edge & Gold Accent */
.ft-bubble-char {
  border: 1px solid rgba(217, 119, 6, 0.5);
  background-color: rgba(28, 10, 20, 0.88);
  border-radius: 6px;
  box-shadow:
    inset 0 0 16px rgba(217, 119, 6, 0.08),
    0 2px 10px rgba(0, 0, 0, 0.4);
  position: relative;
}

/* Slow Glow Preset Synergy */
.ft-bubble-char[data-fx="glow"] {
  box-shadow:
    inset 0 0 16px rgba(217, 119, 6, 0.12),
    0 0 18px rgba(217, 119, 6, 0.2),
    0 0 32px rgba(159, 18, 57, 0.15);
}

/* User Bubble Complement */
.ft-bubble-user {
  border: 1px solid rgba(159, 18, 57, 0.35);
  background-color: rgba(18, 8, 14, 0.8);
  border-radius: 6px;
}

/* Steampunk Label Swap */
.ft-action-hub button::before {
  content: "⚙ ";
  color: #f59e0b;
}

/* Tag Chips Polish */
.ft-tag-chips span {
  border-color: rgba(217, 119, 6, 0.3);
  background-color: rgba(35, 12, 22, 0.6);
}
`
};

export const seedCharacters: readonly CharacterCard[] = [eldrin, alice];
