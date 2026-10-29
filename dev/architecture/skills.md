# Skills Assembly

How the Producer Pal Skills text is cut into fragments and what reaches each
caller. Part of the [Architecture](README.md) docs. Fragments live in
`src/skills/`; to try a carve without an eval run, see the skills snapshot in
[development-tools](../quality/development-tools/README.md).

## Fragments, drivers and gates

A **driver** (`standard` or `basic`, chosen by small-model mode) is only an
include manifest. The **fragments** it names are the task sections, plus one
**notation head** per notation (the note-format guide). `SKILL_SLOT_NAMES`
(`src/skills/skill-slots.ts`) lists the fragments a user can override; see
[user-content-overrides.md](user-content-overrides.md).

- **Gates** (`fragment-tool-gates.ts`): a fragment ships when at least one of
  its tools is enabled. Disabling a tool drops its guidance. Enabling one does
  not force a fragment in.
- **Gated by the remote script** (`remoteScriptGatedFragments`): `automation`,
  `automation-write` and `plugins-and-max-devices` ship only while a current
  remote script answers, on top of their tool gate. `ppal-connect` pings it
  (small-model mode skips the ping). See [remote-script.md](remote-script.md).
- **Gated by the user** (`newUser` in `BuildSkillsOptions`): when connect knows
  the user is not new, the built-in `context-standard` renders without its New
  user paragraph (`contextStandardKnownUser`). It stays inside the guide, not a
  fragment of its own: its position is load-bearing for onboarding evals.
  `ppal-connect` asks `isNewUser` (`helpers/connect/new-user.ts`) once; the
  result's `New user` marker and the paragraph share that answer. Only an
  explicit `false` drops it, so callers that can't tell (Skills preview, docs,
  scripts) keep it, and a user's own override is used as-is.
- **Requires** (`fragment-requires.ts`): fragments that are incomplete without
  another (the transforms tiers name functions whose grammar lives in
  `transforms-core`). A gate table entry must be a subset of the gate of what it
  requires, so gating never needs a transitive walk.

## A notation head may split off a `-write` sibling

A read-only caller never sees the authoring syntax. The bar|beat serializer only
emits `v/n/p` with positions, so repeat patterns, pattern brackets, bar copies
and `v0` are things only a writer can use. A head spins that part out into a
`-write` fragment gated on `NOTE_WRITE_TOOLS` (`ppal-create-clip`,
`ppal-update-clip`), a strict subset of the head's own gate.

- **The base name survives and keeps meaning "the format, minus what only a
  writer can use."** So the driver's `@include "./{notation}-standard.md"` line
  never changes, no slot is retired, no alias is needed, and users' overrides of
  the base never need migrating. Each notation opts in separately.
- A head with no authoring half (midi-json) registers an empty `-write` fragment
  so the notation-templated ref still resolves.
- The same direction split is applied to `devices` and `arrangement`. Direction
  (what the caller can do) and depth (`-standard` / `-basic`, what the model can
  take) are independent axes.

Rejected:

- **`-read` / `-write` symmetry.** It renames the base ref, which forces alias
  entries for every notation that is not split, plus a retired slot name, for
  nothing a user can see.
- **Trimming sentences inside a bullet.** Each cut is a judgment call with
  nothing to catch a mis-sort. The seam runs by whole bullet or section, and an
  ambiguous line stays on the read side, where both audiences get it.

When you move text across a split, a mention left behind is the usual
regression: vocabulary whose grammar went to the other half. Check the lines
that name both sides (the meter paragraph, the comma-list bullet) and rewrite
them rather than moving them. For the same reason, don't trim mentions inside
`transforms-core` casually — doing so cost an eval turn before.

If a user does hold an override of a split base head, their copy of the
authoring sections ships beside the built-in write fragment. The only signal is
the editor's "default changed since you forked" badge.
