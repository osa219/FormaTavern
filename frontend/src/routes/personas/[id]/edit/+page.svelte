<script lang="ts">
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import type { Persona, PersonaPatch } from '@formatavern/shared';
  import { personasStore } from '$lib/state/personas.svelte';
  import PersonaEditor from '$lib/components/persona/PersonaEditor.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  let { data }: { data: PageData } = $props();
  const persona = $derived(data.persona as Persona);

  async function handleSave(args: any) {
    const updated = await personasStore.patch(args.id, args.patch as PersonaPatch);
    if (updated) {
      goto('/personas');
    }
  }
</script>

<div class="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
  <header class="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-neutral-800/80 bg-neutral-900/80 px-6 backdrop-blur-md">
    <div class="flex items-center gap-3">
      <a
        href="/personas"
        class="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200"
      >
        <Icon name="arrow-left" size={14} />
        <span>Personas</span>
      </a>
      <span class="text-neutral-700">/</span>
      <h1 class="text-sm font-bold tracking-wide text-neutral-100 uppercase">
        Edit Persona: {persona.name}
      </h1>
    </div>
  </header>

  <main class="mx-auto max-w-4xl px-6 py-8">
    <div class="mb-8">
      <h2 class="text-2xl font-bold tracking-tight text-neutral-100">
        Edit Persona
      </h2>
      <p class="mt-1 text-sm text-neutral-400">
        Update persona traits and speech bubble aesthetics.
      </p>
    </div>

    <PersonaEditor
      {persona}
      onSave={handleSave}
      onCancel={() => goto('/personas')}
    />
  </main>
</div>
