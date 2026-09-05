<script lang="ts">
  import { onMount } from 'svelte';
  import {
    parseEnvelope,
    ENVELOPE_SCRIPTS,
    ENVELOPE_SCRIPT_IDS,
    type EnvelopeScriptId,
    type ParseResult
  } from '@formatavern/shared';
  import { api, readTestStream } from '$lib/api';

  type Status = 'idle' | 'streaming' | 'done' | 'error';
  let health = $state('…');
  let selectedScript = $state<EnvelopeScriptId>('envelope-directive');
  let text = $state('');
  let status = $state<Status>('idle');
  let errorMessage = $state('');
  let deltas = $state<number[]>([]);
  let parsed = $state<ParseResult | null>(null);

  onMount(async () => {
    const { data, error } = await api.api.health.get();
    health = error
      ? `ERROR ${error.status}`
      : `ok · shared ${data.sharedVersion} · db v${data.db.schemaVersion} · ${data.db.characters} chars / ${data.db.personas} persona`;
  });

  function getParseOptions(streaming: boolean) {
    const script = ENVELOPE_SCRIPTS[selectedScript];
    return {
      primaryCharacter: script.primaryCharacter,
      knownNames: script.knownNames,
      dialect: script.dialect,
      personaName: script.personaName ?? 'Traveler',
      streaming
    };
  }

  async function run() {
    text = '';
    deltas = [];
    status = 'streaming';
    errorMessage = '';
    parsed = null;

    try {
      await readTestStream(
        {
          onEvent: (e) => {
            if (e.type === 'token') {
              text += e.text;
              parsed = parseEnvelope(text, getParseOptions(true));
            } else if (e.type === 'done') {
              status = 'done';
              parsed = parseEnvelope(text, getParseOptions(false));
            } else if (e.type === 'error') {
              status = 'error';
              errorMessage = e.message;
            }
          },
          onChunk: (_b, d) => {
            deltas.push(d);
          }
        },
        { script: selectedScript }
      );
      if ((status as Status) !== 'done' && (status as Status) !== 'error') {
        status = 'done';
        parsed = parseEnvelope(text, getParseOptions(false));
      }
    } catch (err: any) {
      status = 'error';
      errorMessage = err?.message ?? 'Network failure';
    }
  }

  const parsedSummary = $derived(
    parsed
      ? JSON.stringify(
          {
            dialect: parsed.dialect,
            segments: parsed.segments.map((s) => [s.kind, s.name, s.text.slice(0, 30)]),
            statePatch: parsed.statePatch,
            truncatedAt: parsed.truncatedAt,
            warnings: parsed.warnings,
            heldBack: parsed.heldBack
          },
          null,
          2
        )
      : ''
  );
</script>

<p>health: {health}</p>

<label>
  Script:
  <select bind:value={selectedScript} disabled={status === 'streaming'}>
    {#each ENVELOPE_SCRIPT_IDS as id}
      <option value={id}>{id}</option>
    {/each}
  </select>
</label>

<button onclick={run} disabled={status === 'streaming'}>Run test stream</button>

<p>status: {status} {errorMessage ? `(${errorMessage})` : ''}</p>
<p>chunk deltas (ms): {deltas.join(', ')}</p>

<h3>Raw Stream Buffer</h3>
<pre>{text}</pre>

<h3>Isomorphic Parse Result</h3>
<pre>{parsedSummary}</pre>
