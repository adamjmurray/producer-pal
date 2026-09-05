# First Principles for Tool Design

These principles govern the interface and behavior of every Producer Pal tool.
They stay high-level on purpose: secondary rules and implementation requirements
should follow from them unambiguously, without being spelled out here.

1. Addressing: All Live API objects can be referred to by `path` or by `id`,
   except leaf objects the tools model as properties of their container (see
   Efficiency), which are named within their container by `id` or `name`. An
   object being created doesn't have an `id` yet, so it can only be referenced
   by `path`. Paths also address positions within objects. Results, errors, and
   warnings report an object's `id` explicitly, and its `path` explicitly unless
   the nesting around it already gives it, where it's omitted to save tokens.
   Anything with no `id` is named by `path` alone. A `path` or `id` a tool
   returns can be sent straight back as input and names the same object.

2. Multi-target: Every tool that could possibly operate on multiple objects
   supports it by allowing a single value or a comma-separated list in any
   relevant args, which are always named in the singular. Lists pair 1:1 with
   their targets, so all lists must be the same length. A value that fully
   determines a location pairs 1:1 with the targets; any other single value
   applies to all of them. Broadcasting a value that pins one place would
   overwrite all but the last. Lists contain values, not placeholders: an empty
   entry is refused rather than guessed at, because dropping it shifts every
   later pairing and keeping it names nothing. A call that named N targets
   returns N entries in the order they were named. A single target returns its
   entry unwrapped: an array where they asked for one object confuses small
   models.

3. Relocation: Any object that can exist at different paths always supports
   moving and duplicating to a different location. When the API does not support
   duplicating or moving, a new object is created in the new location with the
   result entry reporting anything that could not be recreated exactly. When the
   API does not directly support moving, it is done by duplicating and deleting.
   When the API does not support deleting, an empty disabled object is left
   behind with an explanation in the result entry.

4. Partial completion: A call that can do part of what was asked does what it
   can and skips the rest, rather than refusing the whole. Skips are reported in
   the result entry. A call that can't do anything, can't be interpreted
   unambiguously, or can't be partially done without cleanup throws an error
   before it starts, having changed nothing. Validation that needs to read from
   the API happens at each target, as it is reached — except when a partial
   failure would need cleanup, where the whole list is checked before anything
   runs.

5. Observability: On a write, don't report an arg that took effect as intended.
   Report a value the API changed, reading it back off the object, with a reason
   when it's not self-explanatory. Don't count small rounding errors as a
   change. Report when the arg and the value read back aren't comparable.
   Properties the call didn't touch aren't returned, with two exceptions: state
   that governs what the call just did, because the caller may never have read
   it, and a property the API moved on its own, because nothing else reveals it.
   A read returns the least that answers what was asked; more detail is opt-in
   and named by the caller.

6. Warnings: A warning is only for what no result can carry: a whole-call arg
   that couldn't be applied at all, an effect on objects the caller didn't name
   (such as changing another object's path), and a call that worked but was
   written a way the tools tolerate without teaching — the result carries the
   outcome, not the lesson. Anything about a target belongs in that target's
   result entry, not a warning.

7. Destruction: An operation that would destroy something the caller didn't ask
   for and wouldn't expect is skipped, and its entry points to the `force` arg
   that performs it anyway. The test is surprise, not damage: writing into an
   arrangement range overwrites what was there, which follows from the request,
   so it happens silently. `force` is offered only where the destruction is the
   only way to do what was asked; where a non-destructive way exists, the tool
   takes it and never asks.

8. Vocabulary: Everything a tool returns (results, errors, and warnings) uses
   only names the caller could have written: the tool and param names the schema
   published, and the spellings the call supplied. Internal function names and
   internal field names must never appear. A caller depends only on what the
   tools publish — params, paths, ids, results, errors — never on how Live or
   the code represents them underneath.

9. Spelling: When more than one taught path refers to the same object, the
   result uses the input spelling. A spelling the tools tolerate but don't teach
   is answered with the taught one, so a result never re-teaches a spelling
   being retired. When the call had no path, or one that won't keep referring to
   the same object or position (`l+`, a locator), the result uses the spelling
   that stays valid longest.

10. Efficiency: Cover the Live API with as few tools, as few Live API calls, and
    as few tokens as the other principles allow. A leaf object that is really a
    property of its container is modeled as one, not as an object with a path: a
    device parameter belongs to a device and carries only what names it and what
    the call is about.

---

IMPORTANT: Never edit without a human's approval. These principles capture the
intended future state, not how things work today. Editing a principle to match
the current code silently retires a goal.

Keep this list to ten principles or fewer. A new rule that fits inside an
existing one goes there instead.

Don't cite a principle by number outside this file — not in code comments, ADRs,
or commit messages. Principles merge, split and get reworded, so a number goes
stale while the text around it still reads fine. State the idea; naming the
principle after a complete thought is fine.
