<script lang="ts">
  import { renderRoleplayMarkdown } from '$lib/render/markdown';
  import { rewriteHtmlMediaUrls, type MediaRewriteOptions } from '$lib/render/mediaRewrite';

  let {
    text = '',
    mediaOptions
  }: {
    text?: string;
    mediaOptions?: MediaRewriteOptions;
  } = $props();

  const html = $derived(rewriteHtmlMediaUrls(renderRoleplayMarkdown(text), mediaOptions));
</script>

<div class="prose-roleplay">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html}
</div>
