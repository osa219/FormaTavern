# FormaTavern App Observations & Proposals

**Status:** Living document. One section per observation.
**Git tag:** `v0.5.0` (`2a5824e`)
**Date:** 2026-09-07 UTC

---

## §1 — Fresh install looks empty; the app's visual range is hidden

**Observed on:** `v0.5.0`, fresh database.

The Foyer (home screen) is dark and uniform: black background, plain cards with letter avatars. It gives no hint of what the app can do — custom fonts, bubble styles, colors, ambient backdrops, reactive mood shifts. All of that only appears inside a character's page or chat.

Per-companion theming already works (Studio: fonts, colors, bubbles, backgrounds, state bindings; plus persona overrides). There is just no way to theme the app shell itself.

### Proposal P1: global theme for the app shell

**Idea:** add a global theme that styles the Foyer, navigation, and drawers. Character and chat themes keep higher priority and always override it.

Cascade: `neutral → global → character → bindings → persona → a11y`.

**Level of customization we want:**

- Colors (accent, surfaces, borders), chrome font, card shape and density.
- Foyer background (local image + overlay + blur).
- Frosted chrome controls: per-companion scrim strength as a theme token (author side), plus a global Accessibility toggle forcing solid chrome back (user side).
- A few designed layout variants (e.g. header and card styles) — no custom CSS, no layout breaking.

---

## §2 — Stories pile up with nowhere to browse them

**Observed on:** current build, Foyer with a growing number of chats.

The home screen mixes everything: the companion catalog plus a flat list of recent stories. As chats accumulate, older stories get buried — there is no place to browse all characters and their stories in one view, grouped and sortable.

### Proposal P2: a dedicated library page for characters and their stories

**Idea:** add a separate page listing every character, each with its stories tucked beneath it in an expandable group showing the story count. Groups can be sorted in different ways (by story count, newest activity, oldest activity).

The home screen keeps only recent characters and recent stories, with a "view all" path into the library.

**Why it matters:**

- Home stays light and fast, which matters most on phones.
- Browsing a large history needs room — a full page scans far better than a drawer on a small screen.
- Grouping matches how the app already thinks: stories already belong to characters (the stories drawer groups them the same way).

**Shape of the page:**

- Collapsed groups by default on mobile; the open/closed state survives going back.
- Newest activity first unless the user picks another sort.
- Each story row shows what is needed to recognize it: relative date, turn count, in-progress badge, and a delete control that works by touch.
- A filter box to narrow characters and stories.
- One shared grouping behind both this page and the stories drawer, so the two can never drift apart.

---

## §3 — Phone users get the desktop-shaped first screen

**Observed on:** current build, narrow viewport / phone over LAN.

The app serves one version for everyone and lets the phone reshape it after it loads. On mobile — where most use will happen — this means a slower, blank-feeling start followed by layout shifting into place.

### Proposal P3: same address, phone-shaped first screen

**Idea:** keep a single address for everyone, but have the server notice when the visitor is on a phone and send a phone-shaped first screen right away.

Same link on desktop and phone. Desktop keeps its current first screen. Phone gets a compact first screen (condensed header, mobile navigation, compact cards) from the start, then continues in the same app — no redirect, no second site to maintain.

**Why it matters:**

- Most sessions will be on phones, so first impression is a mobile concern.
- Faster perceived start with less shifting on small screens.
- One codebase and one link to share and maintain.

---

## §4 — A phone on the same WiFi cannot reach the app

**Observed on:** current build, phone browser on the same home network.

The app only listens on its own computer. Typing the same address on a phone leads to a "site can't be reached" error, which reads as if the app is broken when it is simply not shared on the network. Testing on a real phone — where most use will happen — currently needs manual workarounds.

### Proposal P4: one supported way to share on home WiFi

**Idea:** offer a single, supported sharing mode that produces a phone-openable address for the same app (screen and data together on one address). The desktop flow stays exactly as it is.

**Why it matters:**

- Real-phone testing becomes a normal step instead of a networking chore.
- One obvious path beats scattered per-device fixes.

**Guardrails:**

- Private-only by default; sharing on the network is an explicit, temporary choice.
- Sharing shows a clear warning that anyone on the same WiFi can open the app.

**Not in scope:** public internet access, tunnels, or logins — home WiFi only.
