<script lang="ts">
  import { goto } from '$app/navigation';
  import type { PersonaCreate } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import { personasStore } from '$lib/state/personas.svelte';
  import PersonaEditor from '$lib/components/persona/PersonaEditor.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import ShellSurface from '$lib/components/custom/ShellSurface.svelte';

  async function handleSave(data: any) {
    const created = await personasStore.create(data as PersonaCreate);
    if (created) {
      goto('/personas');
    }
  }
</script>

<ShellSurface class={HOOKS.shell.personas}>
  <!-- Header -->
  <header class="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-(--chrome-line) chrome-bar px-4 md:px-6">
    <div class="flex min-w-0 items-center gap-2 md:gap-3">
      <a
        href="/personas"
        class="flex items-center gap-1.5 text-xs text-(--chrome-text)/60 hover:text-(--chrome-text) shrink-0"
        title="Personas"
      >
        <Icon name="arrow-left" size={14} />
        <span class="hidden md:inline">Personas</span>
      </a>
      <span class="text-(--chrome-text)/40 hidden md:inline">/</span>
      <h1 class="truncate text-sm font-bold tracking-wide text-(--chrome-text) uppercase">
        Create New Persona
      </h1>
    </div>
  </header>

  <main class="w-full mx-auto max-w-4xl px-4 md:px-6 py-8 max-md:pb-24">
    <div class="mb-8">
      <h2 class="text-2xl font-bold tracking-tight text-(--chrome-text)">
        New Persona
      </h2>
      <p class="mt-1 text-sm text-(--chrome-text)/60">
        Customize your roleplay persona details and speech bubble theme.
      </p>
    </div>

    <PersonaEditor
      onSave={handleSave}
      onCancel={() => goto('/personas')}
    />
  </main>
</ShellSurface>
