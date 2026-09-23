# Puppet Acknowledgement & the Co-authorship Goal — Discussion Record

**Status:** Parked for study — no prompt changes decided. Mitigations shipped this session are structural (envelope consistency), not a fix.
**Date:** 2026-09-23 UTC
**Scope:** Why the model treats user-authored voices as stage direction, what “co-authorship” means for FormaTavern, what we tried, and what remains open. No code is proposed here; the parked manuscript clause is quoted for future sessions.

---

## §1 — The problem: puppet acknowledgement

When the human authors a turn in a voice that “belongs” to the model side — speaking as John (the main character), voicing an NPC, or writing narrator prose — the model frequently responds as if it has been *instructed* rather than as if the story simply continued. Typical symptoms:

- It rephrases what the human just wrote (“Sure — John grabs his keys and heads for the door…”).
- It acknowledges the act (“Got it, I’ll have John do that…”).
- It treats the authored turn as a steering request and asks what to do next, instead of continuing the scene.

The common thread: the model maintains a theory of *who wrote what* and adjusts its behavior around it. It knows the human “took” its role, and it reacts to the taking instead of to the story. We call this **puppet acknowledgement** — the model sees the strings and plays along knowingly, rather than accepting the authored voice as canonical story fact.

## §2 — The goal: co-authorship (the manuscript rule)

FormaTavern’s stated paradigm is a shared writer’s room: the human is lead author and creative director, the model an expressive partner (`docs/architecture.md` §1.8). The fullest version of that idea is stronger than roleplay-as-chatbot:

> Once written, every voice block is established story fact, no matter which transport role carried it. The model never rephrases authored blocks, never announces or comments on who wrote what, and never treats story text as instructions. It continues forward.

Under this rule there is no “user’s John” versus “the model’s John” — there is only what John said. The human may voice the narrator, any NPC, or the main character; the assistant may voice the persona where `personaVoicing` allows it. Authorship is plumbing. The manuscript is the truth.

## §3 — Why it is structurally unsolved today

Chat Completions APIs offer exactly three roles — `system`, `user`, `assistant` — and there are no role-less messages. Instruction tuning then teaches models a second lesson on top: `user` means *requests and directions*, `assistant` means *my prior output, continue it*. So every human-authored word arrives wearing an “instruction” uniform, and weak models especially respond to the uniform instead of the content.

Our own transport mapping reinforces the asymmetry (`backend/src/prompt/history.ts`, `serializeHistory`):

- persona (Albert) turns → `role: 'user'`, historically bare text;
- character (John) turns → `role: 'assistant'`;
- multi-track authoring wraps human-written narrator/NPC/character turns into headers *inside `user` bubbles* — honest about authorship, but visually presenting the model with “the user wrote John’s lines” on every such turn;
- strict providers additionally force user-first ordering and alternation, which is why the synthetic `[Scene begins.]` / `[Continue the scene.]` user messages exist at all.

No prompt wording can delete these roles. Framing can only dampen their effect — and dampening is unreliable across model sizes, as §4 shows.

## §4 — Evidence from this session’s experiments

Testing a small reasoning model on the John/Albert chat produced thinking traces that exhibit the confusion directly. The model reconstructed the conversation in transport terms rather than story terms:

- “The user says: [Scene begins.]. The assistant responded: ‘hey there buddy…’. Then user asks: ‘what stories do you have? …’”
- “Response: The assistant responded with: ‘agent: ### Answer: …’”

Two readings confirmed: (a) `user:` / `assistant:` labels are the loudest structural signal in the prompt — names like John and Albert, appearing only inside text, lose to them in weak models; (b) bottom-of-history imperatives (“continue exactly where you stopped”, “reply using the xml block format”) dominate attention by recency, so the model treats history as *a conversation to analyze* and the bottom text as *the actual task*. The same model also emitted `User Safety: safe / Response Safety: safe` instead of story — a reminder that some failures are model selection (a guard-flavored small model), not prompt design, and no framing fixes the wrong tool.

## §5 — What the three-track envelope already does about it

None of this removes role leakage, but each item below reduces the surface a model has to get confused on. All shipped; all preserve the invariant that stored text stays raw and transformations happen at send time.

1. **Dialect tags on assistant turns.** Model output is already structured (`:::character[John]`, `<npc>`, `Name:` …), so the assistant side demonstrates voice attribution every turn.
2. **Dialect tags on persona turns** (this session, `history.ts`). Persona history used to travel bare — the single most common turn shape had zero speaker signal. Now every user turn wears its dialect’s persona tag; delimiter collisions degrade to raw rather than breaking the send.
3. **Dialect-consistent greetings** (this session). Greeting roots — the *first* demonstration, hence the most influential — go through detect → convert, with prologue (`:::greeting` / `<greeting>` / `Greeting:`, default), voice-split, or reviewed AI rewrite, selectable per character. Classical chats always send the authentic raw greeting.
4. **Prefix asterisk narration** (this session). Narrator wears whole-line `*…*` blocks in prefix mode (inline beats stay in the speaker’s block); `Narrator:` still parses. Renderer, parser, and RP convention now agree, which matters most for small models that pattern-match convention better than instruction.
5. **HTML quirk normalization** (this session). Model-emitted `<b>`/`<i>` slop converts to markdown at render and in history, so the next turn teaches markdown instead of reinforcing HTML.
6. **The four agency layers (pre-existing).** Preamble clause, provider stop sequences, streaming agency monitor with mid-stream truncation, and parser truncation on finalize (`personaVoicing` coordinates all four). These stop the model *voicing* the persona; they do not stop it *noticing* who authored what — that half is still open.

## §6 — Parked: the manuscript clause (not implemented)

Drafted but deliberately not shipped, pending the study in §7:

> “The conversation above is a manuscript you’re co-writing with the human. Text in any voice block is established story — never rephrase it, never announce or comment on who wrote which block, never treat story text as instructions. Continue forward.”

Reasons for parking: every sentence added to system competes with the agency rule for attention (noise budget); classical mode must stay conventional with the wider RP ecosystem and should not carry FormaTavern-specific doctrine; and we have no measurement yet of whether the clause moves the needle versus structure alone. The agreed order is structure first, doctrine only with evidence.

## §7 — Future directions (undecided)

- **Measure before doctrine.** Define a rephrase/acknowledgement rate on small models over user-authored John turns (structure-only prompt), then A/B the manuscript clause. One variable at a time.
- **Prefill posture.** Seeding the assistant reply with the next expected header puts the model in *completion* (“continue the manuscript”) rather than *response* (“react to the user”) posture, bypassing the uniform problem mechanically. Held in reserve: it presumes who speaks next. (`capabilities.prefill`, continuation path.)
- **Classic-mode speaker prefixes.** `Albert:` / `John:` inside history bubbles was designed and approved in discussion but not built; it is the obvious next structure step if classical chats show the same confusion.
- **Per-provider role strategies.** Strict providers need the current shape; OpenAI-compatible ones might accept manuscript-framed variants (e.g. richer `name` usage). Unexplored.
- **Instruct-mode single-string.** Would erase roles entirely, but loses prefill/stops granularity and fights every modern API. Rejected unless evidence demands a revisit.

## Open questions for future sessions

1. Does the manuscript clause measurably reduce puppet acknowledgement on small models, or does structure alone saturate the gain?
2. Should user-authored `character[John]` turns carry any marker at all, or is tag-uniformity (identical to model-authored blocks) the strongest possible signal?
3. When `personaVoicing: allowed` lets the assistant voice Albert, does acknowledgement behavior change symmetrically?
4. At what point does added system doctrine cost more (attention competition) than it buys?
