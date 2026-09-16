import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { CharacterDraft, createEmptyCard } from '../src/lib/studio/draft.svelte';
import type { CharacterCard } from '@formatavern/shared';

describe('CharacterDraft & Studio State (Layer 7)', () => {
  const sampleCard: CharacterCard = {
    id: 'eldrin-the-mage',
    name: 'Eldrin the Mage',
    tagline: 'An ancient archmage',
    creator: 'Grand Magus',
    description: 'Master of arcane mysteries.',
    personality: 'Wise, cryptic, and watchful.',
    scenario: 'You meet Eldrin in his high tower library.',
    firstMessage: 'Speak quickly, traveler. Time is thin here.',
    exampleDialogue: '<narrator>He strokes his beard.</narrator>',
    showcase: '# Eldrin\nAn archmage.',
    tags: ['fantasy', 'magic', 'wizard'],
    style: {
      font: { family: 'Cinzel' },
      colors: {
        accent: '#9333ea',
        charBubbleBg: '#1e1b4b',
        charBubbleText: '#e0e7ff',
        userBubbleBg: '#0f172a',
        userBubbleText: '#f8fafc'
      },
      bubble: { radius: '1rem' },
      background: {}
    },
    stateSchema: { mana: { type: 'int', min: 0, max: 100, default: 100 } },
    stateBindings: [
      {
        when: { mana: 10 },
        set: { 'colors.accent': '#ef4444' }
      }
    ],
    initialState: { mana: 100 },
    createdAt: 1000,
    updatedAt: 1000
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes empty draft with provisional owner id and detects missing required fields', () => {
    const draft = new CharacterDraft();

    expect(draft.characterId).toBeNull();
    expect(draft.routeKey).toBe('new');
    expect(draft.ownerId.startsWith('draft-')).toBe(true);
    expect(draft.dirty).toBe(false);

    // Missing required fields
    expect(draft.validation.ok).toBe(false);
    expect(draft.issues.length).toBeGreaterThan(0);

    const paths = draft.issues.map((i) => i.path);
    expect(paths).toContain('/name');
    expect(draft.issuesByPath.has('/name')).toBe(true);
  });

  it('populates existing character correctly and reports zero validation issues', () => {
    const draft = new CharacterDraft(sampleCard);

    expect(draft.characterId).toBe('eldrin-the-mage');
    expect(draft.routeKey).toBe('eldrin-the-mage');
    expect(draft.ownerId).toBe('eldrin-the-mage');
    expect(draft.card.name).toBe('Eldrin the Mage');
    expect(draft.card.tags).toEqual(['fantasy', 'magic', 'wizard']);
    expect(draft.dirty).toBe(false);

    expect(draft.validation.ok).toBe(true);
    expect(draft.issues).toEqual([]);
  });

  it('tracks dirty state and allows discarding edits back to snapshot', () => {
    const draft = new CharacterDraft(sampleCard);
    expect(draft.dirty).toBe(false);

    draft.card.name = 'Eldrin the Dark';
    expect(draft.dirty).toBe(true);

    draft.discard();
    expect(draft.card.name).toBe('Eldrin the Mage');
    expect(draft.dirty).toBe(false);
  });

  it('reactively resolves preview theme with dynamic state bindings', () => {
    const draft = new CharacterDraft(sampleCard);

    // Initial state mana = 100 -> accent should be normal #9333ea
    expect(draft.previewTheme.theme.colors.accent).toBe('#9333ea');

    // Simulate state change to mana = 10 (< 20 threshold)
    draft.previewState = { mana: 10 };
    expect(draft.previewTheme.theme.colors.accent).toBe('#ef4444');
  });

  it('handles local draft autosave, detection, restoration, and clearing', () => {
    const draft = new CharacterDraft(sampleCard);
    expect(draft.hasAutosave()).toBe(false);

    // Simulate autosave storage
    draft.card.name = 'Eldrin with Unsaved Changes';
    localStorage.setItem(`ft.draft.${draft.routeKey}`, JSON.stringify(draft.card));

    expect(draft.hasAutosave()).toBe(true);

    // Reset card in memory and restore
    draft.card.name = 'Eldrin the Mage';
    const restored = draft.restoreAutosave();
    expect(restored).toBe(true);
    expect(draft.card.name).toBe('Eldrin with Unsaved Changes');

    draft.clearAutosave();
    expect(draft.hasAutosave()).toBe(false);
  });

  it('blocks save() with invalid status when validation issues exist', async () => {
    const draft = new CharacterDraft(); // Empty draft
    const result = await draft.save();
    expect(result).toBe('invalid');
  });

  it('calls POST when saving a new valid character draft', async () => {
    let postBody: any = null;
    const mockClient = {
      api: {
        characters: {
          post: mock(async (body: any) => {
            postBody = body;
            return {
              data: {
                id: 'new-companion',
                ...body,
                createdAt: 2000,
                updatedAt: 2000
              },
              error: null
            };
          })
        }
      }
    };

    const draft = new CharacterDraft(null, mockClient);
    draft.card = {
      name: 'New Companion',
      tagline: 'Tagline',
      creator: 'Author',
      description: 'Description here',
      personality: 'Personality here',
      scenario: 'Scenario here',
      firstMessage: 'Hello there!',
      exampleDialogue: '',
      showcase: '',
      tags: ['test'],
      style: createEmptyCard().style,
      stateSchema: {},
      stateBindings: [],
      initialState: {}
    };

    const result = await draft.save();
    expect(result).toBe('saved');
    expect(postBody.name).toBe('New Companion');
    expect(draft.dirty).toBe(false);
  });

  it('calls PATCH with expectedUpdatedAt when saving an existing character and handles stale conflict', async () => {
    let patchTargetId = '';
    let patchBody: any = null;

    const mockClient = {
      api: {
        characters: (params: { id: string }) => {
          patchTargetId = params.id;
          return {
            patch: mock(async (body: any) => {
              patchBody = body;
              return {
                data: null,
                status: 409,
                error: {
                  value: {
                    error: {
                      code: 'stale_write',
                      message: 'Companion was modified by another session'
                    }
                  }
                }
              };
            })
          };
        }
      }
    };

    const draft = new CharacterDraft(sampleCard, mockClient);
    draft.card.tagline = 'Updated tagline';

    const staleResult = await draft.save();
    expect(staleResult).toBe('stale');
    expect(patchTargetId).toBe('eldrin-the-mage');
    expect(patchBody.expectedUpdatedAt).toBe(1000);

    // Now switch mock client to return successful patch
    const successClient = {
      api: {
        characters: (params: { id: string }) => {
          patchTargetId = params.id;
          return {
            patch: mock(async (body: any) => {
              return {
                data: {
                  ...sampleCard,
                  ...body,
                  updatedAt: 1500
                },
                status: 200,
                error: null
              };
            })
          };
        }
      }
    };

    const draft2 = new CharacterDraft(sampleCard, successClient);
    draft2.card.tagline = 'Updated tagline';
    const successResult = await draft2.save();
    expect(successResult).toBe('saved');
    expect(draft2.expectedUpdatedAt).toBe(1500);
    expect(draft2.dirty).toBe(false);
  });

  it('populates layout from existing card and sends layout in PATCH payload', async () => {
    let patchBody: any = null;
    const mockClient = {
      api: {
        characters: () => ({
          patch: mock(async (body: any) => {
            patchBody = body;
            return {
              data: { ...sampleCard, ...body, updatedAt: 2000 },
              status: 200,
              error: null
            };
          })
        })
      }
    };

    const cardWithLayout: CharacterCard = {
      ...sampleCard,
      layout: {
        align: 'split',
        container: 'bubble',
        tails: true
      }
    };

    const draft = new CharacterDraft(cardWithLayout, mockClient);
    expect(draft.card.layout?.align).toBe('split');
    expect(draft.card.layout?.container).toBe('bubble');
    expect(draft.card.layout?.tails).toBe(true);

    // Modify layout
    draft.card.layout = {
      align: 'uniform-left',
      container: 'row',
      tails: false
    };
    expect(draft.dirty).toBe(true);

    const result = await draft.save();
    expect(result).toBe('saved');
    expect(patchBody.layout).toEqual({
      align: 'uniform-left',
      container: 'row',
      tails: false
    });

    // When layout is cleared (undefined), patch sends null (Invariant L4: clear to neutral)
    draft.card.layout = undefined;
    expect(draft.dirty).toBe(true);
    await draft.save();
    expect(patchBody.layout).toBeNull();
  });
});
