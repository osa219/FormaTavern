<script lang="ts">
  import type { PageData } from './$types';
  import ChatContainer from './ChatContainer.svelte';

  let { data }: { data: PageData } = $props();
</script>

{#key data.chatId}
  <ChatContainer {data} />
{/key}
