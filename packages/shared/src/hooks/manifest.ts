export const SURFACE_ATTR = 'data-ft-surface' as const;
export const SURFACES = ['shell', 'character', 'chat'] as const;
export type SurfaceScope = (typeof SURFACES)[number];

export const HOOKS = {
  chrome: {
    topbar: 'ft-topbar',
    navdrawer: 'ft-navdrawer',
    card: 'ft-char-card',
    dialog: 'ft-dialog'
  },
  shell: {
    foyerGrid: 'ft-foyer-grid',
    foyerHeader: 'ft-foyer-header',
    recentStories: 'ft-recent-stories',
    settings: 'ft-settings',
    personas: 'ft-personas',
    studio: 'ft-studio'
  },
  character: {
    hero: 'ft-hero',
    showcaseBody: 'ft-showcase-body',
    actionHub: 'ft-action-hub',
    tagChips: 'ft-tag-chips',
    creatorCredit: 'ft-creator-credit',
    resumeMenu: 'ft-resume-menu',
    decorLayers: 'ft-decor-layers',
    decorLayer: 'ft-decor-layer'
  },
  chat: {
    viewport: 'ft-viewport',
    backdrop: 'ft-backdrop',
    messageLog: 'ft-message-log',
    turn: 'ft-turn',
    bubbleChar: 'ft-bubble-char',
    bubbleUser: 'ft-bubble-user',
    bubbleNpc: 'ft-bubble-npc',
    narrator: 'ft-narrator',
    composer: 'ft-composer',
    loreDrawer: 'ft-lore-drawer',
    promptPreview: 'ft-prompt-preview',
    swipeCarousel: 'ft-swipe-carousel',
    turnToolbar: 'ft-turn-toolbar',
    streamCaret: 'ft-stream-caret',
    jumpToLatest: 'ft-jump-to-latest',
    decorLayers: 'ft-chat-decor-layers',
    decorLayer: 'ft-chat-decor-layer'
  }
} as const satisfies Record<string, Record<string, `ft-${string}`>>;
