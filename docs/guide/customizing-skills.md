---
title: Customizing Skills
description:
  Override or trim Producer Pal's built-in skills — the instructions that teach
  the AI how to make music with your Ableton Live Set. Remove guidance you don't
  use to save tokens, or tune it to your workflow.
---

# Customizing Skills

The **Producer Pal Skills** are the instructions the AI receives when it
connects — how to write notes, edit clips, build instruments, search your
library, and work with Ableton Live. They're sent to external MCP clients (like
Claude Desktop) in the `ppal-connect` result and used by the built-in
[Chat UI](/guide/chat-ui) on every conversation.

You can override any part of them, and — since every part of the skills costs
tokens on every conversation — trim the parts you never use.

## How skills are assembled

The skills are composed from named **fragments**. A top-level fragment (the
"Full skills" document) pulls in the others with `@include` directives:

```
@include "./core-transforms.md"
@include "./core-library.md"

@include "./core-devices.md"
```

Each fragment can be overridden independently. When you override one, your
version replaces the built-in; every fragment you _don't_ override keeps
tracking Producer Pal's built-ins as they improve from release to release.

| Fragment                                       | What it teaches                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `standard`                                     | The whole standard skills document — the include manifest plus core guidance      |
| `basic`                                        | The trimmed equivalent used in small model mode                                   |
| `core-transforms`                              | The transforms/preTransforms DSL for editing notes and audio clip parameters      |
| `core-library`                                 | Searching Live's browser library and your sample folder                           |
| `core-devices`                                 | Device paths, building Simpler/Drum Rack instruments, specialized device controls |
| `core-arrangement`                             | Moving clips on the Arrangement timeline and take lanes                           |
| `core-context-standard` / `core-context-basic` | [Context & Memory](/guide/context) — the project, global, and memory layers       |
| `barbeat-standard` / `barbeat-basic`           | The bar\|beat note notation guide (default notation)                              |
| `stark-standard` / `stark-basic`               | The stark note notation guide                                                     |
| `midi-json`                                    | The midi-json note notation guide                                                 |

The `standard` driver also contains guidance that isn't a separate fragment —
time units and note values, audio clip basics, general Ableton Live workflow,
and getting help. That content is small and applies to everyone, so it lives
directly in the driver text.

## Editing fragments

**In the Chat UI:** open the [context editor](/guide/context) (the **Context**
button in the header) and switch to the **Skills** tab. Pick a fragment from the
dropdown: it shows read-only until you press **Customize**, which forks the
built-in into an editable override that auto-saves as you type. The trash button
resets a fragment, deleting your override. In the dropdown, ✎ marks a customized
fragment and ⚠ one whose built-in has changed since you forked it. **Preview**
shows the fully assembled skills exactly as the AI will receive them. See
[Context & Memory](/guide/context#skills) for screenshots.

**On disk:** overrides are plain Markdown files in `~/.producer-pal/skills/`,
named after the fragment (`core-devices.md`, `standard.md`, …). A file's
presence is the override; delete the file to reset. Edit them with any editor —
the Chat UI and external MCP clients pick up changes on the next conversation.

### The `@include` directive

Inside any fragment, a line like:

```
@include "./core-devices.md"
```

is replaced by that fragment (your override if present, else the built-in). A
few rules:

- `{notation}` in a name is replaced by the active notation, e.g.
  `@include "./{notation}-standard.md"` resolves to `barbeat-standard.md` by
  default.
- An include of a fragment that doesn't exist resolves to nothing — handy for
  optional content.
- You can include your own files: drop `my-style.md` in
  `~/.producer-pal/skills/` and add `@include "./my-style.md"` to a fragment.
- Subfolders work: a file at `~/.producer-pal/skills/drums/backbeat.md` is
  included as `@include "./drums/backbeat.md"`.
- Names are confined to the skills folder — a reference can't climb out of it
  with `..`, `~`, or a leading `/` — and circular includes are skipped with a
  warning.

## Trimming skills you don't need

If you never use a whole area of Producer Pal, remove its guidance: override the
**Full skills (standard)** fragment and delete the include line for that area.
Everything you keep continues to track the built-ins.

| If you never…                                           | Delete this line                        |
| ------------------------------------------------------- | --------------------------------------- |
| Use transforms to edit notes/audio params               | `@include "./core-transforms.md"`       |
| Search Live's library or your sample folder with the AI | `@include "./core-library.md"`          |
| Build or tweak instruments and effects with the AI      | `@include "./core-devices.md"`          |
| Work in the Arrangement view with the AI                | `@include "./core-arrangement.md"`      |
| Use project/global context or memory                    | `@include "./core-context-standard.md"` |
| Write or edit MIDI notes at all                         | `@include "./{notation}-standard.md"`   |

::: tip Check the result

After editing, use the Skills tab's **Preview** view to see the assembled
document, and start a new conversation for the change to take effect.

:::

::: warning What a driver override freezes

Overriding `standard` freezes its _inline_ text (time units, workflow, help) at
your copy — future improvements to those parts won't reach you until you reset
or re-fork. The sections you still `@include` are unaffected: they keep
resolving to the latest built-ins. To change just one area, override that
fragment instead of the driver.

:::

::: details Small model mode

Small model mode uses the `basic` driver, which is already heavily trimmed: it
includes only the notation guide and the context fragment, and inlines the rest.
To customize it, override `basic` (or the `*-basic` fragments — notation and
context) the same way.

:::
