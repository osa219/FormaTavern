<script lang="ts">
  import { renderShowcaseMarkdown } from '$lib/render/showcase';
  import {
    rewriteHtmlMediaUrls,
    resolveMediaHashes,
    subscribeMediaCache,
    getMediaCacheVersion,
    type MediaRewriteOptions
  } from '$lib/render/mediaRewrite';
  import { extractMediaHashes, HOOKS } from '@formatavern/shared';

  interface Props {
    markdown: string;
    class?: string;
    mediaOptions?: MediaRewriteOptions;
    stripImages?: boolean;
  }

  let { markdown, class: className = '', mediaOptions, stripImages = false }: Props = $props();

  let version = $state(getMediaCacheVersion());

  $effect(() => {
    const unsub = subscribeMediaCache(() => {
      version = getMediaCacheVersion();
    });
    return unsub;
  });

  $effect(() => {
    const hashes = extractMediaHashes(markdown);
    if (hashes.length > 0) {
      void resolveMediaHashes(hashes, mediaOptions);
    }
  });

  const html = $derived.by(() => {
    void version;
    return rewriteHtmlMediaUrls(renderShowcaseMarkdown(markdown, { stripImages }), mediaOptions);
  });
</script>

<div class="showcase-body {HOOKS.character.showcaseBody} {className}">
  {@html html}
</div>
