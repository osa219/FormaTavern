<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { PageData } from './$types';
  import { ChatSession } from '$lib/state/session.svelte';
  import { ThemeEngine } from '$lib/theme/engine.svelte';
  import ChatViewport from '$lib/components/chat/ChatViewport.svelte';

  let { data }: { data: PageData } = $props();

  const session = untrack(
    () =>
      new ChatSession({
        chat: data.chat,
        character: data.character,
        persona: data.persona,
        messages: data.messages,
        hasOlder: data.hasOlder
      })
  );

  const themeEngine = new ThemeEngine(() => session.themeInputs);

  $effect(() => {
    session.chat = data.chat;
    session.character = data.character;
    session.persona = data.persona;
    session.hasOlder = data.hasOlder;
  });

  onDestroy(() => {
    session.destroy();
  });
</script>

<ChatViewport {session} {themeEngine} />
