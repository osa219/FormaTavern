<script lang="ts">
  import type { NarrativeRole } from '@formatavern/shared';

  let {
    role = 'persona',
    npcName = '',
    personaName = 'Traveler',
    primaryCharName = 'Character',
    npcs = {},
    onRoleChange,
    onNpcNameChange
  }: {
    role: NarrativeRole;
    npcName?: string;
    personaName?: string;
    primaryCharName?: string;
    npcs?: Record<string, unknown>;
    onRoleChange: (r: NarrativeRole) => void;
    onNpcNameChange: (name: string) => void;
  } = $props();

  const npcKeys = $derived(Object.keys(npcs));
</script>

<div class="flex items-center gap-1.5 text-xs text-neutral-400">
  <select
    value={role}
    onchange={(e) => onRoleChange((e.target as HTMLSelectElement).value as NarrativeRole)}
    class="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 focus:border-neutral-600 focus:outline-none"
    aria-label="Narrative voice"
  >
    <option value="persona">{personaName}</option>
    <option value="narrator">Narrator</option>
    <option value="npc">NPC…</option>
    <option value="character">{primaryCharName}</option>
  </select>

  {#if role === 'npc'}
    <input
      type="text"
      value={npcName}
      oninput={(e) => onNpcNameChange((e.target as HTMLInputElement).value)}
      list="npc-datalist"
      placeholder="NPC name…"
      class="w-28 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none"
      aria-label="NPC speaker name"
    />
    <datalist id="npc-datalist">
      {#each npcKeys as key}
        <option value={key}></option>
      {/each}
    </datalist>
  {/if}
</div>
