<script lang="ts">
  import { renderShowcaseMarkdown } from '$lib/render/showcase';
  import { HOOKS } from '@formatavern/shared';

  interface Props {
    markdown: string;
    class?: string;
  }

  let { markdown, class: className = '' }: Props = $props();
  let html = $derived(renderShowcaseMarkdown(markdown));
</script>

<div class="showcase-body {HOOKS.character.showcaseBody} {className}">
  {@html html}
</div>
