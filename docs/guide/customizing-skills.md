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
tokens on every conversation — trim the parts you never use. Trimming is one of
several levers; [Optimizing](/guide/optimizing) covers them all and says which
pays off most.

## How skills are assembled

The skills are composed from named **fragments**. The **Full skills (standard)**
document is nothing but a list of `@include` directives, one per section, in
reading order:

```
@include "./transforms-core.md"

@include "./library.md"

@include "./devices.md"
```

Each fragment can be overridden independently, or switched off entirely. When
you override one, your version replaces the built-in; every fragment you _don't_
override keeps tracking Producer Pal's built-ins as they improve from release to
release.

Fragments are cut along the lines of what you're actually doing, so you can drop
a whole area you never use:

| Fragment                                         | What it teaches                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `standard`                                       | The standard skills document — the list of `@include` lines below                                             |
| `basic`                                          | The much shorter document used in small model mode                                                            |
| `time-and-values`                                | Beats, note values, bar\|beat positions, clip lengths, and pitch names (C3=60)                                |
| `transforms-core`                                | Selecting notes and setting values on them                                                                    |
| `transforms-editing`                             | Editing a clip that already has notes: how `notes` merges, `preTransforms`, `quantizeGrid` (update-clip only) |
| `transforms-expressions`                         | Transform variables, math functions, swing and quantize                                                       |
| `transforms-generative`                          | ratchet/repeat/split/merge, and the waveforms that modulate a value across a clip                             |
| `transforms-basic`                               | Merging into a clip and clearing notes with `preTransforms` — the whole transforms guide in small model mode  |
| `library`                                        | Searching Live's browser library and your sample folder                                                       |
| `devices`                                        | Device paths and VST/AU limits                                                                                |
| `devices-write`                                  | Building Simpler and Drum Rack instruments — loading samples                                                  |
| `specialized-devices`                            | The extra controls specific native devices expose (Drift, Wavetable, EQ Eight…)                               |
| `arrangement`                                    | What an Arrangement position means — song meter vs. clip meter                                                |
| `arrangement-write`                              | Moving and splitting clips on the Arrangement timeline, and take lanes                                        |
| `working-with-live`                              | Session vs. Arrangement habits, playback, and general music-making advice                                     |
| `context-standard` / `context-basic`             | [Context & Memory](/guide/context) — the project, global, and memory layers                                   |
| `getting-help`                                   | What to tell you when a request is outside Producer Pal's reach                                               |
| `getting-help-basic`                             | The audio limits worth saying out loud, in small model mode                                                   |
| `barbeat-standard` / `barbeat-basic`             | The bar\|beat note notation guide (default notation)                                                          |
| `barbeat-standard-write` / `barbeat-basic-write` | The bar\|beat syntax used only to _write_ notes — repeats, brackets, bar copying, examples                    |
| `stark-standard` / `stark-basic`                 | The stark note notation guide                                                                                 |
| `stark-standard-write` / `stark-basic-write`     | Stark chord symbols (`Am`, `G7`, `Ebm7`) — input only, since read-back returns literal notes                  |
| `midi-json`                                      | The midi-json note notation guide                                                                             |

::: warning Fragment names changed in 2.1.0

The `core-*` fragments (`core-transforms`, `core-devices`,
`core-context-standard`, …) were re-cut into the list above, and
`midi-json-standard` / `midi-json-basic` were folded into a single `midi-json`.
If you customized any of them, its file in `~/.producer-pal/skills/` is no
longer used — Producer Pal warns about it in the Skills **Preview** view and the
Max window. Copy your changes into whichever new fragment now covers that
material and delete the old file.

The notation guides also split in two: the `-write` fragments above were carved
out of `barbeat-standard`, `barbeat-basic`, `stark-standard`, and `stark-basic`.
An override of one of those still loads, but it carries a copy of the writing
material that now ships separately — so the model reads it twice. Producer Pal
warns when it spots that. Delete the duplicated sections from your override, or
override its `-write` fragment too.

:::

## Editing fragments

**In the Chat UI:** open the [context editor](/guide/context) (the **Context**
button in the header) and switch to the **Skills** tab. Pick a fragment from the
dropdown — they're listed by filename (`devices.md`), the name their `@include`
line uses, with the fragment's title and explainer beside it. It opens showing
Producer Pal's default, and typing into it forks that default into your own
override, which auto-saves as you go. The trash button resets a fragment,
deleting your override. The **Include** checkbox beside the dropdown switches a
fragment out of the skills entirely. In the dropdown, ✕ marks a fragment that's
switched off, ✎ one that's customized, and ⚠ one whose built-in has changed
since you forked it. **Preview** shows the fully assembled skills exactly as the
AI will receive them. See [Context & Memory](/guide/context#skills) for
screenshots.

**On disk:** overrides are plain Markdown files in `~/.producer-pal/skills/`,
named after the fragment (`devices.md`, `standard.md`, …). A file's presence is
the override; delete the file to reset. A fragment is switched off by an
`enabled: false` line in that file's frontmatter, so a switched-off fragment
with no override is a file holding just:

```
---
enabled: false
---
```

Edit them with any editor — the Chat UI and external MCP clients pick up changes
on the next conversation.

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

::: tip Disabling a tool already trims its skills

Fragments are cut along tool lines, so turning a tool off drops the fragment
that teaches it — automatically, wherever you turned it off: the Tools tab in
the [Chat UI](/guide/chat-ui#tools) (per preset, and per subagent), or the tool
list an external MCP client is configured with. Switch off library search and
the library guide is gone from that conversation's skills. Direction counts too:
a conversation that can read clips but not create or update them keeps the
bar\|beat note format and drops the syntax used only to write notes. Reach for
the manual trimming below for areas you want dropped while keeping the tool.

:::

If you never use a whole area of Producer Pal, remove its guidance: pick that
fragment in the Skills tab and uncheck **Include**. Everything you keep
continues to track the built-ins, and switching a fragment off keeps any
override you wrote for it — check the box again and it comes back.

| If you never…                                            | Switch off                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Use ratchets, echoes, or waveform modulation             | `transforms-generative`                                                                                                                                            |
| Edit, delete, or clear notes already in a clip           | `transforms-editing`                                                                                                                                               |
| Use swing, quantize, or math on note values              | `transforms-expressions` **and** `transforms-generative`                                                                                                           |
| Use transforms to edit notes/audio params                | `transforms-core` **and** the other `transforms-` fragments — the area goes together                                                                               |
| Search Live's library or your sample folder with the AI  | `library`                                                                                                                                                          |
| Edit Drift, Wavetable, EQ Eight… with the AI             | `specialized-devices`                                                                                                                                              |
| Build Simpler or Drum Rack instruments with the AI       | `devices-write`                                                                                                                                                    |
| Touch devices with the AI at all                         | `devices`, `devices-write` **and** `specialized-devices`                                                                                                           |
| Let the AI move clips or record takes in the Arrangement | `arrangement-write`                                                                                                                                                |
| Work in the Arrangement view with the AI                 | `arrangement` **and** `arrangement-write`                                                                                                                          |
| Use project/global context or memory                     | `context-standard`                                                                                                                                                 |
| Ask for new MIDI notes, but still want them read back    | the write half for your notation and mode (e.g. `barbeat-standard-write`, `stark-basic-write`) — midi-json has none, since it's the same format in both directions |
| Write or edit MIDI notes at all                          | the notation guide for your notation, write half included (e.g. `barbeat-standard` **and** `barbeat-standard-write`)                                               |

The same trims by hand: override the **Full skills (standard)** fragment and
delete a fragment's `@include` line. That's the route when you also want to
reorder sections or add your own, and it's the only way to cut down the Full
skills documents themselves — they have no **Include** checkbox, since switching
one off would leave the AI with no skills at all.

::: warning Some fragments need another one

A few fragments teach a vocabulary whose syntax lives elsewhere. The other
transforms guides all build on `transforms-core` — keeping
`transforms-generative` without it leaves the AI knowing `ratchet()` and the
waveforms but not the shape of a transform, which is worse than dropping them
all. `devices-write` and `specialized-devices` both sit inside `devices` the
same way, and so does `arrangement-write` inside `arrangement`. Each notation's
write half sits inside its own guide too — `barbeat-standard-write` inside
`barbeat-standard`, `stark-basic-write` inside `stark-basic`, and so on. That's
why the rows above are ordered most-specific-first and say which fragments
travel together.

`time-and-values` is the widest of these: it defines the units everything else
counts in, plus the octave convention (C3 = MIDI 60). The bar|beat guide,
`transforms-core`, `devices`, and `working-with-live` all lean on it, so it's
best left on.

If you do drop a fragment something else needs, Producer Pal says so — the
Skills **Preview** view shows a warning, and so does the Max window.

:::

::: tip Check the result

After editing, use the Skills tab's **Preview** view to see the assembled
document, and start a new conversation for the change to take effect. The
preview shows what an external MCP client receives; a chat whose preset disables
tools gets a shorter document still.

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
includes the notation guide and its write half, `transforms-basic`, and the
context fragment, and writes a short list of general rules inline. To customize
it, override `basic` (or the `*-basic` fragments — notation, transforms, and
context) the same way.

:::
