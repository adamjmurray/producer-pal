# ADR-0010: `~/.producer-pal` is a user content-override layer, not a settings mirror

- **Status:** Accepted
- **Date logged:** 2026-07-01
- **Amended:** 2026-07-04 — principle 5 revised when skills moved to an
  `@include` composition model. The overridable surface became an **open
  fragment namespace** (any `.md` under `skills/`, nested folders included)
  resolved by the include graph, of which the curated slots are the
  editor-tracked subset. This reverses the original "unknown files are
  ignored/inactive" stance: they are now **active but untracked**.

## Context

The v1.5 "make it _your_ assistant" theme adds user-authored customization:
global context/memory, a custom system prompt, and (later) skills overrides. The
open questions were _where_ this lives and _what shape_ it takes.

An earlier draft assumed the Max for Live device's runtime config was "in-memory
and volatile, reset on device reopen," and that a `~/.producer-pal/config.json`
was needed to rescue those settings onto disk. **That premise was wrong.** The
device already persists its scalar settings (port, timeout, small-model mode,
Direct Live API, JSON output, verbose logs) **and** the per-project context, and
re-sends them to the server on load. There is nothing to rescue, and mirroring
device settings into a file would be redundant and confusing.

## Decision

`~/.producer-pal/` is a **global, read-mostly content-override / authoring
layer** — never a settings mirror. Authority splits by scope:

| Scope           | Source of truth                    | Examples                                           |
| --------------- | ---------------------------------- | -------------------------------------------------- |
| Scalar settings | Max device (persists per instance) | port, small-model mode, notation toggle            |
| Per-project     | Max device "Context" tab           | facts about _this_ Live Set                        |
| **Global**      | **`~/.producer-pal/` files**       | facts across all projects, prompt/skills overrides |

The device stays authoritative for settings + per-project context. The file
layer is the machine-global layer shared across every client (webui, Claude
Desktop, LM Studio) and every Live Set. Overrides are read **backend-side** by
Node-for-Max — the browser can't touch the filesystem, so the webui receives
content over HTTP; external clients see it solely through the `ppal-connect`
tool result (the same append seam the `WARNING:` relay uses).

### Override-layer principles

These govern _override_ slots — where a built-in default exists and the user
replaces it. (Additive content like global context has no default to override
and sidesteps all of this.)

1. **Never bulk-dump defaults to disk.** Writing a built-in default to
   `~/.producer-pal` converts it from "tracks upstream" into a **frozen fork** —
   the user then misses every future tuning of that content (the
   create-react-app "eject" trap). Skills are tuned every release, so this
   matters.
2. **A file exists only when the user has deliberately overridden that slot.**
   Empty folder ⇒ everything uses the latest built-ins.
3. **The editor is discoverability, not a dump.** The webui editor lists every
   override slot pre-populated with the _current_ built-in (fetched live from
   the backend). Save writes an override file for that one slot; "reset to
   default" deletes it.
4. **Upgrade path, three cases:** _uncustomized_ (no file) auto-tracks upstream;
   _customized_ (file present) is frozen by choice but always reconcilable (the
   built-in ships in code, so the editor can diff "yours │ current built-in" and
   offer reset/re-fork); a _proactive "the default changed since you forked"
   nudge_ is the only case needing stored provenance (fork-time version/hash in
   frontmatter), and is deferrable because case 2 already lets a user find drift
   manually.
5. **Curated slot names are a stable public contract; the fragment namespace
   around them is open.** Skills compose via `@include "./name.md"` directives,
   so any `.md` under `~/.producer-pal/skills/` — nested folders and files the
   user names themselves included — is resolvable, letting a forked driver point
   an include at its own fragment. The **curated slots** (`SKILL_SLOT_NAMES`)
   are the subset the webui editor surfaces and drift-tracks: renaming/splitting
   one orphans a user override keyed to the old name, so that set stays **small,
   coarse, and stable** (those `buildSkills` fragment names are the API the
   editor guarantees). Files outside it are **active but untracked** — resolved
   by the include graph, but with no editor entry and no fork-time provenance,
   so no "default changed" nudge; a fragment the graph never references is
   simply inert. Resolution is confined to the skills dir (refs starting with
   `/ . .. ~`, or containing `..`, are rejected).

## Alternatives rejected / deferred

- **A `config.json` settings mirror** — rejected on the corrected premise above.
  The earlier user-facing-config-storage effort that assumed volatile settings
  was **cancelled**. The one reusable idea from it (atomic temp+rename writes,
  missing-file→empty, Vitest-inert home-dir resolution) survives in
  `config-markdown-store.ts` for single markdown files.
- **Custom system prompt: append-to-default vs section-override** — the shipped
  choice is **full-replace** (non-blank content wholly replaces the built-in
  `SYSTEM_INSTRUCTION`; blank = default), global scope, text chat only (voice
  keeps its own instructions). Full-replace did **not** need
  frontmatter/provenance: the built-in ships in the bundle, so Clear reverts to
  it and the editor can always diff against it.
- **Tool / arg description overrides** — punted; rely on the skill system
  instead.
- **Named presets / "personas"** — deferred. Dynamic toolsets can't safely
  change mid-session for external clients like Claude Desktop, so this is likely
  a webui-only feature on the existing webui persistence rather than a
  `~/.producer-pal` slot.

## Consequences

- No redundant settings duplication; each fact has exactly one authority.
- Overrides track upstream by default — the majority of users get every
  release's tuning for free, and only deliberate forks freeze.
- Provenance/frontmatter machinery is deferred until the first _true_ replace of
  release-tuned content (built-in skills-fragment override), where drift
  actually matters — not built speculatively.
- Shipped so far: global context (v1), reveal-config-folder (Node side), the
  webui editor, `ppal-context` global read/write, and the custom system prompt.
  Remaining override work (custom / disable-able skills) is tracked as project
  work and inherits these principles.
- The open fragment namespace buys forkability (a driver can be reorganized,
  extended with the user's own fragments, or repointed at nested files) at the
  cost of a **two-tier surface**: curated slots get the editor + drift nudge;
  hand-authored/nested fragments are power-user territory — resolvable but
  self-managed, with no upgrade reconciliation.
