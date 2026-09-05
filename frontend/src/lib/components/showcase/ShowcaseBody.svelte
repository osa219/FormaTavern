<script lang="ts">
  import { renderShowcaseMarkdown } from '$lib/render/showcase';

  interface Props {
    markdown: string;
    class?: string;
  }

  let { markdown, class: className = '' }: Props = $props();
  let html = $derived(renderShowcaseMarkdown(markdown));
</script>

<div class="showcase-body {className}">
  {@html html}
</div>
