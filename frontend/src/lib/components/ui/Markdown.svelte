<script lang="ts">
  import { renderRoleplayMarkdown } from '$lib/render/markdown';

  let { text = '' }: { text?: string } = $props();

  const html = $derived(renderRoleplayMarkdown(text));
</script>

<div class="prose-roleplay">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html}
</div>
