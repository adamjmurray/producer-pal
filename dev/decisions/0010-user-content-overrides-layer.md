# ADR-0010: `~/.producer-pal` is a user content-override layer, not a settings mirror

- **Status:** Accepted
- **Date logged:** 2026-07-01
- **Amended:** 2026-07-04 (principle 5, when skills moved to `@include`
  composition) and 2026-08 for the 2.0.1 slot re-cut.

## Context

The v2.0 "make it _your_ assistant" work added user-authored customization:
global context, a custom system prompt, and skills overrides. The question was
where that lives and what shape it takes.

An early draft assumed the device's runtime settings were volatile and needed
rescuing onto disk in a `config.json`. **That premise was wrong** — the device
already persists its scalar settings and per-project context and re-sends them
on load. There was nothing to rescue.

## Decision

`~/.producer-pal/` is a global, read-mostly content-override layer. It is never
a settings mirror. Authority splits by scope:

| Scope           | Source of truth          | Examples                                 |
| --------------- | ------------------------ | ---------------------------------------- |
| Scalar settings | Max device (persists)    | port, small-model mode, notation         |
| Per-project     | Max device "Context" tab | facts about _this_ Live Set              |
| Global          | `~/.producer-pal/` files | cross-project facts, prompt/skills forks |

The file layer is machine-global, shared across every client and every Live Set.
Node-for-Max reads it — the browser can't touch the filesystem, so the webui
gets the content over HTTP and external clients see it only through the
`ppal-connect` result.

### Override principles

These govern _override_ slots, where a built-in default exists and the user
replaces it. Additive content like global context has no default and sidesteps
all of this.

1. **Never dump defaults to disk.** Writing a built-in to `~/.producer-pal`
   converts it from "tracks upstream" into a frozen fork, so the user misses
   every later tuning of that content. Skills get tuned every release, so this
   matters.
2. **A file exists only where the user deliberately overrode that slot.** Empty
   folder means everything uses the latest built-ins.
3. **The editor is for discoverability, not dumping.** The webui lists every
   slot pre-filled with the current built-in; saving writes one override file,
   and "reset to default" deletes it.
4. **Upgrades:** no file means auto-tracking upstream; a file means frozen by
   choice but always reconcilable, since the built-in ships in code and the
   editor can diff yours against it. Only a proactive "the default changed since
   you forked" nudge would need stored provenance, and that's deferred.
5. **Curated slot names are a stable contract; the fragment namespace around
   them is open.** Skills compose via `@include "./name.md"`, so any `.md` under
   `~/.producer-pal/skills/` resolves — nested folders and user-named files
   included. The curated slots (`SKILL_SLOT_NAMES`) are the subset the editor
   surfaces and drift-tracks, so that set stays small, coarse, and stable.
   Everything else is active but untracked: resolvable, but with no editor entry
   and no upgrade reconciliation. Includes are depth-1 (only a driver may
   include), so a fragment costs exactly its own length. Resolution is confined
   to the skills dir.

The slot set was re-cut once, in 2.0.1, along task lines. That break is paid for
with two warnings, because both halves of it are otherwise invisible: an include
naming a retired fragment warns (`include-resolver.ts`), and an override file
keyed to a retired slot warns separately (`RETIRED_SKILL_SLOTS` in
`skill-slots.ts`) — the resolver can't see that one, since an orphaned override
appears in no include.

## Alternatives rejected

- **A `config.json` settings mirror** — rejected on the corrected premise above.
  The one reusable idea from that cancelled effort (atomic temp+rename writes,
  missing file means empty) survives in `config-markdown-store.ts`.
- **Custom system prompt as append-or-section-override** — shipped as
  full-replace instead: non-blank content replaces the built-in entirely, blank
  means default. No provenance needed, since the built-in ships in the bundle.
- **Tool and arg description overrides** — punted; the skill system covers it.
- **Named presets / personas as a file slot** — deferred. Dynamic toolsets can't
  safely change mid-session for external clients, so this is likely webui-only.

## Consequences

- Each fact has exactly one authority; no settings are duplicated.
- Overrides track upstream by default, so most users get each release's tuning
  for free and only deliberate forks freeze.
- Provenance machinery waits until the first true replace of release-tuned
  content, where drift actually matters.
- The open namespace buys forkability at the cost of a two-tier surface: curated
  slots get the editor and drift nudge; hand-authored fragments are power-user
  territory, self-managed.
