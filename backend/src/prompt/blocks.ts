import { applyMacros } from '@formatavern/shared';
import type { PromptContext, BlockId } from './types';
import {
  PREAMBLE_DEFAULT,
  CONTINUATION_PREFILL_REMINDER,
  renderExampleForDialect
} from './templates';

export function getDialect(ctx: PromptContext): 'directive' | 'xml' | 'prefix' | 'classic' {
  const mode = ctx.chat.narrativeMode ?? 'classic';
  if (mode === 'narrative') {
    return ctx.chat.envelopeDialect ?? 'directive';
  }
  return 'classic';
}

function macro(text: string, ctx: PromptContext): string {
  return applyMacros(text, {
    char: ctx.character.name,
    user: ctx.persona.name
  });
}

export function generateBlock(id: BlockId, ctx: PromptContext, warnings: string[] = []): string | null {
  const mode = ctx.chat.narrativeMode ?? 'classic';
  const dialect = getDialect(ctx);

  switch (id) {
    case '1': {
      const p = ctx.preamble ?? PREAMBLE_DEFAULT;
      return macro(p, ctx);
    }

    case '1b': {
      if (mode !== 'narrative') return null;

      let syntaxDesc = [
        'Structure your response using directive blocks:',
        '- :::narrator ... ::: for scene description, environment, and physical actions.',
        '- :::character[{{char}}] ... ::: for {{char}}\'s spoken dialogue and thoughts.',
        '- :::npc[Name] ... ::: when a side character speaks or acts (use their actual name).',
        '- ```state ... ``` at the very end with current mood and scene as JSON.'
      ].join('\n');

      if (dialect === 'xml') {
        syntaxDesc = [
          'Structure your response using XML tags:',
          '- <narrator> ... </narrator> for scene description, environment, and physical actions.',
          '- <character name="{{char}}"> ... </character> for {{char}}\'s spoken dialogue and thoughts.',
          '- <npc name="..."> ... </npc> when a side character speaks or acts (use their actual name).',
          '- <state> ... </state> at the very end with current mood and scene as JSON.'
        ].join('\n');
      } else if (dialect === 'prefix') {
        syntaxDesc = [
          'Structure your response using speaker prefix lines:',
          '- Narrator: ... for scene description, environment, and physical actions.',
          '- {{char}}: ... for {{char}}\'s spoken dialogue and thoughts.',
          '- Name: ... when a side character speaks or acts (use their actual name).',
          '- ```state ... ``` at the very end with current mood and scene as JSON.'
        ].join('\n');
      }
      // Single canonical example (directive-authored), rendered into the active
      // dialect; falls back to built-in with a warning on render failure.
      const example = renderExampleForDialect(
        dialect === 'classic' ? 'directive' : dialect,
        ctx.narrativeExample,
        warnings
      );

      let stateDesc = 'End every reply with a state block exactly as shown above.';
      const schemaFields = ctx.character.stateSchema ? Object.entries(ctx.character.stateSchema) : [];
      if (schemaFields.length > 0) {
        const fieldLines: string[] = [];
        for (const [key, field] of schemaFields) {
          if (field.type === 'enum') {
            fieldLines.push(`- ${key}: one of ${field.values.join(', ')} (default ${field.default})`);
          } else if (field.type === 'int') {
            fieldLines.push(`- ${key}: integer ${field.min}–${field.max} (default ${field.default})`);
          } else {
            fieldLines.push(`- ${key}: short string (default ${field.default})`);
          }
        }
        stateDesc += '\nState schema fields:\n' + fieldLines.join('\n');
      } else {
        stateDesc += ' Include mood and scene in the state block.';
      }

      const content = [
        '[Response Format]',
        syntaxDesc,
        'Example structure:',
        example,
        'The example above teaches format only. Draw all characters, settings, and dialogue from the ongoing story.',
        stateDesc
      ].join('\n\n');

      return macro(content, ctx);
    }

    case '1c': {
      const prompt = ctx.configPrompt?.trim();
      if (!prompt) return null;
      return macro(prompt, ctx);
    }

    case '2': {
      const desc = ctx.character.description?.trim();
      if (!desc) return null;
      return macro(`[{{char}}'s description]\n${desc}`, ctx);
    }

    case '3': {
      const pers = ctx.character.personality?.trim();
      if (!pers) return null;
      return macro(`[{{char}}'s personality]\n${pers}`, ctx);
    }

    case '4': {
      const scen = ctx.character.scenario?.trim();
      if (!scen) return null;
      return macro(`[Scenario]\n${scen}`, ctx);
    }

    case '5': {
      const ex = ctx.character.exampleDialogue?.trim();
      if (!ex) return null;
      return macro(`[Example dialogue]\n${ex}`, ctx);
    }

    case '6': {
      if (!ctx.lorebookEntries || ctx.lorebookEntries.length === 0) return null;
      const bullets = ctx.lorebookEntries.map((e) => `- ${e.trim()}`).join('\n');
      return macro(`[World information]\n${bullets}`, ctx);
    }

    case '6b': {
      if (mode !== 'narrative' || !ctx.activeNpcs || ctx.activeNpcs.length === 0) return null;
      const bullets = ctx.activeNpcs
        .map((npc) => `- ${npc.displayName}: ${npc.voice?.trim() || 'no notes'}`)
        .join('\n');
      return macro(`[Side characters present]\n${bullets}`, ctx);
    }

    case '7': {
      const header = `[User persona: {{user}}]`;
      const desc = ctx.persona.description?.trim();
      const content = desc ? `${header}\n${desc}` : header;
      return macro(content, ctx);
    }

    case '7b': {
      if (mode !== 'narrative' || !ctx.sceneState) return null;
      const stateObj = ctx.sceneState;

      const pairs: string[] = [];
      if (ctx.character.stateSchema) {
        // Schema key order
        for (const key of Object.keys(ctx.character.stateSchema)) {
          if (key in stateObj) {
            pairs.push(`${key}=${String(stateObj[key])}`);
          }
        }
      } else {
        // Alphabetical key order for classic
        for (const key of Object.keys(stateObj).sort()) {
          pairs.push(`${key}=${String(stateObj[key])}`);
        }
      }

      if (pairs.length === 0) return null;
      return macro(`[Scene state: ${pairs.join(', ')}]`, ctx);
    }

    case '8': {
      // History turn serialization handled in history.ts
      return null;
    }

    case '9a': {
      const dir = ctx.chat.standingDirection?.trim();
      if (!dir) return null;
      return macro(`[Standing direction: ${dir}]`, ctx);
    }

    case '9b': {
      const note = ctx.directorNote?.trim();
      if (!note) return null;
      return macro(`[Director's note for this turn: ${note}]`, ctx);
    }

    case '9c': {
      if (mode !== 'narrative') return null;

      if (ctx.continuation && ctx.provider.prefill) {
        return macro(CONTINUATION_PREFILL_REMINDER, ctx);
      }

      return macro(`Reply using the ${dialect} block format and end with a state block.`, ctx);
    }
  }
}
