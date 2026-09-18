<script lang="ts">
  let {
    sort = 'recent',
    onSortChange
  }: {
    sort?: 'recent' | 'name' | 'stories';
    onSortChange: (sort: 'recent' | 'name' | 'stories') => void;
  } = $props();
</script>

<div class="flex items-center gap-2 text-xs">
  <label for="catalog-sort" class="font-mono text-[11px] uppercase tracking-wider text-(--chrome-text)/60">
    Sort:
  </label>
  <select
    id="catalog-sort"
    value={sort}
    onchange={(e) => onSortChange((e.target as HTMLSelectElement).value as any)}
    class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none"
  >
    <option value="recent">Recently Active</option>
    <option value="name">Alphabetical (A–Z)</option>
    <option value="stories">Most Chats</option>
  </select>
</div>
