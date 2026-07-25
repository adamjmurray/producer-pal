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

The skills are composed from named **fragments**. The **Full skills (standard)**
document is nothing but a list of `@include` directives, one per section, in
reading order:

```
@include "./transforms-core.md"

@include "./library.md"

@include "./devices.md"
```

Each fragment can be overridden independently. When you override one, your
version replaces the built-in; every fragment you _don't_ override keeps
tracking Producer Pal's built-ins as they improve from release to release.

Fragments are cut along the lines of what you're actually doing, so you can drop
a whole area you never use:

| Fragment                             | What it teaches                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `standard`                           | The standard skills document — the list of `@include` lines below                          |
| `basic`                              | The much shorter document used in small model mode                                         |
| `time-and-values`                    | Beats, note values, bar\|beat positions, clip lengths, and the audio clip fields           |
| `transforms-core`                    | Selecting notes and setting values on them, plus `preTransforms` for deleting and clearing |
| `transforms-expressions`             | Transform variables, math functions, swing and quantize                                    |
| `transforms-generative`              | ratchet/repeat/split/merge, and the waveforms that modulate a value across a clip          |
| `library`                            | Searching Live's browser library and your sample folder                                    |
| `devices`                            | Device paths, building Simpler/Drum Rack instruments, VST/AU limits                        |
| `specialized-devices`                | The extra controls specific native devices expose (Drift, Wavetable, EQ Eight…)            |
| `arrangement`                        | Moving clips on the Arrangement timeline and take lanes                                    |
| `working-with-live`                  | Session vs. Arrangement habits, playback, layering, locators                               |
| `context-standard` / `context-basic` | [Context & Memory](/guide/context) — the project, global, and memory layers                |
| `getting-help`                       | What to tell you when a request is outside Producer Pal's reach                            |
| `barbeat-standard` / `barbeat-basic` | The bar\|beat note notation guide (default notation)                                       |
| `stark-standard` / `stark-basic`     | The stark note notation guide                                                              |
| `midi-json`                          | The midi-json note notation guide                                                          |

::: warning Fragment names changed in 2.0.1

The `core-*` fragments (`core-transforms`, `core-devices`,
`core-context-standard`, …) were re-cut into the list above. If you customized
one, its file in `~/.producer-pal/skills/` is no longer used — Producer Pal
warns about it in the Skills **Preview** view and the Max window. Copy your
changes into whichever new fragment now covers that material and delete the old
file.

:::

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
named after the fragment (`devices.md`, `standard.md`, …). A file's presence is
the override; delete the file to reset. Edit them with any editor — the Chat UI
and external MCP clients pick up changes on the next conversation.

### The `@include` directive

In the **Full skills** document, a line like:

```
@include "./devices.md"
```

is replaced by that fragment (your override if present, else the built-in). A
few rules:

- `{notation}` in a name is replaced by the active notation, e.g.
  `@include "./{notation}-standard.md"` resolves to `barbeat-standard.md` by
  default.
- **Includes don't nest.** Only the Full skills document may include fragments;
  an `@include` inside a fragment is skipped with a warning. That's what keeps
  "delete this line, save these tokens" honest — one line is always exactly one
  fragment.
- An include naming a fragment that doesn't exist resolves to nothing, with a
  warning so a typo (or a fragment renamed by an update) doesn't silently
  shorten your skills.
- You can include your own files: drop `my-style.md` in
  `~/.producer-pal/skills/` and add `@include "./my-style.md"` to the Full
  skills document.
- Subfolders work: a file at `~/.producer-pal/skills/drums/backbeat.md` is
  included as `@include "./drums/backbeat.md"`.
- Names are confined to the skills folder — a reference can't climb out of it
  with `..`, `~`, or a leading `/`.

## Trimming skills you don't need

If you never use a whole area of Producer Pal, remove its guidance: override the
**Full skills (standard)** fragment and delete the include line for that area.
Everything you keep continues to track the built-ins.

| If you never…                                           | Delete these lines                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Use ratchets, echoes, or waveform modulation            | `@include "./transforms-generative.md"`                                                                 |
| Use swing, quantize, or math on note values             | `@include "./transforms-expressions.md"` **and** `@include "./transforms-generative.md"`                |
| Use transforms to edit notes/audio params               | `@include "./transforms-core.md"` **and** both other `transforms-` lines — the whole area goes together |
| Search Live's library or your sample folder with the AI | `@include "./library.md"`                                                                               |
| Edit Drift, Wavetable, EQ Eight… with the AI            | `@include "./specialized-devices.md"`                                                                   |
| Build or tweak instruments with the AI                  | `@include "./devices.md"` **and** `@include "./specialized-devices.md"`                                 |
| Work in the Arrangement view with the AI                | `@include "./arrangement.md"`                                                                           |
| Use project/global context or memory                    | `@include "./context-standard.md"`                                                                      |
| Write or edit MIDI notes at all                         | `@include "./{notation}-standard.md"`                                                                   |

::: warning Some fragments need another one

A few fragments teach a vocabulary whose syntax lives elsewhere. The transforms
guides all build on `transforms-core` — keeping `transforms-generative` without
it leaves the AI knowing `ratchet()` and the waveforms but not the shape of a
transform, which is worse than dropping all three. `specialized-devices` sits
inside `devices` the same way. That's why the rows above are ordered
most-specific-first and say which lines travel together.

If you do delete a line something else needs, Producer Pal says so — the Skills
**Preview** view shows a warning, and so does the Max window.

:::

::: tip Check the result

After editing, use the Skills tab's **Preview** view to see the assembled
document, and start a new conversation for the change to take effect.

:::

::: warning What overriding the Full skills document freezes

Overriding `standard` freezes _the list itself_ at your copy: if a future
release adds a new fragment, your document won't include it until you reset or
re-fork. The fragments you still `@include` are unaffected — they keep resolving
to the latest built-ins. To change what a section _says_, override that fragment
instead of the Full skills document.

:::

::: details Small model mode

Small model mode uses the `basic` document, which is already heavily trimmed: it
includes only the notation guide and the context fragment, and writes the rest
inline. To customize it, override `basic` (or the `*-basic` fragments — notation
and context) the same way.

:::
