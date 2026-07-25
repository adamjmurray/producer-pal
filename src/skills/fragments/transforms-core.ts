// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Tier 1 of the three transforms fragments: everything a task needs to select
// notes and set a value on them. The tiers are cut by REQUEST FREQUENCY, not by
// conceptual complexity — so `where(...)` and `preTransforms` are here (they are
// how you say "delete the quiet notes" and "clear that bar", among the most
// common asks) even though one is a value test and the other is the last section
// of the old monolith. Anything needing the note's current value, a function, or
// a waveform is tier 2/3 (transforms-expressions / transforms-generative).
//
// This fragment owns the `## Transforms` heading; the other two tiers hang off
// it as `###` sections, so the standard driver's manifest order matters.
//
// The Shorthand and Expression bullets deliberately still NAME waveforms, math
// functions, and current values even though those live in tier 2/3. Trimming
// those mentions when the text moved cost a `drum-transforms` eval turn: with
// nothing pointing at `rand()`, "randomize the snare velocities" resolved to the
// `vA-B` shorthand instead. A tier may reference vocabulary it doesn't define —
// what must not leak across fragments is CONTENT, since that is what makes an
// include line's token cost a lie.
export const transformsCore = `## Transforms

Add \`transforms\` parameter to create-clip, update-clip, or duplicate.

**Shape:** a single string, broadcast across every clip/copy. Multiple expressions: newline-separated. Per-clip variation: \`clip.index\` arithmetic or \`clipseq()\` inside the string (below). Structurally-distinct edits per clip → separate tool calls.

**Syntax:** \`[selector:] parameter operator expression\` (one per line)
- **Selector:** pitch and/or time filter, optionally a \`where(...)\` value test, followed by \`:\` - e.g., \`C3:\`, \`1|1-2|4:\`, \`C3 1|1-2|4:\`, \`1|1-2|4 C3:\`, \`where(note.velocity < 40):\`. **Per-line:** every selector (pitch, time, where) applies only to its own line — never carried to or inherited from neighbors; a line with no selector hits all notes. Repeat the selector to scope several lines
- **Pitch filter:** \`C3\` (single) or \`C3-C5\` (range) - omit for all pitches
- **Time filter:** \`1|1-2|4\` (bar|beat range, **ends inclusive**, matches note start time); bounds use the same bar|beat dialect as Time & Note Values positions (decimal or \`±n\` offset, e.g. \`1|1+n/12-2|1\`)
  - **Single point:** a bare bar|beat with no \`-\` (\`4|3.5:\`) targets only the note starting exactly there — e.g. \`Gb1 4|3.5: ratchet(4)\` rolls just that note
  - **Whole bars:** \`3|*\` = all of bar 3, \`1|*-3|*\` = bars 1-3 — half-open, so exactly those bars with no spill onto the next downbeat. Prefer this for "measure N"; \`3|1-4|1\` would also match a note on 4|1
  - **Exclusive end:** append \`-<\` to make only the end bound exclusive — \`3|1-<4|1\` = up to but not including 4|1 (for sub-bar half-open spans)
- **Value filter** \`where(...)\`: keep only notes whose properties satisfy a boolean test — \`where(note.velocity < 40): delete\` deletes quiet notes, \`where(note.velocity > 100): velocity += 20\` accents loud ones, \`where(note.probability < .5): delete\` thins. Build it from comparisons (\`> >= < <= == !=\`), booleans (\`&& || !\`), parens, arithmetic, and functions over note.velocity/deviation/duration/probability/pitch/start (\`note.duration\`/\`note.start\` in musical beats; RHS may be a number, note name, or \`n/8\`). Functions work too — \`where(abs(note.start - 4) < 1): velocity += 20\` (near beat 4, either side), \`where(min(note.velocity, note.deviation) > 80): ...\`. AND-combines with a pitch/time selector: \`C3-C5 where(note.velocity > 80): velocity += 20\`. Comparisons tolerate sub-beat float drift, so \`==\`/\`!=\` are safe even on float props (\`note.start == n/8\` matches a note that names that beat); still prefer \`<\`/\`>\` for ranges. Note properties only (no note.index/count/next); all functions except legato/seq (they need the selection); not on note-count ops
- **MIDI parameters:** velocity (<=0 deletes note, else capped at 127), pitch (0-127), timing (musical beats), duration (musical beats; <=0 deletes note), probability (0-1), deviation (-127 to 127)
- **Audio parameters:** gain (-70 to 24 dB), pitchShift (-48 to 48 semitones)
- **Operators:** \`+=\`, \`-=\` (add/subtract), \`*=\`, \`/=\` (scale current value), \`=\` (set)
- **Shorthand** (clears/simple sets): a single bar|beat-style token instead of \`param = value\` — \`delete\` (or \`v0\`) delete a note · \`vN\`/\`v±N\`/\`vA-B\` velocity (range = humanized random, same as notes) · \`pN\`/\`p±N\` probability · \`n/4\`/\`Nbar\`/\`1bar+n/4\` duration · \`C4\` remap pitch (one per line; a selector still applies, e.g. \`C1: delete\`). \`delete\` is a transforms/preTransforms alias only — bar|beat \`notes\` strings still use \`v0\`. Preferred for clearing/deleting; use the full \`param op expr\` form for computed changes (\`+=\`, \`*=\`, waveforms, ramps). Note \`vA-B\` is the one shorthand with no \`param = ...\` longhand — it sets velocity AND velocity_deviation together, so write it as the shorthand (\`velocity = vA-B\` errors)
- **Expression:** arithmetic (+, -, *, /, %) with numbers, waveforms, math functions, current values, and durations: \`n<dur>\` note values (e.g. \`n/4\` = a quarter in any meter) and \`Nbar\` meter-aware bars (e.g. \`1bar\`, \`1bar+n/4\`) — same grammar as bar|beat and length fields. Both evaluate to musical beats and compose in any math expression (so in a non-time param like \`velocity\` a bare \`1bar\` resolves to its beat count — e.g. 4 in 4/4 — rarely what you want there)

\`\`\`
1|1-2|4: velocity = 100          // forte in bars 1-2
C1-C2: velocity += 30            // accent bass notes
where(note.velocity < 40): delete // delete the quiet notes
where(note.velocity > 100): velocity += 20 // accent the loud ones (clamps at 127)
C3-C5 where(note.probability < .5): delete // thin low-probability notes in a pitch band
velocity *= 0.5                  // halve all velocities
C1-C2: duration /= 2             // halve duration of bass notes
duration = n/8                   // every note → an eighth note (any meter)
duration += n/16                 // lengthen every note by a sixteenth
timing += n/8                    // nudge every note an eighth note later (relative)
\`\`\`

update-clip's \`quantizeGrid\` param uses Live's native grid enum (\`1/4\`,\`1/8\`,\`1/8T\`,\`1/16\`,\`1/16T\`,\`1/32\`) but also accepts the equivalent \`n/N\` note value (\`n/12\`=\`1/8T\`, \`n/24\`=\`1/16T\`, etc.); the mixed grids \`1/8+1/8T\`/\`1/16+1/16T\` are enum-only.

\`+=\` compounds on repeated calls; \`=\` is idempotent. \`*=\`/\`/=\` scale the current value (\`timing *=\` scales absolute note position). Use update-clip with only transforms to modify existing notes.
Transforms modify notes in place — previous transforms are already baked in, so don't re-apply earlier ones.
MIDI params ignored for audio clips, vice versa.
Across a batch (update-clip \`ids\` / duplicate copies / create-clip multiple slots or arrangement positions), \`clip.index\`/\`clip.count\` span the full batch — drive per-clip variation with \`clip.index\` arithmetic (\`pitch += clip.index * 12\`) or \`clipseq()\`; see Shape above.

### preTransforms (editing notes already in the clip)

\`preTransforms\` is *the* way to delete or change notes already in the clip. Pipeline: \`preTransforms → notes (merge) → transforms\`. It runs on the existing notes BEFORE any new \`notes\` merge — clear a whole bar (\`3|*: delete\`), a region (\`1|1-2|1: delete\`), a lane (\`C1: delete\`), everything (\`delete\`), or remap (\`C1: C4\`); the \`delete\` shorthand (alias \`v0\`) is preferred for clearing (\`velocity = 0\` is the longhand equivalent). Works with or without \`notes\`; ignored on audio clips. Same syntax as transforms. \`transforms\` then mutates the merged result — also the efficient way to *thin* density: generate with repeats/bar-copies in \`notes\`, then prune with a selector instead of scattering \`delete\`s. (A \`v0\` at an existing note's start also deletes it, but prefer \`preTransforms\`; reserve inline \`v0\` for notes built in the same \`notes\` string.)`;
