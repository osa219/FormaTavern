<script lang="ts">
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import type { Persona, PersonaPatch } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import { personasStore } from '$lib/state/personas.svelte';
  import PersonaEditor from '$lib/components/persona/PersonaEditor.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import ShellSurface from '$lib/components/custom/ShellSurface.svelte';

  let { data }: { data: PageData } = $props();
  const persona = $derived(data.persona as Persona);

  async function handleSave(args: any) {
    const updated = await personasStore.patch(args.id, args.patch as PersonaPatch);
    if (updated) {
      goto('/personas');
    }
  }
</script>

<ShellSurface class={HOOKS.shell.personas}>
  <header class="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-(--chrome-line) chrome-bar px-6">
    <div class="flex items-center gap-3">
      <a
        href="/personas"
        class="flex items-center gap-1.5 text-xs text-(--chrome-text)/60 hover:text-(--chrome-text)"
      >
        <Icon name="arrow-left" size={14} />
        <span>Personas</span>
      </a>
      <span class="text-(--chrome-text)/40">/</span>
      <h1 class="text-sm font-bold tracking-wide text-(--chrome-text) uppercase">
        Edit Persona: {persona.name}
      </h1>
    </div>
  </header>

  <main class="mx-auto max-w-4xl px-6 py-8">
    <div class="mb-8">
      <h2 class="text-2xl font-bold tracking-tight text-(--chrome-text)">
        Edit Persona
      </h2>
      <p class="mt-1 text-sm text-(--chrome-text)/60">
        Update persona traits and speech bubble aesthetics.
      </p>
    </div>

    <PersonaEditor
      {persona}
      onSave={handleSave}
      onCancel={() => goto('/personas')}
    />
  </main>
</ShellSurface>
