<script lang="ts">
  import { onMount } from 'svelte';
  import { TEST_STREAM_EXPECTED_TEXT } from '@formatavern/shared';
  import { api, readTestStream } from '$lib/api';

  type Status = 'idle' | 'streaming' | 'done' | 'error';
  let health = $state('…');
  let text = $state('');
  let status = $state<Status>('idle');
  let deltas = $state<number[]>([]);

  onMount(async () => {
    const { data, error } = await api.api.health.get();
    health = error
      ? `ERROR ${error.status}`
      : `ok · shared ${data.sharedVersion} · db v${data.db.schemaVersion} · ${data.db.characters} chars / ${data.db.personas} persona`;
  });

  async function run() {
    text = ''; deltas = []; status = 'streaming';
    try {
      await readTestStream({
        onEvent: (e) => {
          if (e.type === 'token') text += e.text;
          else if (e.type === 'done') status = 'done';
          else if (e.type === 'error') status = 'error';
        },
        onChunk: (_b, d) => { deltas.push(d); }
      });
      if ((status as Status) !== 'done') status = 'error';
    } catch { status = 'error'; }
  }
</script>

<p>health: {health}</p>
<button onclick={run} disabled={status === 'streaming'}>Run test stream</button>
<pre>{text}</pre>
<p>status: {status} {status === 'done' && text === TEST_STREAM_EXPECTED_TEXT ? '✓ matches shared contract' : ''}</p>
<p>chunk deltas (ms): {deltas.join(', ')}</p>
