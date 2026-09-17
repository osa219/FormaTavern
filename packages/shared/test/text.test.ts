import { describe, it, expect } from 'bun:test';
import { applyMacros } from '../src/text/macros';
import { buildStopSequences } from '../src/text/stop';

describe('Text Utilities (Macros & Stop Sequences)', () => {
  describe('applyMacros', () => {
    it('handles {{char}} and {{user}} with various casing and spacing', () => {
      const vars = { char: 'Eldrin', user: 'Traveler' };
      const input = '{{char}} greets {{user}}. Then {{ CHAR }} bows to {{  user  }}.';
      const output = applyMacros(input, vars);
      expect(output).toBe('Eldrin greets Traveler. Then Eldrin bows to Traveler.');
    });

    it('handles legacy <BOT> and <USER> exact tokens', () => {
      const vars = { char: 'Eldrin', user: 'Traveler' };
      const input = '<BOT>: Welcome, <USER>.';
      const output = applyMacros(input, vars);
      expect(output).toBe('Eldrin: Welcome, Traveler.');
    });

    it('performs a single pass replacement', () => {
      // If user is named "{{char}}", it should not recursively substitute to Eldrin
      const vars = { char: 'Eldrin', user: '{{char}}' };
      const input = 'Hello {{user}}!';
      const output = applyMacros(input, vars);
      expect(output).toBe('Hello {{char}}!');
    });
  });

  describe('buildStopSequences', () => {
    it('builds <= 4 stop sequences for directive dialect', () => {
      const stops = buildStopSequences('directive', 'Traveler');
      expect(stops).toEqual([':::persona', ':::user', '\nTraveler:']);
      expect(stops.length).toBeLessThanOrEqual(4);
    });

    it('builds <= 4 stop sequences for xml dialect', () => {
      const stops = buildStopSequences('xml', 'Traveler');
      expect(stops).toEqual(['<persona', '<user', '\nTraveler:']);
      expect(stops.length).toBeLessThanOrEqual(4);
    });

    it('builds <= 4 stop sequences for prefix and classic dialects', () => {
      const stopsPrefix = buildStopSequences('prefix', 'Traveler');
      expect(stopsPrefix).toEqual(['\nTraveler:']);
      expect(stopsPrefix.length).toBeLessThanOrEqual(4);

      const stopsClassic = buildStopSequences('classic', 'Traveler');
      expect(stopsClassic).toEqual(['\nTraveler:']);
      expect(stopsClassic.length).toBeLessThanOrEqual(4);
    });

    it('returns empty stop sequences when personaVoicing is allowed', () => {
      expect(buildStopSequences('directive', 'Traveler', 'allowed')).toEqual([]);
      expect(buildStopSequences('xml', 'Traveler', 'allowed')).toEqual([]);
      expect(buildStopSequences('prefix', 'Traveler', 'allowed')).toEqual([]);
      expect(buildStopSequences('classic', 'Traveler', 'allowed')).toEqual([]);
    });
  });
});
