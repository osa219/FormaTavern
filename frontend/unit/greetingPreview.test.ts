import { describe, it, expect } from 'bun:test';
import { parseGreeting } from '../src/lib/studio/greetingPreview';

describe('Greeting Preview Parser (Amendment A-U3)', () => {
  it('handles empty firstMessage gracefully', () => {
    const res = parseGreeting('');
    expect(res.segments).toEqual([]);
    expect(res.statePatch).toBeNull();
    expect(res.dialect).toBe('none');
    expect(res.adherent).toBe(false);
  });

  it('parses plain text greeting as primaryCharacter segment', () => {
    const text = 'Hello traveler, welcome to the tavern.';
    const res = parseGreeting(text, 'Bartender');
    expect(res.segments.length).toBe(1);
    expect(res.segments[0].kind).toBe('character');
    expect(res.segments[0].name).toBe('Bartender');
    expect(res.segments[0].text).toBe(text);
    expect(res.dialect).toBe('none');
  });

  it('parses directive envelope in greeting preview', () => {
    const text = `<narrator>The wind howls through the stone archway.</narrator>
<character name="Lyra">"You shouldn't be out this late." She narrows her eyes.</character>
<state>{"weather": "stormy"}</state>`;

    const res = parseGreeting(text, 'Lyra');
    expect(res.segments.length).toBe(2);
    expect(res.segments[0].kind).toBe('narrator');
    expect(res.segments[0].text).toContain('The wind howls');
    expect(res.segments[1].kind).toBe('character');
    expect(res.segments[1].name).toBe('Lyra');
    expect(res.segments[1].text).toContain("You shouldn't be out this late");
    expect(res.statePatch).toEqual({ weather: 'stormy' });
    expect(res.adherent).toBe(true);
  });

  it('defaults primaryCharacter to Character if empty or undefined', () => {
    const res = parseGreeting('A friendly smile.', '');
    expect(res.segments.length).toBe(1);
    expect(res.segments[0].kind).toBe('character');
    expect(res.segments[0].name).toBe('Character');
  });
});
