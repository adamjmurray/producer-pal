# ADR-0058: Write tools answer each rule one way

- **Status:** Accepted
- **Date logged:** 2026-10-02
- **Amends:** [ADR-0035](0035-malformed-calls-are-refused-up-front.md) (retires
  rule 1's third bullet), [ADR-0051](0051-a-write-that-did-nothing-says-so.md)
  and [ADR-0047](0047-an-arrangement-write-overwrites-and-says-so.md) (a target
  a later one replaces is no longer `deleted: true`)
- **Related:** [ADR-0042](0042-a-skipped-target-keeps-its-slot.md),
  [ADR-0047](0047-an-arrangement-write-overwrites-and-says-so.md),
  [ADR-0051](0051-a-write-that-did-nothing-says-so.md)

## Context

Each write tool applied the tool-design rules its own way, so a fix landed one
tool at a time and the tools drifted apart. One rule flipped from "refuse" to
"last wins" in 13 hours because the answer was decided inside a single tool's
fix. Before moving every write tool onto one shared pipeline, each rule needs
one answer.

## Decision

Every write tool gives these answers. The pipeline enforces them; a tool that
can't use it extends the pipeline rather than writing its own copy.

- **A target named twice → last wins**, keyed by the resolved object, so two
  spellings of one object (`id` + `path`, `t0/inst` + `t0/d1`) are one target.
  Each earlier mention is skipped unwritten; its entry has a `detail` saying it
  was named again later, and no `ok`. Creating twice (`l+,l+`, `d+,d+`) is two
  targets. Device actions follow the same rule.
- **A superseded item in a nested list** (sends, `params`) is answered like a
  top-level target: `detail`, no `ok`, the shared wording.
- **A later target that replaces an earlier one** (same slot, same arrangement
  spot, or fully covering it): the earlier one is skipped unwritten, with
  `detail: "overwritten later in this call by <later>"` and no `ok`. If the
  clash only shows while writing, the entry gets the same `detail`. A partial
  cover reads `shortened by <later> later in this call`. The later entry reports
  only what it really overwrote (ADR-0047), so a target skipped unwritten isn't
  named there. `deleted: true` is only for objects the caller asked to delete.
- **An entry in a target or destination list:** one that can't be parsed refuses
  the whole call before anything is written, since the tool was called wrong.
  One that parses but can't be applied skips that target (`ok: false` +
  `detail`) and the rest run. This holds in every tool: a missing duplicate
  source is a skip too.
- **Live fails partway through:** that target gets an `ok: false` entry saying
  what already changed; earlier targets keep their entries and later ones still
  run.
- **`count` with a destination list** is refused up front, as is `capture` with
  `count` on create-scene.
- **A lone target that is skipped:** the call throws that target's `detail`.
- **A whole-call "ignored" warning** has one wording: `X ignored: reason`.
- **A step that can't be undone, before one that can fail:** check what can be
  checked first, and refuse both if the later step would fail. update-clip
  checks the move (destination, clip type) before shortening the clip, since a
  cut tail can't be restored.
- **A write that shifts other objects' paths** gets no per-call warning. The
  tool description says once that inserting, deleting or duplicating shifts
  later siblings. A deleted object's result path is its address from before the
  call; every other entry names the object where it is after the call.
- **A list field inside a result** (playback `clips`, sends) stays an array for
  one item. Unwrapping a single target applies to the tool's whole result, not
  to a field in it.

### Tools that don't match yet (as of 2026-10-02)

- **Named twice:** update-track, update-scene, update-device (targets and
  actions), take lanes on update-track. Nested sends and `params` give
  `ok: false` and params use their own wording.
- **Replaced earlier target:** update-clip's buried clips and duplicate's
  covered copies are written, then marked `deleted: true`; create-clip at the
  same arrangement spot twice reports an id that's gone; duplicate to the same
  session slot twice says nothing on the earlier entry; update-clip and
  create-clip mark a named-again entry `ok: false`.
- **Missing source:** duplicate refuses the whole call.
- **Unparseable entry:** update-clip and update-device skip only that target.
- **Partway failure:** create-track and create-scene throw and leave earlier
  work with no entries.
- **`count`:** duplicate warns and ignores it for tracks to take lanes and
  scenes to several arrangement positions; create-scene ignores it with
  `capture`.
- **Warning wording:** about 15 hand-written warnings use `—` or other forms.
- **Check before an irreversible step:** update-clip shortens before checking
  the move.
- **Path shifts:** create-track and duplicate's descriptions don't say it.

## Alternatives rejected

- **First wins for a target named twice.** It was the update-clip answer for a
  while. A caller correcting itself writes the fix last, and pairing lists means
  the later value is the one meant.
- **Warn on every path shift.** Nearly every insert and delete shifts something,
  so the warning repeats on most calls and costs context for a behavior a model
  learns once from the description.
- **Delete a group track's members and report them.** Losing tracks the caller
  didn't name is surprising, so it follows the Destruction rule (skip, offer
  `force`) instead. Tracked separately.
- **Refuse the whole call for a problem checkable up front in a tool whose work
  can't be repeated** (ADR-0035's old rule, used only by duplicate). It assumed
  copies already made need cleanup before a retry. Since every target has its
  own entry (ADR-0042), the caller keeps what landed and retries the rest.
- **Write the earlier target, then mark it `deleted: true`.** The caller never
  asked for a delete, and the write was wasted. Planning the call first sees
  most clashes before anything is written.
- **Refuse just the target with an unparseable entry.** A typo means the call
  was written wrong; running the rest guesses at what was meant, and a retry of
  the whole call costs nothing because nothing ran.

## Consequences

- The conformance suite tests these answers for every write tool; its skips are
  the list above.
- Changing one of these answers is a rule change: update this ADR and every tool
  at once.
