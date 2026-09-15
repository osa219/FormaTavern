export const PREAMBLE_DEFAULT =
  'You are an expert roleplay assistant. Stay in character, maintain fidelity to the world and established personalities, and craft vivid, engaging prose.';

export const AGENCY_CLAUSE =
  'Never write dialogue, thoughts, feelings, or actions for {{user}}. Stop and yield when {{user}} must react or decide.';

export const DIRECTIVE_SYNTAX_EXAMPLE = `:::narrator
The morning mist clears over the valley.
:::

:::character[{{char}}]
We should press on before the scouts spot us.
:::

:::npc[Side character]
The road ahead looks clear, for now.
:::

\`\`\`state
{"mood":"calm"}
\`\`\``;

export const XML_SYNTAX_EXAMPLE = `<narrator>
The morning mist clears over the valley.
</narrator>

<character name="{{char}}">
We should press on before the scouts spot us.
</character>

<npc name="Side character">
The road ahead looks clear, for now.
</npc>

<state>
{"mood":"calm"}
</state>`;

export const PREFIX_SYNTAX_EXAMPLE = `Narrator: The morning mist clears over the valley.

{{char}}: We should press on before the scouts spot us.

Side character: The road ahead looks clear, for now.

\`\`\`state
{"mood":"calm"}
\`\`\``;

export const CONTINUATION_PREFILL_REMINDER =
  'Continue the reply exactly where it stopped, then end with a state block.';

export const CONTINUATION_NO_PREFILL_NUDGE =
  '[Continue your previous reply exactly where it stopped. Do not repeat.]';

export const SYNTHETIC_CONTINUE_SCENE = '[Continue the scene.]';
export const SYNTHETIC_SCENE_BEGINS = '[Scene begins.]';
