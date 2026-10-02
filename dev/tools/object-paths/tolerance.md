# Tolerance

What a path param accepts beyond the documented spellings. Part of
[Object Paths](README.md).

Four tiers, in order of preference.

1. **Hidden params.** `slot`, `slots`, `toSlot`, `devicePath`, `takeLane` are
   deprecated — accepted, warned, going away, and so is every param a single
   spelling replaced. `startLocator`, `loopStartLocator`, `loopEndLocator` and
   `duplicate`'s `locator` fold into the position they belonged to, as
   `loc:<what the caller sent>`. So does every index param the path replaced:
   `trackType` and `trackIndex` on `read-track` and `select`, `sceneIndex` on
   `read-scene`, `select` and `create-scene`, and `trackIndex` on
   `create-track`. `create-track`'s `type: "return"` goes the same way, trimmed
   out of the published enum but still accepted — `rt+` asks for one now. So
   does `count` on `create-track` and `create-scene`: a repeated path entry says
   the same thing and can name a different place per object. `arrangementStart`
   on `create-clip`, `update-clip` and `duplicate` joins them once the
   coordinate ships — a deprecation with a long runway, not a permanent alias:
   it is a name we coined, so a model that never reads it in the Skills has no
   reason to emit it, and the runway is for people scripting Live. `trackIndex`
   and `sceneIndex` on the _clip_ tools are permanent aliases, not part of that
   migration: models reach for them unprompted, and catching the guess beats a
   round trip. See
   [hidden-param.ts](../../../src/tools/shared/tool-framework/hidden-param.ts).
2. **Tolerant values.** `"0/3"` is honored as `t0/s3` with a warning — it is
   what results said before 2.2.0, so it is a well-founded guess, not a typo. A
   bare `"0"` is honored only where the tool has exactly one legal
   single-segment shape (`create-clip` → `t0`; `read-clip` needs a scene, so it
   errors).
3. **Surplus segments narrow.** A path carrying more than the action needs is
   narrowed rather than refused: `ppal-playback`'s `play-scene` reads `t0/s1` as
   scene 1, because launching a scene fires every track and the track is spare.
   Silently — the caller already named the scene, so there's nothing to report.
   Only surplus bends. A path _missing_ what the action needs errors, even where
   the reverse recovery looks symmetric: `play-session-clips` with `s3` is
   refused, since firing clips one at a time is a different Live call than
   launching the scene.
4. **Never pick one.** Honoring one param and dropping the other is the silent
   wrong-target bug this grammar exists to prevent. What to do instead depends
   on what the param names:
   - **A source — throw.** Where the call acts on one target (`playback`'s
     `play-scene`), two params naming different things has no answer, so it
     errors. Naming the same target twice over is not a conflict: `play-scene`
     with `t0/s1,t2/s1` fires scene 1.
   - **A set — union.** Where the call already acts on a list (`delete`,
     `duplicate`, `update-clip`, `update-track`, `update-scene`,
     `update-device`, the four read tools, `playback`'s clip actions), `id` and
     `path` both name members of it, so the targets combine. `delete` and
     `playback` also collapse duplicates, keeping the last, because firing or
     deleting an object twice is a different Live call than doing it once. The
     update tools don't: writing the same value twice lands the same way, and a
     slot per entry is what keeps a paired `name` or `color` list aligned.
     Neither does `duplicate` — a source named twice is two copies — nor the
     reads, whose entry per target is what lines the results up with the call.
