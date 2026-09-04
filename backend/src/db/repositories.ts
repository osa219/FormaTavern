import type { Database, Statement } from 'bun:sqlite';
import {
  assertValid,
  CharacterCardSchema,
  PersonaSchema,
  type CharacterCard,
  type CharacterMetadata,
  type Persona,
  type ThemeOverrides
} from '@formatavern/shared';
import type { CharacterRepository, PersonaRepository, Repositories } from './contracts';

interface CharacterRow {
  id: string;
  name: string;
  avatar: string | null;
  description: string;
  personality: string;
  scenario: string;
  first_message: string;
  style: string;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}

interface PersonaRow {
  id: string;
  name: string;
  avatar: string | null;
  description: string;
  is_default: number;
  style_overrides: string | null;
  created_at: number;
  updated_at: number;
}

function cardToRow(card: CharacterCard, now: number) {
  const metadataObj: Record<string, unknown> = {};
  if (card.exampleDialogue !== undefined) metadataObj.exampleDialogue = card.exampleDialogue;
  if (card.stateSchema !== undefined) metadataObj.stateSchema = card.stateSchema;
  if (card.stateBindings !== undefined) metadataObj.stateBindings = card.stateBindings;
  if (card.initialState !== undefined) metadataObj.initialState = card.initialState;
  if (card.tags !== undefined) metadataObj.tags = card.tags;
  if (card.creator !== undefined) metadataObj.creator = card.creator;
  if (card.version !== undefined) metadataObj.version = card.version;

  const metadata = Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null;

  return {
    id: card.id,
    name: card.name,
    avatar: card.avatar ?? null,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    first_message: card.firstMessage,
    style: JSON.stringify(card.style),
    created_at: now,
    updated_at: now,
    metadata
  };
}

function rowToCard(row: CharacterRow): CharacterCard {
  const card: CharacterCard = {
    id: row.id,
    name: row.name,
    description: row.description,
    personality: row.personality,
    scenario: row.scenario,
    firstMessage: row.first_message,
    style: JSON.parse(row.style)
  };

  if (row.avatar) card.avatar = row.avatar;

  if (row.metadata) {
    const meta = JSON.parse(row.metadata) as CharacterMetadata;
    if (meta.exampleDialogue !== undefined) card.exampleDialogue = meta.exampleDialogue;
    if (meta.stateSchema !== undefined) card.stateSchema = meta.stateSchema;
    if (meta.stateBindings !== undefined) card.stateBindings = meta.stateBindings;
    if (meta.initialState !== undefined) card.initialState = meta.initialState;
    if (meta.tags !== undefined) card.tags = meta.tags;
    if (meta.creator !== undefined) card.creator = meta.creator;
    if (meta.version !== undefined) card.version = meta.version;
  }

  return card;
}

function personaToRow(persona: Persona, now: number) {
  return {
    id: persona.id,
    name: persona.name,
    avatar: persona.avatar ?? null,
    description: persona.description,
    is_default: persona.isDefault ? 1 : 0,
    style_overrides: persona.styleOverrides ? JSON.stringify(persona.styleOverrides) : null,
    created_at: now,
    updated_at: now
  };
}

function rowToPersona(row: PersonaRow): Persona {
  const persona: Persona = {
    id: row.id,
    name: row.name,
    description: row.description,
    isDefault: row.is_default === 1
  };

  if (row.avatar) persona.avatar = row.avatar;
  if (row.style_overrides) {
    persona.styleOverrides = JSON.parse(row.style_overrides) as ThemeOverrides;
  }

  return persona;
}

export class SqliteCharacterRepository implements CharacterRepository {
  private stmtList: Statement<CharacterRow, []>;
  private stmtGet: Statement<CharacterRow, [string]>;
  private stmtCount: Statement<{ count: number }, []>;
  private stmtRemove: Statement<void, [string]>;
  private stmtUpsert: Statement<void, any>;
  private stmtInsertIfAbsent: Statement<void, any>;

  constructor(private db: Database) {
    this.stmtList = db.query(`SELECT * FROM characters ORDER BY updated_at DESC;`);
    this.stmtGet = db.query(`SELECT * FROM characters WHERE id = ?;`);
    this.stmtCount = db.query(`SELECT count(*) as count FROM characters;`);
    this.stmtRemove = db.query(`DELETE FROM characters WHERE id = ?;`);

    this.stmtUpsert = db.query(`
      INSERT INTO characters (
        id, name, avatar, description, personality, scenario,
        first_message, style, created_at, updated_at, metadata
      ) VALUES (
        $id, $name, $avatar, $description, $personality, $scenario,
        $first_message, $style, $created_at, $updated_at, $metadata
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        avatar = excluded.avatar,
        description = excluded.description,
        personality = excluded.personality,
        scenario = excluded.scenario,
        first_message = excluded.first_message,
        style = excluded.style,
        updated_at = excluded.updated_at,
        metadata = excluded.metadata;
    `);

    this.stmtInsertIfAbsent = db.query(`
      INSERT INTO characters (
        id, name, avatar, description, personality, scenario,
        first_message, style, created_at, updated_at, metadata
      ) VALUES (
        $id, $name, $avatar, $description, $personality, $scenario,
        $first_message, $style, $created_at, $updated_at, $metadata
      )
      ON CONFLICT(id) DO NOTHING;
    `);
  }

  list(): CharacterCard[] {
    return this.stmtList.all().map(rowToCard);
  }

  get(id: string): CharacterCard | null {
    const row = this.stmtGet.get(id);
    return row ? rowToCard(row) : null;
  }

  count(): number {
    return this.stmtCount.get()?.count ?? 0;
  }

  remove(id: string): void {
    this.stmtRemove.run(id);
  }

  upsert(card: CharacterCard): void {
    assertValid(CharacterCardSchema, card, `CharacterCard(${card.id})`);
    const row = cardToRow(card, Date.now());
    this.stmtUpsert.run({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      description: row.description,
      personality: row.personality,
      scenario: row.scenario,
      first_message: row.first_message,
      style: row.style,
      created_at: row.created_at,
      updated_at: row.updated_at,
      metadata: row.metadata
    });
  }

  insertIfAbsent(card: CharacterCard): boolean {
    assertValid(CharacterCardSchema, card, `CharacterCard(${card.id})`);
    const row = cardToRow(card, Date.now());
    const res = this.stmtInsertIfAbsent.run({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      description: row.description,
      personality: row.personality,
      scenario: row.scenario,
      first_message: row.first_message,
      style: row.style,
      created_at: row.created_at,
      updated_at: row.updated_at,
      metadata: row.metadata
    });
    return res.changes === 1;
  }
}

export class SqlitePersonaRepository implements PersonaRepository {
  private stmtList: Statement<PersonaRow, []>;
  private stmtGet: Statement<PersonaRow, [string]>;
  private stmtGetDefault: Statement<PersonaRow, []>;
  private stmtCount: Statement<{ count: number }, []>;
  private stmtRemove: Statement<void, [string]>;
  private stmtUpsert: Statement<void, any>;
  private stmtInsertIfAbsent: Statement<void, any>;

  constructor(private db: Database) {
    this.stmtList = db.query(`SELECT * FROM personas ORDER BY updated_at DESC;`);
    this.stmtGet = db.query(`SELECT * FROM personas WHERE id = ?;`);
    this.stmtGetDefault = db.query(`SELECT * FROM personas WHERE is_default = 1 LIMIT 1;`);
    this.stmtCount = db.query(`SELECT count(*) as count FROM personas;`);
    this.stmtRemove = db.query(`DELETE FROM personas WHERE id = ?;`);

    this.stmtUpsert = db.query(`
      INSERT INTO personas (
        id, name, avatar, description, is_default, style_overrides, created_at, updated_at
      ) VALUES (
        $id, $name, $avatar, $description, $is_default, $style_overrides, $created_at, $updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        avatar = excluded.avatar,
        description = excluded.description,
        is_default = excluded.is_default,
        style_overrides = excluded.style_overrides,
        updated_at = excluded.updated_at;
    `);

    this.stmtInsertIfAbsent = db.query(`
      INSERT INTO personas (
        id, name, avatar, description, is_default, style_overrides, created_at, updated_at
      ) VALUES (
        $id, $name, $avatar, $description, $is_default, $style_overrides, $created_at, $updated_at
      )
      ON CONFLICT(id) DO NOTHING;
    `);
  }

  list(): Persona[] {
    return this.stmtList.all().map(rowToPersona);
  }

  get(id: string): Persona | null {
    const row = this.stmtGet.get(id);
    return row ? rowToPersona(row) : null;
  }

  getDefault(): Persona | null {
    const row = this.stmtGetDefault.get();
    return row ? rowToPersona(row) : null;
  }

  count(): number {
    return this.stmtCount.get()?.count ?? 0;
  }

  remove(id: string): void {
    this.stmtRemove.run(id);
  }

  upsert(persona: Persona): void {
    assertValid(PersonaSchema, persona, `Persona(${persona.id})`);
    const row = personaToRow(persona, Date.now());
    this.stmtUpsert.run({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      description: row.description,
      is_default: row.is_default,
      style_overrides: row.style_overrides,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  }

  insertIfAbsent(persona: Persona): boolean {
    assertValid(PersonaSchema, persona, `Persona(${persona.id})`);
    const row = personaToRow(persona, Date.now());
    const res = this.stmtInsertIfAbsent.run({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      description: row.description,
      is_default: row.is_default,
      style_overrides: row.style_overrides,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
    return res.changes === 1;
  }
}

export function createRepositories(db: Database): Repositories {
  const characters = new SqliteCharacterRepository(db);
  const personas = new SqlitePersonaRepository(db);

  return {
    characters,
    personas,
    schemaVersion() {
      const row = db.query('PRAGMA user_version;').get() as { user_version: number };
      return row.user_version;
    }
  };
}
