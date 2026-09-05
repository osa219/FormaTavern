<script lang="ts">
  import type { PageData } from './$types';
  import type { CharacterCard } from '@formatavern/shared';
  import { CharacterDraft } from '$lib/studio/draft.svelte';
  import StudioShell from '$lib/components/studio/StudioShell.svelte';

  let { data }: { data: PageData } = $props();

  const character = $derived(data.character as CharacterCard);
  const draft = $derived(new CharacterDraft(character));
</script>

<svelte:head>
  <title>Edit {character.name} — FormaTavern Studio</title>
</svelte:head>

<StudioShell {draft} />
