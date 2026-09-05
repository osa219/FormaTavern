import type { Persona, PersonaCreate, PersonaPatch } from '@formatavern/shared';
import { api, toUiError } from '$lib/api';
import { toasts } from '$lib/state/toasts.svelte';

export class PersonasStore {
  items = $state<Persona[]>([]);
  loading = $state(false);

  defaultPersona = $derived(this.items.find((p) => p.isDefault) ?? this.items[0] ?? null);

  async load(): Promise<Persona[]> {
    this.loading = true;
    try {
      const res = await api.api.personas.get();
      if (res.data && Array.isArray(res.data)) {
        this.items = res.data as Persona[];
        return this.items;
      }
      return [];
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return [];
    } finally {
      this.loading = false;
    }
  }

  async setDefault(id: string): Promise<boolean> {
    try {
      const res = await api.api.personas({ id }).default.post();
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return false;
      }
      if (res.data && Array.isArray(res.data)) {
        this.items = res.data as Persona[];
      } else {
        this.items = this.items.map((p) => ({ ...p, isDefault: p.id === id }));
      }
      toasts.success('Default persona updated');
      return true;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return false;
    }
  }

  async create(data: PersonaCreate): Promise<Persona | null> {
    try {
      const res = await api.api.personas.post(data);
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return null;
      }
      const created = res.data as Persona;
      if (created) {
        this.items.push(created);
        toasts.success(`Persona "${created.name}" created`);
        return created;
      }
      return null;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return null;
    }
  }

  async patch(id: string, patch: PersonaPatch): Promise<Persona | null> {
    try {
      const res = await api.api.personas({ id }).patch(patch);
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return null;
      }
      const updated = res.data as Persona;
      if (updated) {
        this.items = this.items.map((p) => (p.id === id ? updated : p));
        toasts.success(`Persona updated`);
        return updated;
      }
      return null;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return null;
    }
  }

  async remove(id: string, reassignTo?: string): Promise<{ success: boolean; conflictChats?: number }> {
    try {
      const res = await (api.api.personas({ id }).delete as any)({
        query: reassignTo ? { reassignTo } : {}
      });
      if (res.error) {
        const uiErr = toUiError(res.error);
        if (uiErr.code === 'persona_in_use') {
          return { success: false, conflictChats: (uiErr.details as any)?.chats ?? 1 };
        }
        toasts.error(uiErr.message);
        return { success: false };
      }
      this.items = this.items.filter((p) => p.id !== id);
      toasts.success('Persona deleted');
      return { success: true };
    } catch (err: any) {
      const uiErr = toUiError(err);
      if (uiErr.code === 'persona_in_use') {
        return { success: false, conflictChats: (uiErr.details as any)?.chats ?? 1 };
      }
      toasts.error(uiErr.message);
      return { success: false };
    }
  }
}

export const personasStore = new PersonasStore();
