<script lang="ts">
  import { page } from '$app/state';
  import { HOOKS } from '@formatavern/shared';
  import Icon from '../ui/Icon.svelte';

  const path = $derived(page.url.pathname);

  function isActive(href: string): boolean {
    if (href === '/') return path === '/';
    return path === href || path.startsWith(href + '/');
  }

  const linkBase =
    'flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  const linkIdle = 'text-(--chrome-text)/55 hover:text-(--chrome-text)';
  const linkActive = 'text-accent';
</script>

<nav
  aria-label="Primary"
  style="padding-bottom: env(safe-area-inset-bottom, 0px); font-family: var(--chrome-font, var(--theme-font-family));"
  class="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-1 border-t border-(--chrome-line) chrome-bar px-3 pt-1.5 md:hidden {HOOKS.chrome.bottomnav}"
>
  <a
    href="/"
    aria-label="Home"
    aria-current={isActive('/') ? 'page' : undefined}
    class="{linkBase} {isActive('/') ? linkActive : linkIdle}"
  >
    <Icon name="home" size={20} />
    <span>Home</span>
  </a>
  <a
    href="/chats"
    aria-label="Chats"
    aria-current={isActive('/chats') ? 'page' : undefined}
    class="{linkBase} {isActive('/chats') ? linkActive : linkIdle}"
  >
    <Icon name="message" size={20} />
    <span>Chats</span>
  </a>
  <a
    href="/personas"
    aria-label="Personas"
    aria-current={isActive('/personas') ? 'page' : undefined}
    class="{linkBase} {isActive('/personas') ? linkActive : linkIdle}"
  >
    <Icon name="user" size={20} />
    <span>Personas</span>
  </a>
</nav>
