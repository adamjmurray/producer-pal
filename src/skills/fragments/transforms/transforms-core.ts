// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Tier 1 of the transforms fragments, plus two things that hang off it: the
// update-clip-only params (`transformsEditing`) and the small-model tier's whole
// transforms guide (`transformsBasic`). All three share a file the way the
// context pair and the bar|beat head/write pair do — they teach the same
// parameters at different depths or for different callers, and side by side is
// how they stay in sync when behavior changes.
//
// Tier 1 is everything a task needs to select notes and set a value on them.
// The tiers are cut by REQUEST FREQUENCY, not by conceptual complexity — so
// `where(...)` is here (it is how you say "delete the quiet notes", among the
// most common asks) even though it is a value test. Anything needing the note's
// current value, a function, or a waveform is tier 2/3
// (transforms-expressions / transforms-generative).
//
// This fragment owns the `## Transforms` heading; the other tiers and
// `transformsEditing` hang off it as `###` sections, so the standard driver's
// manifest order matters.
//
// Notation-neutral by construction: transforms are the same in every notation, so
// nothing here may claim what a `notes` string contains. Positions and note values
// are shared grammar (see time-and-values) and are fine to name; repeats, bar
// copies, and inline `v0` are bar|beat authoring syntax and belong in that head.
//
// The Shorthand and Expression bullets deliberately still NAME waveforms, math
// functions, and current values even though those live in tier 2/3. Trimming
// those mentions when the text moved cost a `drum-transforms` eval turn: with
// nothing pointing at `rand()`, "randomize the snare velocities" resolved to the
// `vA-B` shorthand instead. A tier may reference vocabulary it doesn't define —
// what must not leak across fragments is CONTENT, since that is what makes an
// include line's token cost a lie.
//
// Naming that vocabulary is fine; POINTING AT THE FRAGMENT that defines it is
// not. This tier can't require tier 2/3 (the edges run the other way and must
// stay acyclic), so a user who switches one off leaves any "see X" here aimed at
// nothing. State the rule and let the section speak for itself.
//
// The line naming is fine / CALLING is not, same as in transforms-generative:
// every worked example here must use an operation this fragment defines, or
// dropping a tier leaves a call to nothing behind. That covers the math
// functions as much as the note-count ops — the worked `where(abs(...))` this
// bullet used to carry lives in transforms-expressions, which defines abs. A
// test holds it.
export const transformsCore = `## Transforms

Add \`transforms\` parameter to create-clip, update-clip, or duplicate.

**Shape:** a single string, broadcast across every clip/copy. Multiple expressions: newline-separated. Per-clip variation: \`clip.index\` arithmetic or \`clipseq()\` inside the string (below). Structurally-distinct edits per clip → separate tool calls.

**Syntax:** \`[selector:] parameter operator expression\` (one per line)
- **Selector:** pitch and/or time filter, optionally a \`where(...)\` value test, followed by \`:\` - e.g., \`C3:\`, \`1|1-2|4:\`, \`C3 1|1-2|4:\`, \`1|1-2|4 C3:\`, \`where(note.velocity < 40):\`. **Per-line:** every selector (pitch, time, where) applies only to its own line — never carried to or inherited from neighbors; a line with no selector hits all notes. Repeat the selector to scope several lines
- **Pitch filter:** \`C3\` (single) or \`C3-C5\` (range) - omit for all pitches
- **Time filter:** \`1|1-2|4\` (bar|beat range, **ends inclusive**, matches note start time); bounds use the same bar|beat dialect as Time & Note Values positions (decimal or \`±n\` offset, e.g. \`1|1+n/12-2|1\`)
  - **Single point:** a bare bar|beat with no \`-\` (\`4|3.5:\`) targets only the note starting exactly there — e.g. \`Gb1 4|3.5: velocity = 120\` accents just that note
  - **Whole bars:** \`3|*\` = all of bar 3, \`1|*-3|*\` = bars 1-3 — half-open, so exactly those bars with no spill onto the next downbeat. Prefer this for "measure N"; \`3|1-4|1\` would also match a note on 4|1
  - **Exclusive end:** append \`-<\` to make only the end bound exclusive — \`3|1-<4|1\` = up to but not including 4|1 (for sub-bar half-open spans)
- **Value filter** \`where(...)\`: keep only notes whose properties satisfy a boolean test — \`where(note.velocity < 40): delete\` deletes quiet notes, \`where(note.velocity > 100): velocity += 20\` accents loud ones, \`where(note.probability < .5): delete\` thins. Build it from comparisons (\`> >= < <= == !=\`), booleans (\`&& || !\`), parens, arithmetic, and functions over note.velocity/deviation/duration/probability/pitch/start (\`note.duration\`/\`note.start\` in musical beats; RHS may be a number, note name, or \`n/8\`). Math functions work inside the test too. AND-combines with a pitch/time selector: \`C3-C5 where(note.velocity > 80): velocity += 20\`. Comparisons tolerate sub-beat float drift, so \`==\`/\`!=\` are safe even on float props (\`note.start == n/8\` matches a note that names that beat); still prefer \`<\`/\`>\` for ranges. Note properties only (no note.index/count/next); all functions except legato/seq (they need the selection); not on note-count ops
- **MIDI parameters:** velocity (<=0 deletes note, else capped at 127), pitch (0-127), timing (musical beats), duration (musical beats; <=0 deletes note), probability (0-1), deviation (-127 to 127)
- **Audio parameters:** gain (-70 to 24 dB), pitchShift (-48 to 48 semitones)
- **Operators:** \`+=\`, \`-=\` (add/subtract), \`*=\`, \`/=\` (scale current value), \`=\` (set)
- **Shorthand** (clears/simple sets): a single bar|beat-style token instead of \`param = value\` — \`delete\` (or \`v0\`) delete a note · \`vN\`/\`v±N\`/\`vA-B\` velocity (range = humanized random) · \`pN\`/\`p±N\` probability · \`n/4\`/\`Nbar\`/\`1bar+n/4\` duration · \`C4\` remap pitch (one per line; a selector still applies, e.g. \`C1: delete\`). \`delete\` is a transforms alias, not a \`notes\` token. Preferred for clearing/deleting; use the full \`param op expr\` form for computed changes (\`+=\`, \`*=\`, waveforms, ramps). Note \`vA-B\` is the one shorthand with no \`param = ...\` longhand — it sets velocity AND velocity_deviation together, so write it as the shorthand (\`velocity = vA-B\` errors)
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

\`+=\` compounds on repeated calls; \`=\` is idempotent. \`*=\`/\`/=\` scale the current value (\`timing *=\` scales absolute note position). Use update-clip with only transforms to modify existing notes.
Transforms modify notes in place — previous transforms are already baked in, so don't re-apply earlier ones.
MIDI params ignored for audio clips, vice versa.
Across a batch (update-clip \`ids\` / duplicate copies / create-clip multiple slots or arrangement positions), \`clip.index\`/\`clip.count\` span the full batch — drive per-clip variation with \`clip.index\` arithmetic (\`pitch += clip.index * 12\`) or \`clipseq()\`; see Shape above.`;

/**
 * Everything about changing a clip that already has notes in it. A SIBLING of
 * tier 1, not a fourth tier: the tiers are cut by how often a request needs
 * them, this one by which tool can accept it at all — `preTransforms` and
 * `quantizeGrid` appear in no other schema, so a create-clip or duplicate caller
 * was paying ~1.1k characters it could never use.
 *
 * The merge rule leads because it is the same gate and the same subject: only
 * update-clip merges (create-clip replaces the slot outright), and each notation
 * head used to state it separately — three copies, all shipping to read-only and
 * create-clip-only callers who have nothing to merge into and, without this
 * fragment, no definition of the `preTransforms` those copies pointed at.
 *
 * Notation-neutral like tier 1: merge keys on pitch+start in every notation, so
 * nothing here may name a notation's syntax for deleting inline.
 *
 * This is `transforms-basic` at standard depth — same gate, same subject — which
 * is the other reason that fragment has no `-standard` twin to be.
 */
export const transformsEditing = `### Editing Notes Already in a Clip (update-clip only)

\`notes\` MERGES into an existing clip — a new note overwrites the existing note at the *same* pitch+start (restate it with the length or velocity you want); every other note is untouched. So **don't rewrite the whole clip to change a few notes** — restate just those.

\`preTransforms\` is *the* way to delete or change notes already in the clip. Pipeline: \`preTransforms → notes (merge) → transforms\`. It runs on the existing notes BEFORE any new \`notes\` merge — clear a whole bar (\`3|*: delete\`), a region (\`1|1-2|1: delete\`), a lane (\`C1: delete\`), everything (\`delete\`), or remap (\`C1: C4\`); the \`delete\` shorthand (alias \`v0\`) is preferred for clearing (\`velocity = 0\` is the longhand equivalent). Prefer it over deleting inline in \`notes\`. Works with or without \`notes\`; ignored on audio clips. Same syntax as transforms. To *replace* a region rather than edit it in place, clear it first (\`preTransforms: "1|1-2|1: delete"\`) or the notes you didn't restate stay behind. \`transforms\` then mutates the merged result — also the efficient way to *thin* density: generate densely in \`notes\`, then prune with a selector instead of scattering \`delete\`s.

\`quantizeGrid\` uses Live's native grid enum (\`1/4\`,\`1/8\`,\`1/8T\`,\`1/16\`,\`1/16T\`,\`1/32\`) but also accepts the equivalent \`n/N\` note value (\`n/12\`=\`1/8T\`, \`n/24\`=\`1/16T\`, etc.); the mixed grids \`1/8+1/8T\`/\`1/16+1/16T\` are enum-only.`;

/**
 * The transforms fragment at basic (small-model) depth: the merge rule and
 * `preTransforms` clearing, nothing else. Small-model mode teaches no transforms
 * LANGUAGE — no selectors-as-syntax, no expressions, no generative functions —
 * so this is a short recipe for the one job that tier cannot do without: getting
 * rid of notes that are already there. It carries the merge rule for the same
 * reason `transformsEditing` does — the basic notation heads state it no longer,
 * and only update-clip merges.
 *
 * It is a fragment rather than driver prose because `preTransforms` is an
 * update-clip parameter and nothing else's (verified across the tool defs), so
 * its gate is exactly one tool. Inline in the driver it was ~12% of the
 * small-model document that a caller without update-clip paid for and could
 * never use — precisely backwards for the narrow-toolset workers gating exists
 * to serve.
 */
export const transformsBasic = `## Editing a clip that already has notes (update-clip)

\`notes\` MERGES into the clip: a note at the *same* pitch+start overwrites that note; every other note stays. So to add or change notes, pass just those — don't resend the whole clip.

\`preTransforms\` clears or edits notes already in the clip, before any new \`notes\` in the same call:
- \`v0\` — delete all notes
- \`[range]: v0\` — delete notes in a range
- ranges: \`C1\` (one pitch) · \`C1-C5\` (pitch range) · \`3|*\` (all of bar 3) · \`1|1-2|1\` (explicit span, end inclusive)

Ranges always use pitch names in Ableton's octaves (C3 = middle C = 60) and **bar|beat** positions counting from 1, whatever notation you write notes in.`;
