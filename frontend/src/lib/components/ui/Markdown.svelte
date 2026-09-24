<script lang="ts">
  import { renderRoleplayMarkdown } from '$lib/render/markdown';
  import {
    rewriteHtmlMediaUrls,
    resolveMediaHashes,
    subscribeMediaCache,
    getMediaCacheVersion,
    type MediaRewriteOptions
  } from '$lib/render/mediaRewrite';
  import { extractMediaHashes } from '@formatavern/shared';

  let {
    text = '',
    mediaOptions
  }: {
    text?: string;
    mediaOptions?: MediaRewriteOptions;
  } = $props();

  let version = $state(getMediaCacheVersion());

  $effect(() => {
    const unsub = subscribeMediaCache(() => {
      version = getMediaCacheVersion();
    });
    return unsub;
  });

  $effect(() => {
    const hashes = extractMediaHashes(text);
    if (hashes.length > 0) {
      void resolveMediaHashes(hashes, mediaOptions);
    }
  });

  const html = $derived.by(() => {
    void version;
    return rewriteHtmlMediaUrls(renderRoleplayMarkdown(text), mediaOptions);
  });
</script>

<div class="prose-roleplay">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html}
</div>
