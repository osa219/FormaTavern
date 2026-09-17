import {
  CharacterCardSchema,
  DEFAULT_CHARACTER_THEME,
  resolveTheme,
  shellToThemeOverrides,
  validate,
  type CharacterCard,
  type CharacterCreate,
  type StateVector,
  type ValidationIssue
} from '@formatavern/shared';
import { loadCustomCss } from '@formatavern/shared/customCss/loader';
import { api, toUiError } from '$lib/api';
import { toasts } from '$lib/state/toasts.svelte';
import { shellTheme } from '$lib/state/shellTheme.svelte';

export function createEmptyCard(): CharacterCreate {
  return {
    name: '',
    tagline: '',
    creator: '',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    exampleDialogue: '',
    showcase: '',
    customCss: '',
    tags: [],
    style: JSON.parse(JSON.stringify(DEFAULT_CHARACTER_THEME)),
    layout: undefined,
    stateSchema: {},
    stateBindings: [],
    initialState: {}
  };
}

export class CharacterDraft {
  readonly characterId: string | null = null;
  readonly routeKey: string;
  readonly ownerId: string;
  expectedUpdatedAt: number | null = null;

  card = $state<CharacterCreate>(createEmptyCard());
  snapshot = $state<string>('');
  previewState = $state<StateVector>({});

  get validation() {
    return validate(CharacterCardSchema, this.withProvisionalId());
  }

  get issues(): ValidationIssue[] {
    return this.validation.ok ? [] : this.validation.issues;
  }

  get issuesByPath(): Map<string, ValidationIssue[]> {
    const map = new Map<string, ValidationIssue[]>();
    for (const issue of this.issues) {
      const existing = map.get(issue.path) ?? [];
      existing.push(issue);
      map.set(issue.path, existing);
    }
    return map;
  }

  get dirty(): boolean {
    return this.snapshot !== JSON.stringify(this.card);
  }

  get previewTheme() {
    return resolveTheme({
      global: shellToThemeOverrides(shellTheme.theme),
      character: this.card.style,
      bindings: this.card.stateBindings,
      state: this.previewState,
      a11y: {
        disableCharacterThemes: false,
        disableReactiveTheming: false
      }
    });
  }

  private autosaveInterval: any = null;
  private client: any;

  constructor(initialCard?: CharacterCard | null, client: any = api) {
    this.client = client;
    if (initialCard) {
      this.characterId = initialCard.id;
      this.expectedUpdatedAt = initialCard.updatedAt ?? null;
      this.routeKey = initialCard.id;
      this.ownerId = initialCard.id;
      this.card = {
        name: initialCard.name,
        tagline: initialCard.tagline ?? '',
        creator: initialCard.creator ?? '',
        description: initialCard.description,
        personality: initialCard.personality,
        scenario: initialCard.scenario,
        firstMessage: initialCard.firstMessage,
        exampleDialogue: initialCard.exampleDialogue ?? '',
        showcase: initialCard.showcase ?? '',
        customCss: initialCard.customCss ?? '',
        tags: [...(initialCard.tags ?? [])],
        style: JSON.parse(JSON.stringify(initialCard.style)),
        layout: initialCard.layout ? JSON.parse(JSON.stringify(initialCard.layout)) : undefined,
        stateSchema: initialCard.stateSchema ? JSON.parse(JSON.stringify(initialCard.stateSchema)) : {},
        stateBindings: initialCard.stateBindings ? JSON.parse(JSON.stringify(initialCard.stateBindings)) : [],
        initialState: initialCard.initialState ? JSON.parse(JSON.stringify(initialCard.initialState)) : {}
      };
    } else {
      this.characterId = null;
      this.routeKey = 'new';
      // Provisional draft owner for asset uploads before saving
      this.ownerId = `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      this.card = createEmptyCard();
    }

    this.snapshot = JSON.stringify(this.card);
    if (this.card.initialState) {
      this.previewState = JSON.parse(JSON.stringify(this.card.initialState));
    }
  }

  withProvisionalId(): Record<string, unknown> {
    return {
      id: this.characterId || 'provisional-slug',
      ...this.card
    };
  }

  hasAutosave(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const saved = localStorage.getItem(`ft.draft.${this.routeKey}`);
      return Boolean(saved && saved !== this.snapshot);
    } catch {
      return false;
    }
  }

  restoreAutosave(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(`ft.draft.${this.routeKey}`);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      this.card = parsed;
      return true;
    } catch {
      return false;
    }
  }

  startAutosave(): void {
    if (typeof window === 'undefined') return;
    this.stopAutosave();
    this.autosaveInterval = setInterval(() => {
      if (this.dirty) {
        try {
          localStorage.setItem(`ft.draft.${this.routeKey}`, JSON.stringify(this.card));
        } catch {}
      }
    }, 2000);
  }

  stopAutosave(): void {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }
  }

  clearAutosave(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(`ft.draft.${this.routeKey}`);
    } catch {}
  }

  discard(): void {
    this.clearAutosave();
    this.card = JSON.parse(this.snapshot);
  }

  async save(): Promise<'saved' | 'stale' | 'invalid' | 'error'> {
    // Clean up empty decor layers, empty sizes, and empty offsets before validating and persisting
    if (this.card.style?.decor) {
      const activeDecor = this.card.style.decor
        .filter((d) => d.image && d.image.trim().length > 0)
        .map((d) => {
          const cleaned = { ...d };
          if (!cleaned.size?.trim()) {
            delete cleaned.size;
          }
          if (cleaned.offset) {
            const x = cleaned.offset.x?.trim() || undefined;
            const y = cleaned.offset.y?.trim() || undefined;
            if (x || y) {
              cleaned.offset = { x, y };
            } else {
              delete cleaned.offset;
            }
          }
          return cleaned;
        });
      this.card.style.decor = activeDecor.length > 0 ? activeDecor : undefined;
    }

    if (this.issues.length > 0) {
      toasts.error(`Cannot save: ${this.issues.length} validation issue(s) remain`);
      return 'invalid';
    }

    if (this.card.customCss?.trim()) {
      try {
        const { sanitizeCss } = await loadCustomCss();
        const out = sanitizeCss(this.card.customCss, 'character');
        const fatal = out.report.find((r) => r.kind === 'parse-fatal');
        if (fatal) {
          toasts.error(`Cannot save: CSS syntax error: ${fatal.detail}`);
          return 'invalid';
        }
      } catch (err: any) {
        toasts.error(`CSS validation failed: ${err.message}`);
        return 'invalid';
      }
    }

    try {
      if (this.characterId) {
        // PATCH existing character with OCC expectedUpdatedAt
        const payload: any = {
          ...this.card,
          customCss: this.card.customCss?.trim() ? this.card.customCss : null,
          layout: this.card.layout ? this.card.layout : null,
          expectedUpdatedAt: this.expectedUpdatedAt ?? Date.now()
        };
        const res = await (this.client.api.characters({ id: this.characterId }).patch as any)(payload);

        if (res.error) {
          const err = toUiError(res.error);
          if (err.code === 'stale_write' || res.status === 409) {
            return 'stale';
          }
          toasts.error(err.message);
          return 'error';
        }

        const updated = res.data as CharacterCard;
        this.expectedUpdatedAt = updated.updatedAt ?? Date.now();
        this.snapshot = JSON.stringify(this.card);
        this.clearAutosave();
        toasts.success(`Saved "${updated.name}"`);
        return 'saved';
      } else {
        // POST new character (promotes draft owner if uploaded)
        const payload: any = {
          ...this.card,
          customCss: this.card.customCss?.trim() ? this.card.customCss : undefined,
          layout: this.card.layout ? this.card.layout : undefined
        };
        const res = await (this.client.api.characters.post as any)(payload);
        if (res.error) {
          toasts.error(toUiError(res.error).message);
          return 'error';
        }

        const created = res.data as CharacterCard;
        this.snapshot = JSON.stringify(this.card);
        this.clearAutosave();
        toasts.success(`Created character "${created.name}"`);
        return 'saved';
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return 'error';
    }
  }
}
