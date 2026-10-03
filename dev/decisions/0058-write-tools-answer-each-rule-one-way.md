# ADR-0058: Write tools answer each rule one way

- **Status:** Accepted
- **Date logged:** 2026-10-02
- **Related:** [ADR-0035](0035-malformed-calls-are-refused-up-front.md),
  [ADR-0042](0042-a-skipped-target-keeps-its-slot.md),
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

| Rule                                                   | Answer                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A target named twice                                   | **Last wins**, keyed by the resolved object, so two spellings of one object (`id` + `path`, `t0/inst` + `t0/d1`) are one target. Each earlier mention is skipped unwritten; its entry has a `detail` saying it was named again later, and no `ok`. Creating twice (`l+,l+`, `d+,d+`) is two targets. Device actions follow the same rule. |
| A superseded item in a nested list (sends, `params`)   | Same as a top-level target: `detail`, no `ok`, the shared wording.                                                                                                                                                                                                                                                                        |
| A destination written twice that destroys the earlier  | The earlier object's entry gets `deleted: true` and a `detail`, in session and arrangement alike.                                                                                                                                                                                                                                         |
| An entry in a target or destination list               | **Can't be parsed → refuse the whole call** before anything is written: the tool was called wrong. **Parses but can't be applied → skip that target** (`ok: false` + `detail`) and run the rest.                                                                                                                                          |
| Live fails partway through                             | That target gets an `ok: false` entry saying what already changed; earlier targets keep their entries and later ones still run.                                                                                                                                                                                                           |
| `count` with a destination list                        | Refused up front. `capture` with `count` on create-scene too.                                                                                                                                                                                                                                                                             |
| A lone target that is skipped                          | The call throws that target's `detail`.                                                                                                                                                                                                                                                                                                   |
| A whole-call "ignored" warning                         | One wording: `X ignored: reason`.                                                                                                                                                                                                                                                                                                         |
| A step that can't be undone, before one that can fail  | Check what can be checked first, and refuse both if the later step would fail. update-clip checks the move (destination, clip type) before shortening the clip, since a cut tail can't be restored.                                                                                                                                       |
| A write that shifts other objects' paths               | No per-call warning. The tool description says once that inserting, deleting or duplicating shifts later siblings, and that result paths are the addresses from before the call.                                                                                                                                                          |
| A list field inside a result (playback `clips`, sends) | Stays an array for one item. Unwrapping a single target applies to the tool's whole result, not to a field in it.                                                                                                                                                                                                                         |

### Tools that don't match yet (as of 2026-10-02)

- **Named twice:** update-track, update-scene, update-device (targets and
  actions), take lanes on update-track. Nested sends and `params` give
  `ok: false` and params use their own wording.
- **Destroyed earlier object:** create-clip at the same arrangement spot twice;
  duplicate to the same session slot twice.
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
- **Refuse just the target with an unparseable entry.** A typo means the call
  was written wrong; running the rest guesses at what was meant, and a retry of
  the whole call costs nothing because nothing ran.

## Consequences

- The conformance suite tests these answers for every write tool; its skips are
  the list above.
- Changing one of these answers is a rule change: update this ADR and every tool
  at once.
