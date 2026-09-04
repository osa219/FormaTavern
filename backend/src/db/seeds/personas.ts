import type { Persona } from '@formatavern/shared';

export const defaultPersona: Persona = {
  id: 'persona-default',
  name: 'Traveler',
  description: 'A wandering scholar seeking lost lore across fragmented realms.',
  isDefault: true
};

export const seedPersonas: readonly Persona[] = [defaultPersona];
