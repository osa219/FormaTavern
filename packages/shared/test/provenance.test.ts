import { describe, it, expect } from 'bun:test';
import { canonicalJson, canonicalCharacter, canonicalChat, hashCanonical } from '../src/provenance';
import { sha256 } from '../src/text/sha256';

describe('provenance & canonical projections (Invariant X1)', () => {
  describe('sha256 pure implementation', () => {
    it('matches official FIPS 180-4 test vectors', () => {
      // Empty string
      expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      // "abc"
      expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      // "The quick brown fox jumps over the lazy dog"
      expect(sha256('The quick brown fox jumps over the lazy dog')).toBe(
        'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'
      );
    });

    it('correctly digests multi-byte UTF-8 and emoji characters', () => {
      const emojiStr = '👩‍🦰 Hero of Time ✨';
      const digest = sha256(emojiStr);
      expect(digest.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(digest)).toBe(true);
    });
  });

  describe('canonicalJson', () => {
    it('sorts keys alphabetically regardless of insertion order', () => {
      const obj1 = { z: 1, a: 2, m: { y: 3, x: 4 } };
      const obj2 = { a: 2, m: { x: 4, y: 3 }, z: 1 };
      expect(canonicalJson(obj1)).toBe('{"a":2,"m":{"x":4,"y":3},"z":1}');
      expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
    });

    it('preserves array order while canonicalizing array items', () => {
      const arr1 = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
      const arr2 = [{ a: 1, b: 2 }, { c: 3, d: 4 }];
      expect(canonicalJson(arr1)).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
      expect(canonicalJson(arr1)).toBe(canonicalJson(arr2));
    });
  });

  describe('canonicalCharacter', () => {
    const baseChar = {
      id: '000150a0-07bf-4e2a-a92c-123456789abc',
      name: 'Sarah',
      card_title: 'Sarah - The Scholar',
      description: 'A brilliant researcher.',
      tags: ['Fantasy', 'Scholar'],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T12:00:00Z'
    };

    it('is stable under key reordering', () => {
      const reordered = {
        tags: ['Fantasy', 'Scholar'],
        updated_at: '2025-01-02T12:00:00Z',
        name: 'Sarah',
        description: 'A brilliant researcher.',
        created_at: '2025-01-01T00:00:00Z',
        card_title: 'Sarah - The Scholar',
        id: '000150a0-07bf-4e2a-a92c-123456789abc'
      };
      expect(canonicalCharacter(baseChar)).toBe(canonicalCharacter(reordered));
      expect(hashCanonical(baseChar)).toBe(hashCanonical(reordered));
    });

    it('is stable when volatile timestamps change', () => {
      const touchedTimestamp = {
        ...baseChar,
        created_at: '2026-09-24T00:00:00Z',
        updated_at: '2026-09-24T12:00:00Z'
      };
      expect(canonicalCharacter(baseChar)).toBe(canonicalCharacter(touchedTimestamp));
      expect(hashCanonical(canonicalCharacter(baseChar))).toBe(
        hashCanonical(canonicalCharacter(touchedTimestamp))
      );
    });

    it('changes hash on any semantic edit', () => {
      const editedDesc = { ...baseChar, description: 'A brilliant researcher and mage.' };
      expect(hashCanonical(canonicalCharacter(baseChar))).not.toBe(
        hashCanonical(canonicalCharacter(editedDesc))
      );

      const editedTag = { ...baseChar, tags: ['Fantasy', 'Scholar', 'Mage'] };
      expect(hashCanonical(canonicalCharacter(baseChar))).not.toBe(
        hashCanonical(canonicalCharacter(editedTag))
      );
    });
  });

  describe('canonicalChat', () => {
    const baseChat = {
      id: '1566553883',
      character_id: '000150a0-07bf-4e2a-a92c-123456789abc',
      title: 'First Encounter',
      active_greeting_index: 0,
      user_persona: { name: 'Adventurer' },
      messages: [
        { id: '1566553883_0', sequence_index: 0, role: 'assistant', content: 'Hello there.' },
        { id: '1566553883_1', sequence_index: 1, role: 'user', content: 'Greetings.' }
      ],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: null
    };

    it('is stable under key reordering', () => {
      const reordered = {
        messages: baseChat.messages,
        title: 'First Encounter',
        character_id: baseChat.character_id,
        user_persona: { name: 'Adventurer' },
        id: '1566553883',
        active_greeting_index: 0,
        updated_at: '2026-01-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z'
      };
      expect(canonicalChat(baseChat)).toBe(canonicalChat(reordered));
      expect(hashCanonical(canonicalChat(baseChat))).toBe(hashCanonical(canonicalChat(reordered)));
    });

    it('changes hash when a message is added or changed', () => {
      const appendedChat = {
        ...baseChat,
        messages: [
          ...baseChat.messages,
          { id: '1566553883_2', sequence_index: 2, role: 'assistant', content: 'What brings you here?' }
        ]
      };
      expect(hashCanonical(canonicalChat(baseChat))).not.toBe(
        hashCanonical(canonicalChat(appendedChat))
      );
    });
  });
});
