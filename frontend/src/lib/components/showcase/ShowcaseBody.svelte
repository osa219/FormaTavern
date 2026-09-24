<script lang="ts">
  import { renderShowcaseMarkdown } from '$lib/render/showcase';
  import { rewriteHtmlMediaUrls, type MediaRewriteOptions } from '$lib/render/mediaRewrite';
  import { HOOKS } from '@formatavern/shared';

  interface Props {
    markdown: string;
    class?: string;
    mediaOptions?: MediaRewriteOptions;
  }

  let { markdown, class: className = '', mediaOptions }: Props = $props();
  let html = $derived(rewriteHtmlMediaUrls(renderShowcaseMarkdown(markdown), mediaOptions));
</script>

<div class="showcase-body {HOOKS.character.showcaseBody} {className}">
  {@html html}
</div>
