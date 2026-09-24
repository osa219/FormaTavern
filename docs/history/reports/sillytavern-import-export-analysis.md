# Technical Analysis: SillyTavern Import and Export Architecture

**Document Type:** Technical Architecture Report  
**Target Repository Analyzed:** `S:\WorkSpace\Git Workspace\SillyTavern`  
**Purpose:** Exhaustive factual audit of SillyTavern's import, export, serialization, and storage mechanisms across all supported entities.  
**Tone:** Informative, factual, neutral (zero commentary or implementation opinion).

---

## 1. Executive Summary & Architectural Overview

SillyTavern's import and export architecture is divided between a Node.js/Express backend server (`src/`) and a vanilla JavaScript / jQuery single-page application frontend (`public/`). 

### 1.1 Architectural Split & Transport Mechanisms

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BROWSER CLIENT (public/)                          │
│                                                                             │
│  - Drag & Drop Listener (DragAndDropHandler on body & popups)               │
│  - File Input Triggers (<input type="file">)                                │
│  - Client-side Format Transpilation (Agnai, NovelAI, Risu -> ST Lorebook)   │
│  - Blob Generation & Direct Downloads (download(content, filename, type))   │
│  - Multipart / JSON API Dispatch (fetch())                                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / REST
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                        NODE.JS / EXPRESS BACKEND (src/)                     │
│                                                                             │
│  - Multipart Handling: Multer destination upload -> atomic rename/write      │
│  - Binary Parsing: png-chunks-extract, png-chunk-text, custom CRC32 encoder │
│  - Archive Ingestion: CharXParser, ByafParser (ZIP stream extraction)       │
│  - Stream Parsing: Line-by-line readline streams for large JSONL chats      │
│  - File System Isolation: isPathUnderParent checks, sanitize-filename       │
│  - Concurrency Safety: write-file-atomic, integrity slugs, file locks       │
└─────────────────────────────────────────────────────────────────────────────┘
```

The system manages eight distinct content domains:
1. **Character Cards** (TavernCard V1, TavernCard V2, Character Card V3, CharX archives, BYAF archives, Gradio/Pygmalion JSON, TextGen YAML).
2. **Chat Histories** (Native SillyTavern JSONL, Chub Chat JSONL, Oobabooga JSON, Agnaistic JSON, CAI Tools JSON, Kobold Lite JSON, RisuAI JSON, plain text `.txt`).
3. **World Info & Lorebooks** (Native SillyTavern JSON, NovelAI Lorebooks [JSON and PNG], Agnaistic Memory Books, RisuAI Lorebooks, and Card-Embedded Character Books).
4. **User Personas & Avatars** (PNG avatars, JSON metadata backups).
5. **Generation Presets & Templates** (Sampler configurations, Context templates, Instruct templates, System prompts, Reasoning configs).
6. **Group Chats & Group Metadata** (Group definition JSONs, Group chat JSONL transcripts).
7. **Auxiliary User Assets** (Tags and tag mappings, UI themes, Quick replies, User files).
8. **Orphan & Maintenance Management** (Data Maid inspection service, chat backups).

---

## 2. Character Card Architecture & Processing Pipeline

### 2.1 Specification Hierarchy

SillyTavern recognizes and parses three standard specification generations, plus three archive/external schemas:

| Specification | Root Identifier (`spec`) | Version (`spec_version`) | Metadata Location | Primary Invariants |
|---|---|---|---|---|
| **TavernCard V1** | *None* (implicit) | *None* | Root JSON object | Top-level keys: `name`, `description`, `personality`, `scenario`, `first_mes`, `mes_example`. |
| **TavernCard V2** | `"chara_card_v2"` | `"2.0"` | `data` object | Root wrapper with `spec`, `spec_version`, and nested `data` object containing `name`, `description`, `personality`, `scenario`, `first_mes`, `mes_example`, `creator_notes`, `system_prompt`, `post_history_instructions`, `alternate_greetings`, `tags`, `creator`, `character_version`, `extensions`, and optional `character_book`. |
| **Character Card V3 (CCv3)** | `"chara_card_v3"` | `"3.0"` | `data` object | Extends V2 with standardized `assets` array (icons, emotion sprites, backgrounds, audio), asset URI resolution, and updated extension schema. |
| **CharX (`.charx`)** | `"chara_card_v2"` or `"chara_card_v3"` | `"2.0"` or `"3.0"` | `card.json` inside ZIP | ZIP archive container bundling `card.json` with embedded binary assets (`assets/` or root paths). |
| **BYAF (`.byaf`)** | *Proprietary* | N/A | `character.json` inside ZIP | Backyard AI Archive ZIP bundling character card, scenarios, transcripts, backgrounds, and alternative icons. |
| **Gradio / Pygmalion** | *None* | N/A | Root JSON object | Keyed by `char_name`, `char_persona`, `char_greeting`, `world_scenario`, `example_dialogue`. |
| **TextGen YAML** | *None* | N/A | Top-level YAML mapping | Keyed by `name`, `context`, `greeting`. |

### 2.2 Invariant Storage Model

Regardless of incoming format (`.json`, `.yaml`, `.charx`, `.byaf`), **SillyTavern persists all characters to disk as `.png` files** located at `data/{user}/characters/{filename}.png`.
- If an imported character lacks an image (e.g. raw JSON or YAML import), SillyTavern substitutes `DEFAULT_AVATAR_PATH` (`public/img/fluffy.png`), applies avatar crop/resize operations, and writes the character payload into that default image.
- Character metadata is written into the PNG file as embedded metadata text chunks.

### 2.3 PNG Chunk Extraction and Injection Engine

SillyTavern implements PNG chunk manipulation in `src/character-card-parser.js` and `src/png/encode.js` using `png-chunks-extract` and `png-chunk-text`:

```
                    PNG Chunk Layout on Disk
┌────────────┬─────────────┬───────────┬───────────┬───────────┐
│ PNG Header │ IHDR Chunk  │ IDAT ...  │ tEXt      │ IEND      │
│ (8 bytes)  │ (Dimensions)│ (Pixels)  │ (Metadata)│ (EOF)     │
└────────────┴─────────────┴───────────┴─────┬─────┴───────────┘
                                             │
                   ┌─────────────────────────┴────────────────────────┐
                   │ Keyword: 'chara' -> Base64(UTF-8 JSON string V2) │
                   │ Keyword: 'ccv3'  -> Base64(UTF-8 JSON string V3) │
                   └──────────────────────────────────────────────────┘
```

#### Read Operation (`read(image: Buffer): string`)
1. Deconstructs the PNG buffer into discrete chunks via `extract(new Uint8Array(image))`.
2. Filters chunks where `chunk.name === 'tEXt'`.
3. Decodes each chunk's payload via `PNGtext.decode(chunk.data)`.
4. Prioritizes keyword lookup:
   - First checks for keyword `'ccv3'` (case-insensitive). If found, decodes `chunk.text` from Base64 to a UTF-8 string and returns it.
   - If no `'ccv3'` chunk is found, checks for keyword `'chara'` (case-insensitive). If found, decodes `chunk.text` from Base64 to UTF-8.
5. If neither exists, throws `Error('No PNG metadata.')`.

#### Write Operation (`write(image: Buffer, data: string): Buffer`)
1. Deconstructs PNG into chunks.
2. Identifies and removes all pre-existing `tEXt` chunks where `keyword.toLowerCase()` is `'chara'` or `'ccv3'`.
3. Encodes the incoming V2 data string to Base64 and prepares a `tEXt` chunk with keyword `'chara'`.
4. Splices the `'chara'` chunk immediately before the terminal `'IEND'` chunk (`chunks.splice(-1, 0, chunk)`).
5. Attempts to synthesize a V3 chunk:
   - Parses `data` as JSON.
   - Assigns `v3Data.spec = 'chara_card_v3'` and `v3Data.spec_version = '3.0'`.
   - Encodes to Base64 and splices a second `tEXt` chunk with keyword `'ccv3'` directly before `'IEND'`.
6. Recompiles the full byte array using a custom binary encoder (`src/png/encode.js`):
   - Computes standard 8-byte PNG signature: `[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]`.
   - Iterates all chunks, allocating 12 additional bytes per chunk (4 bytes length + 4 bytes chunk name + data length + 4 bytes CRC32).
   - Calculates IEEE 802.3 CRC32 checksum over `chunk.name` concatenated with `chunk.data`.
   - Returns assembled Node `Buffer`.

### 2.4 Avatar Cropping & Animation Safeguards

Avatar processing (`src/endpoints/characters.js`: `applyAvatarCropResize`) utilizes `@jimp/wasm`:
- Applies cropping rectangle `{ x, y, width, height }`.
- If `want_resize` is set, resizes via `.cover()` to standard avatar dimensions (`AVATAR_WIDTH: 400`, `AVATAR_HEIGHT: 600`).
- **Animation Guard:** Jimp cannot decode animated WebP or APNG images. `src/endpoints/image-metadata.js` inspects the initial byte headers:
  - APNG: Checks if the first 200 bytes contain the chunk header ASCII `'acTL'`.
  - WebP: Checks if the first 200 bytes contain chunk identifiers `'ANIM'` or `'ANMF'`.
  - If animated, Jimp manipulation is bypassed, and the raw uploaded buffer is written unmodified to prevent frame flattening or corruption.

### 2.5 Ingestion Handlers by Format

The server exposes `POST /api/characters/import` receiving a multipart form payload (`avatar`, `file_type`, `user_name`, `preserved_name`).

#### 1. PNG Import (`importFromPng`)
1. Reads embedded metadata via `readCharacterData(uploadPath)`.
2. Parses decoded JSON.
3. If `spec` exists (V2/V3):
   - Runs `importRisuSprites` to extract any bundled RisuAI sprites.
   - Executes `unsetPrivateFields(jsonData)`: clears `fav` (set to `false`) and deletes `chat` session identifier.
   - Runs `readFromV2(jsonData)`: fills defaults for talkativeness (`0.5`) and fav (`false`).
   - Resets `create_date` to current ISO string.
   - Writes atomic PNG using original image buffer.
4. If `name` exists without `spec` (V1):
   - Maps fields to V2 structure (`name`, `description`, `personality`, `scenario`, `first_mes`, `mes_example`, `creator_notes`).
   - Normalizes via `convertToV2`.
   - Writes atomic PNG.

#### 2. JSON Import (`importFromJson`)
1. Reads UTF-8 file contents and parses JSON.
2. Branches:
   - **TavernCard V2/V3 (`jsonData.spec !== undefined`):** Unsets private fields, normalizes via `readFromV2`, writes with `DEFAULT_AVATAR_PATH`.
   - **TavernCard V1 (`jsonData.name !== undefined`):** Maps V1 fields, converts to V2, writes with `DEFAULT_AVATAR_PATH`.
   - **Gradio / Pygmalion (`jsonData.char_name !== undefined`):** Maps `char_name` -> `name`, `char_persona` -> `description`, `char_greeting` -> `first_mes`, `example_dialogue` -> `mes_example`, `world_scenario` -> `scenario`. Converts to V2, writes with `DEFAULT_AVATAR_PATH`.

#### 3. YAML Import (`importFromYaml`)
1. Parses YAML string via `yaml.parse`.
2. Maps `name`, `context` -> `description`, `greeting` -> `first_mes`.
3. Converts to V2, writes with `DEFAULT_AVATAR_PATH`.

#### 4. CharX Container Import (`importFromCharX`)
Handled by `CharXParser` (`src/charx.js`):
1. **SFX Archive Detection:** Scans buffer for ZIP signature `0x50 0x4B 0x03 0x04` (`PK\x03\x04`). Slices buffer from that offset if embedded in an executable wrapper.
2. **Manifest Extraction:** Extracts and parses `card.json` from ZIP root.
3. **Asset Collection (`collectCharXAssets`):** Scans `card.data.assets` array. Resolves paths with prefixes `embedded://`, `embeded://` (RisuAI legacy misspelling), and `__asset:`.
4. **Primary Avatar Resolution (`pickCharXIconAsset`):**
   - Filters assets where `type === 'icon'` and extension is in `CHARX_IMAGE_EXTENSIONS` (`png`, `jpg`, `jpeg`, `webp`, `gif`, `apng`, `avif`, `bmp`, `jfif`).
   - Prioritizes icon where `name === 'main'`; otherwise selects the first icon.
   - If no icon asset is defined, defaults to `DEFAULT_AVATAR_PATH`.
5. **Auxiliary Asset Mapping (`mapCharXAssetsForStorage`):**
   - Emotion/Expression sprites (`type: 'emotion' | 'expression'`): Target category `'sprite'`. Normalized with hyphenated naming (`baseName = sanitize(...)`) to align with SillyTavern's expression delimiter regex (`sprites.js`). Saved to `characters/{characterFolder}/{baseName}.{ext}`.
   - Backgrounds (`type: 'background'`): Target category `'background'`. Saved to `characters/{characterFolder}/backgrounds/{baseName}.{ext}`.
   - Miscellaneous (`type: 'misc'` or unrecognized): Saved to `user/images/{characterFolder}/{baseName}.{ext}`.
6. **Card Normalization & Write:** Unsets private fields, updates timestamps, writes avatar image buffer + metadata into `characters/{fileName}.png`.

#### 5. Backyard AI Archive Import (`importFromByaf`)
Handled by `ByafParser` (`src/byaf.js`):
1. Reads ZIP archive containing Backyard AI / Faraday character data.
2. Extracts manifest `character.json` and scenarios.
3. **Macro Transformation:** Rewrites Backyard AI macros to SillyTavern format:
   - `#{user}:` -> `{{user}}:`
   - `#{character}:` -> `{{char}}:`
   - `{character}` -> `{{char}}`
   - `{user}` -> `{{user}}`
4. **Dialogue Example Transformation:** Formats example dialog blocks prefixed with `<START>\n`.
5. **Alternate Greetings Extraction:** Scenarios beyond index 0 containing `firstMessages` are extracted into `data.alternate_greetings`.
6. **Scenario Chat Generation:** Scenarios containing message history are converted to SillyTavern JSONL chat transcripts and written to `chats/{characterName}/{scenarioTitle} - {timestamp} imported.jsonl`.
7. **Asset Persistence:** Backgrounds are extracted to `userImages/{characterName}/`; alternate portraits are saved into `characters/{characterName}/`.
8. Main portrait + V2 character JSON is compiled and written to `characters/{fileName}.png`.

#### 6. Remote Hub & UUID Ingestion (`src/endpoints/content-manager.js`)
Endpoints: `POST /api/content/importURL` and `POST /api/content/importUUID`.
Downloads remote character cards and lorebooks directly from whitelisted third-party hubs:
- **Chub.ai:** Downloads character card JSON/PNG or lorebook JSON via Chub API.
- **JanitorAI:** Resolves character UUID, parses JSON card.
- **Pygmalion:** Resolves UUID, downloads card.
- **AI Character Cards (AICC):** Resolves `author/card` path, fetches card buffer.
- **Risu Realm:** Resolves UUID, fetches card.
- **Perchance:** Resolves slug, scrapes character card payload.
- **Generic URL:** Permitted only if domain matches user configuration `whitelistImportDomains`.

### 2.6 Character Export Engine

Endpoint: `POST /api/characters/export`  
Payload: `{ avatar_url: string, format: "png" | "json" }`

```
                               Export Request
                                     │
                     ┌───────────────┴───────────────┐
             format: "png"                   format: "json"
                     │                               │
        Read characters/{avatar_url}    Read characters/{avatar_url}
                     │                               │
            read() metadata                 read() metadata
                     │                               │
           unsetPrivateFields()            getCharaCardV2()
           - fav = false                   unsetPrivateFields()
           - delete chat                             │
                     │                     JSON.stringify(..., 4)
            write() new PNG                          │
                     │                     Content-Type: application/json
        Content-Type: image/png                      │
        Content-Disposition: attachment              ▼
                     │                        Client Download
                     ▼
              Client Download
```

- **PNG Export (`format: 'png'`):**
  1. Reads file `characters/{avatar_url}` from disk.
  2. Extracts raw metadata string using `read(rawBuffer)`.
  3. Executes `mutateJsonString(rawData, unsetPrivateFields)`:
     - Sets `fav = false` and `data.extensions.fav = false`.
     - Deletes `chat` (active chat session reference).
  4. Calls `write(rawBuffer, mutatedData)`: re-injects cleansed metadata into both `'chara'` (V2) and `'ccv3'` (V3) chunks while retaining original avatar image binary and dimensions.
  5. Sets HTTP headers: `Content-Type: image/png` and `Content-Disposition: attachment; filename="{encoded_filename}"`.
  6. Sends binary buffer.
- **JSON Export (`format: 'json'`):**
  1. Reads character metadata from disk.
  2. Executes `getCharaCardV2(JSON.parse(json), request.user.directories)` to ensure strict V2 compliance.
  3. Executes `unsetPrivateFields(jsonObject)`.
  4. Returns `JSON.stringify(jsonObject, null, 4)` with `Content-Type: application/json`.
- **Client Triggering:** `#export_button` invokes Popper dropdown `#export_format_popup` offering PNG and JSON options. Client receives blob and triggers browser download via `URL.createObjectURL(blob)`.

---

## 3. Chat History Architecture & Serialization

### 3.1 Native Storage Model

SillyTavern stores chats as **Newline-Delimited JSON (JSONL)** files on disk:
- Character Chats: `data/{user}/chats/{character_avatar_without_ext}/{chat_filename}.jsonl`
- Group Chats: `data/{user}/group chats/{group_id}.jsonl`

#### File Structure
```jsonl
{"chat_metadata":{"integrity":"f9a8...","created_date":1710000000000},"user_name":"unused","character_name":"unused"}
{"name":"User","is_user":true,"is_name":true,"send_date":"2026-03-20T10:00:00.000Z","mes":"Hello!","extra":{}}
{"name":"Character","is_user":false,"is_name":true,"send_date":"2026-03-20T10:00:05.000Z","mes":"Greetings.","swipes":["Greetings.","Hi there."],"swipe_id":0,"extra":{}}
```

- **Line 0 (Header Record):** Must contain `chat_metadata`, `user_name`, or `character_name`.
  - `chat_metadata` contains chat-level variables, scoped lorebook bindings (`chat_metadata[METADATA_KEY]`), file attachment pointers, custom instruct overrides, and the concurrency `integrity` slug.
- **Lines 1..N (Message Records):** Each line represents one discrete message. Key fields:
  - `name`: Author display name.
  - `is_user`: Boolean flag.
  - `is_system`: Boolean flag (hidden from LLM prompts / export transcripts).
  - `send_date`: ISO 8601 string or Unix timestamp.
  - `mes`: Primary message text.
  - `swipes`: Array of alternative generation strings.
  - `swipe_id`: Active index in `swipes`.
  - `extra`: Map containing display overrides (`display_text`), media links, reasoning tokens, token metrics.

### 3.2 Concurrency & Integrity Control

SillyTavern implements optimistic locking on chat updates (`src/endpoints/chats.js`):
1. When loading a chat, the client receives the `integrity` slug stored in line 0 of the JSONL file.
2. On `POST /api/chats/save`, the server executes `checkChatIntegrity(filePath, integritySlug)`.
3. It reads the first line of the existing file using a stream (`readFirstLine`).
4. If the file exists and contains an integrity slug that does not match the incoming slug, it aborts write operations and throws `IntegrityMismatchError` (HTTP 400 `{ error: 'integrity' }`), preventing concurrent browser tabs from overwriting each other's branch histories.

### 3.3 Throttled Rolling Backups

During every successful chat save, the backend dispatches a debounced background backup (`backupChat`):
- Destination: `data/{user}/backups/chat_{sanitized_name}_{timestamp}.jsonl`.
- Debounced by user handle via `lodash.throttle` (default interval: 10,000 ms).
- Enforces rolling retention limit via `removeOldBackups(..., maxTotalChatBackups)`.

### 3.4 Chat Export Implementations

Endpoint: `POST /api/chats/export`  
Arguments: `{ file, avatar_url, is_group, exportfilename, format }`

| Format Parameter | Processing Pipeline | Output Format |
|---|---|---|
| `format: "jsonl"` | Direct read of the source `.jsonl` from disk. Server returns `{ message, result: rawFile }`. | Raw `.jsonl` file download via client `download(data.result, exportfilename, 'application/octet-stream')`. |
| `format: "txt"` | Server reads file via `readline` line-by-line stream. Skips any entry where `data.is_system === true`. Formats text: `"{name}: {data.extra.display_text \|\| data.mes}\n\n"`. Returns text buffer. | Plain text `.txt` transcript download via client `download(data.result, exportfilename, 'text/plain')`. |
| Client Assistant / Ad-hoc | Client serializes current memory array `chat.map(m => JSON.stringify(m)).join('\n')`. | Client downloads directly via `download(..., 'Assistant - {timestamp}.jsonl', 'application/json')`. |

### 3.5 Chat Import Engine

Endpoint: `POST /api/chats/import`  
Handles multipart upload of `.json` or `.jsonl` files.

```
                           Incoming Chat Upload
                                    │
                    ┌───────────────┴───────────────┐
             Ext: ".jsonl"                   Ext: ".json"
                    │                               │
        Verify Line 0 Header               Detect Format Signature
                    │                               │
        Chub Chat Flattening?              ┌────────┼────────┬────────┬────────┐
        - Unnest mes.message               ▼        ▼        ▼        ▼        ▼
        - Unnest swipes[].message        Kobold    CAI     Ooba     Agnai    RisuAI
                    │                     Lite    Tools   WebUI             Chat
        Write Atomic JSONL                 │        │        │        │        │
                    │                      └────────┴────────┴────────┴────────┘
                    ▼                                       │
           "{char} - {time} imported.jsonl"                 ▼
                                                   Transpile to Standard
                                                   JSONL Array Structure
                                                            │
                                                            ▼
                                                   Write Atomic JSONL
```

#### JSONL Ingestion
1. Inspects line 0. Validates presence of `user_name`, `name`, or `chat_metadata`.
2. **Chub Chat Unnesting (`flattenChubChat`):**
   - Chub Chat exports wrap message text inside nested objects: `lineData.mes.message`.
   - Iterates lines, extracts `lineData.mes = lineData.mes.message` if nested.
   - Flattens swipe objects: `swipe = swipe.message ? swipe.message : swipe`.
3. Writes output to `chats/{characterDirectory}/{characterName} - {humanizedDateTime()} imported.jsonl`.

#### External JSON Ingestion
The server inspects the parsed JSON object schema to identify foreign platforms:

1. **Kobold Lite (`jsonData.savedsettings !== undefined`):**
   - Extracts `userName` from `data.savedsettings.chatname`.
   - Extracts `characterName` from `data.savedsettings.chatopponent` (splits on `||$||`).
   - Iterates `data.actions`. Strips control tokens `{{[INPUT]}}` and `{{[OUTPUT]}}`.
   - Normalizes prompt string if present.
2. **Character.AI Tools (`jsonData.histories !== undefined`):**
   - Iterates `jsonData.histories.histories` array (multi-chat dump support).
   - Maps each message: checks `msg.src.is_human` to assign `userName` vs `characterName`.
   - Extracts `msg.text` into `mes`.
   - Yields an array of independent chat files.
3. **Oobabooga TextGen WebUI (`Array.isArray(jsonData.data_visible)`):**
   - Iterates `data_visible` tuples: `arr[0]` (user turn) and `arr[1]` (character turn).
   - Generates sequential message objects.
4. **Agnaistic (`Array.isArray(jsonData.messages)`):**
   - Iterates `jsonData.messages`. Inspects `message.userId` to determine turn ownership.
   - Extracts `message.msg` into `mes`.
5. **RisuAI Chat (`jsonData.type === 'risuChat'`):**
   - Iterates `jsonData.data.message`.
   - Inspects `message.role === 'user'`.
   - Converts `message.time` Unix timestamp into ISO string `send_date`.
   - Extracts `message.data` into `mes`.

---

## 4. World Info & Lorebook Engine

### 4.1 Native Schema vs Character Book Spec

SillyTavern supports two Lorebook data representations:
- **Standalone Lorebook JSON:** Stored in `data/{user}/worlds/{world_name}.json`. Uses an entry dictionary mapped by numeric string UID (`entries: { "0": { ... }, "1": { ... } }`).
- **Character Card Embedded Book (`character_book`):** Defined by Character Card V2/V3 spec. Uses an array of entry objects (`entries: [ { ... }, { ... } ]`).

#### Entry Property Mapping Matrix

| Property | Native SillyTavern JSON | Character Book Spec (`character_book.entries[]`) | Semantics |
|---|---|---|---|
| Primary Keys | `key: string[]` | `keys: string[]` | Trigger keywords / regex expressions. |
| Secondary Keys | `keysecondary: string[]` | `secondary_keys: string[]` | Additional keys for AND/NOT selective logic. |
| Comment / Memo | `comment: string` | `comment: string` | Author label / summary title. |
| Content | `content: string` | `content: string` | Text inserted into prompt context. |
| Always Active | `constant: boolean` | `constant: boolean` | Bypasses keyword scanning; always inserted. |
| Selective | `selective: boolean` | `selective: boolean` | Requires primary AND secondary key match. |
| Insertion Order | `order: number` | `insertion_order: number` | Sort priority in prompt building. |
| Position | `position: number` (0: before, 1: after) | `position: string` (`"before_char"` \| `"after_char"`) | Prompt placement relative to character definition. |
| Enabled | `disable: boolean` | `enabled: boolean` | Inverted boolean status. |
| Advanced Flags | Nested in root entry or `extensions` | Nested under `extensions: {}` | Selective logic, depth, probability, recursion exclusion, sticky/cooldown turns, token budget caps, scan depth. |

### 4.2 Lorebook Import Pipeline

Endpoint: `POST /api/worldinfo/import`  
Accepts `.json`, `.lorebook`, or `.png`.

```
                    World Info File Upload
                              │
             ┌────────────────┴────────────────┐
       File: ".png"                      File: ".json"
             │                                 │
     extractDataFromPng()             parseJsonFile()
     Keyword: 'naidata'                        │
             │                                 ▼
             │                      Format Fingerprinting:
             │                      - lorebookVersion -> NovelAI Lorebook
             │                      - kind == "memory" -> Agnai Memory Book
             │                      - type == "risu" -> RisuAI Lorebook
             │                      - entries -> Standard SillyTavern
             │                                 │
             └────────────────┬────────────────┘
                              │
                              ▼
                Client Conversion Function
                (convertNovelLorebook / convertAgnaiMemoryBook / convertRisuLorebook)
                              │
                              ▼
                FormData.append('convertedData', JSON.stringify(outputObj))
                              │
                              ▼
                POST /api/worldinfo/import
                              │
                              ▼
                Write data/{user}/worlds/{world_name}.json
```

1. **NovelAI PNG Extraction:** If a PNG image is uploaded to the lorebook importer, client extracts the `tEXt` chunk with keyword `'naidata'`, decodes it, and passes the payload to the NovelAI converter.
2. **Client-side Normalization:** Before transmitting to `/api/worldinfo/import`, `public/scripts/world-info.js` inspects schema markers:
   - `lorebookVersion !== undefined`: Dispatches `convertNovelLorebook()`. Maps categories, priorities, and search depths.
   - `kind === 'memory'`: Dispatches `convertAgnaiMemoryBook()`. Maps `entry.keywords` to `key` and `entry.entry` to `content`.
   - `type === 'risu'`: Dispatches `convertRisuLorebook()`. Maps comma-separated keys and secondary keys into arrays.
3. **Card-Embedded World Info Ingestion (`importEmbeddedWorldInfo`):**
   - When a character is selected, `checkEmbeddedWorld()` inspects `character.data.character_book`.
   - Prompts the user or executes via character menu.
   - Invokes `convertCharacterBook(character.data.character_book)`: converts the array of entries into a dictionary indexed by UID, unpacks `extensions`, and writes `data/{user}/worlds/{bookName}.json`.
   - Links world to character by writing `data.extensions.world = bookName`.

### 4.3 Lorebook Export Pipeline

World info export is executed **strictly on the browser client**:
- Event Listener: `$('#world_popup_export').on('click')`.
- Reads current in-memory world object `data` and active filename `name`.
- Serializes: `const jsonValue = JSON.stringify(data)`.
- Dispatches: `download(jsonValue, `${name}.json`, 'application/json')`.
- No backend endpoint is invoked for standalone lorebook exports.

---

## 5. Personas & User Avatars

### 5.1 Storage Structure

- **Avatars:** Stored in `data/{user}/avatars/{filename}.png`.
- **Persona Data:** Stored directly inside the user's root configuration file `data/{user}/settings.json`:
  - `power_user.personas`: Object mapping persona display names to avatar filenames: `{ "User": "1710000000000.png" }`.
  - `power_user.persona_descriptions`: Object mapping persona display names to persona description text: `{ "User": "Description details..." }`.
  - `power_user.default_persona`: String matching the default persona name.

### 5.2 Persona Import and Export Implementation

- **Export (`onBackupPersonas` in `public/scripts/personas.js`):**
  - Executed client-side.
  - Constructs payload:
    ```json
    {
      "personas": { "Username": "avatar.png" },
      "persona_descriptions": { "Username": "Bio..." },
      "default_persona": "Username"
    }
    ```
  - Dispatches browser download: `personas_{YYYYMMDD}.json`.
- **Import (`onPersonasRestoreInput`):**
  - Parses uploaded JSON. Validates presence and types of `personas` and `persona_descriptions`.
  - Iterates imported personas: checks for existing names in `power_user.personas`. Skips conflicting names and warns the user.
  - Non-conflicting entries are merged into `power_user.personas` and `power_user.persona_descriptions`.
  - Saves settings to backend via `saveSettingsDebounced()`.
- **Avatar Upload:** `POST /api/avatars/upload` accepts image file, processes cropping via Jimp, saves PNG to `data/{user}/avatars/{overwrite_name || timestamp}.png`, and busts cache/thumbnail registries.

---

## 6. Presets, Templates, & LLM Configurations

### 6.1 Presets Architecture

SillyTavern separates LLM parameters into discrete JSON files categorized by API source and function:

| Configuration Category | Storage Directory | Backend Save Endpoint | Client Exporter |
|---|---|---|---|
| **OpenAI Samplers** | `data/{user}/OpenAI Settings/` | `POST /api/presets/save` (`apiId: "openai"`) | `download(preset, `${name}.json`, 'application/json')` |
| **KoboldAI Samplers** | `data/{user}/KoboldAI Settings/` | `POST /api/presets/save` (`apiId: "kobold"`) | `download(...)` |
| **NovelAI Samplers** | `data/{user}/NovelAI Settings/` | `POST /api/presets/save` (`apiId: "novel"`) | `download(...)` |
| **TextGen WebUI** | `data/{user}/TextGen_Settings/` | `POST /api/presets/save` (`apiId: "textgenerationwebui"`) | `download(...)` |
| **Instruct Templates** | `data/{user}/instruct/` | `POST /api/presets/save` (`apiId: "instruct"`) | `download(...)` |
| **Context Templates** | `data/{user}/context/` | `POST /api/presets/save` (`apiId: "context"`) | `download(...)` |
| **System Prompts** | `data/{user}/sysprompt/` | `POST /api/presets/save` (`apiId: "sysprompt"`) | `download(...)` |
| **Reasoning Settings** | `data/{user}/reasoning/` | `POST /api/presets/save` (`apiId: "reasoning"`) | `download(...)` |

### 6.2 Preset Import / Export Mechanics

- **Export:** Driven by `PresetManager` (`public/scripts/preset-manager.js`):
  - Click listener on `[data-preset-manager-export]`.
  - Resolves active preset object by name from memory.
  - Triggers client download: `download(JSON.stringify(preset, null, 4), `${name}.json`, 'application/json')`.
- **Batch Template Export:** `download(data, `ST-formatting-${shortDate}.json`, 'application/json')` bundles all instruct, context, reasoning, and system prompt configurations into a single composite JSON.
- **Import:** File change listener on `[data-preset-manager-file]`:
  - Parses uploaded JSON. Resolves name from payload or file base name.
  - Sends payload to `POST /api/presets/save`. Server writes atomic JSON file into corresponding directory.
- **Factory Restoration:** `POST /api/presets/restore` searches default catalog (`default/content/index.json`) and copies vanilla preset back to user folder.

---

## 7. Auxiliary Systems: Groups, Tags, Themes, & Data Maid

### 7.1 Group Chats and Group Manifests

- **Group Definitions:** Stored in `data/{user}/groups/{group_id}.json`. Contains metadata: `{ id, name, members: string[], avatar: string, chats: string[] }`.
- **Group Transcripts:** Stored in `data/{user}/group chats/{group_chat_id}.jsonl`.
- **Group Chat Export:** Same route as character chats (`POST /api/chats/export` with `is_group: true`), reading from `directories.groupChats`.
- **Group Chat Import:** `POST /api/chats/group/import` accepts `.jsonl` file, saves to `groupChats/{humanizedDateTime()}.jsonl`, and associates chat ID with group definition.

### 7.2 Tags & Entity Categorization

- **Storage:** Embedded in `data/{user}/settings.json`:
  - `tags`: Array of tag definitions (`{ id, name, color, color2 }`).
  - `tag_map`: Mapping of entity keys (character avatar name or group ID) to arrays of tag IDs: `{ "character.png": ["tag-1", "tag-2"] }`.
- **Export (`onTagsBackupClick`):** Constructs `{ tags: tags, tag_map: tag_map }`, triggers client download: `tags_{YYYYMMDD}.json`.
- **Import (`onTagRestoreFileSelect`):** Reads file, merges new tags, validates entity keys, updates `settings.json`.

### 7.3 UI Themes

- **Storage:** `data/{user}/themes/{theme_name}.json`.
- **Export (`exportTheme` in `public/scripts/power-user.js`):** Client serializes theme object and calls `download(JSON.stringify(themeFile, null, 4), `${themeFile.name}.json`, 'application/json')`.
- **Import (`importTheme`):** Reads JSON. **Security check:** Scans `custom_css` for `@import` statements to prevent unauthorized CSS stylesheet injection or external asset beaconing; displays interactive modal alert if detected. Writes to backend via `POST /api/themes/save`.

### 7.4 Data Maid Maintenance Subsystem

Defined in `src/endpoints/data-maid.js` (`DataMaidService`):
1. **Orphan Audit (`generateReport()`):**
   - Scans user file system across images, attachments, character chats, group chats, thumbnails, and backups.
   - Cross-references all files against referenced assets in character PNG metadata, JSONL chat message attachments (`extra.media`, `extra.files`, `chat_metadata.attachments`), and group memberships.
   - Compiles lists of unreferenced ("loose") files.
2. **Deterministic Cleanup Tokens:**
   - Server maps scanned loose file paths to ephemeral SHA-256 tokens stored in `DataMaidService.TOKENS`.
   - Client requests deletion by token, preventing unauthorized arbitrary path deletion.

---

## 8. Comprehensive Architecture Comparison Matrix

| Subsystem / Entity | Storage Format on Disk | Import File Formats Supported | Export File Formats Supported | Client vs Server Responsibility | Data Cleansing / Security Invariants |
|---|---|---|---|---|---|
| **Character Cards** | `.png` image with embedded Base64 UTF-8 JSON in `tEXt` (`chara` & `ccv3`) | `.png`, `.json`, `.yaml`, `.yml`, `.charx`, `.byaf`, Remote URL/UUID | `.png`, `.json` | **Server:** PNG decoding/encoding, CharX/BYAF unzipping, metadata writing.<br>**Client:** File inputs, drag-and-drop, UI download trigger. | Strips `fav` and `chat` before export (`unsetPrivateFields`). Sanitizes filenames. APNG/WebP animation guard bypasses Jimp. |
| **Chat Transcripts** | `.jsonl` (Line 0: metadata header; Lines 1..N: messages) | Native `.jsonl`, Chub `.jsonl`, Kobold Lite `.json`, CAI Tools `.json`, Oobabooga `.json`, Agnaistic `.json`, RisuAI `.json` | `.jsonl`, `.txt` | **Server:** Line-by-line stream parsing (`readline`), schema transcoding, integrity validation.<br>**Client:** Download dispatch, transcript view. | Validates concurrency `integrity` slug on save. Strips `is_system` from text export transcripts. |
| **World Info / Lorebooks** | `.json` dictionary keyed by string UID (`entries: {}`) | Native `.json`, NovelAI `.json`, NovelAI `.png` (`naidata`), Agnai `.json`, RisuAI `.json`, CCv2/V3 embedded card book | `.json` | **Client:** Transpiles foreign schemas (NovelAI, Agnai, Risu, CharacterBook) into ST schema; handles export via `download()`.<br>**Server:** Atomic write to `worlds/`. | Interactive collision modal on existing world overwrite. Validates presence of `entries` key. |
| **Personas & Avatars** | Avatars: `.png`<br>Metadata: `settings.json` (`power_user.personas`) | Metadata: `.json`<br>Avatars: image upload | Metadata: `.json`<br>Avatars: N/A | **Client:** Backup construction and restore merging via `download()`.<br>**Server:** Jimp avatar crop/resizing and storage. | Warns on duplicate persona names during restore; skips overwrites. Sanitizes avatar names. |
| **Presets & Templates** | Individual `.json` files in categorized directories | `.json` (single preset or composite formatting bundle) | `.json` | **Client:** `PresetManager` reads JSON and triggers `download()`.<br>**Server:** Writes atomic JSON to respective directory. | Path traversal guard via API-directory mapping dictionary. Strips directory names with `sanitize-filename`. |
| **Group Chats** | Groups: `groups/{id}.json`<br>Transcripts: `groupChats/{id}.jsonl` | `.jsonl` | `.jsonl`, `.txt` | **Server:** Atomic JSON/JSONL write and stream export.<br>**Client:** UI group selection and download. | Migrates legacy metadata from group JSON to group chat JSONL headers. Path traversal validation. |
| **UI Themes** | `themes/{name}.json` | `.json` | `.json` | **Client:** `download()` trigger; scans for `@import` CSS rules.<br>**Server:** Atomic write to `themes/`. | Alerts user on CSS `@import` presence to mitigate cross-origin stylesheet attacks. |
| **Tags** | `settings.json` (`tags` & `tag_map`) | `tags_{timestamp}.json` | `tags_{timestamp}.json` | **Client:** Gathers tag structures and triggers `download()`; restore merges maps.<br>**Server:** Saves updated `settings.json`. | Prunes orphaned tag mappings when linked entities no longer exist on disk. |
