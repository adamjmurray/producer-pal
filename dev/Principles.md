# First Principles for Tool Design

These principles govern the interface and behavior of every Producer Pal tool.
They stay high-level on purpose: secondary rules and implementation requirements
should follow from them unambiguously, without being spelled out here.

1. Addressing: All Live API objects can be referred to by `path` or by `id`,
   except a leaf object that is really a property of its container. That one is
   modeled as a property, not as an object with a path: it is named within its
   container by `id` or `name`, and carries only what names it and what the call
   is about — a device parameter belongs to a device. A new object has no `id`
   yet. Paths also address positions within objects. Results, errors, and
   warnings report an object's `id`, and its `path` unless the nesting around it
   already gives it. A `path` or `id` a tool returns can be sent straight back
   as input and names the same object. A write to a position past the end of a
   container creates what's missing when the path alone determines what to
   create (a scene, a take lane, a rack chain); creation is capped and the
   result entry reports what was created. When the path leaves a choice open (a
   track's type), the call refuses and the error names the tool that creates it.

2. Multi-target: Every tool that could possibly operate on multiple objects
   supports it by allowing a single value or a comma-separated list in any
   relevant args, which are always named in the singular. Lists pair 1:1 with
   their targets, so all lists must be the same length. A single value applies
   to all of them, unless it fully determines a location — one place holds one
   object, so it must be named once per target rather than broadcast. An empty
   entry is refused rather than guessed at. A call that named N targets returns
   N entries in the order they were named. A single target returns its entry
   unwrapped: an array where they asked for one object confuses small models.

3. Relocation: Any object that can exist at different paths always supports
   moving and duplicating to a different location. Where the API lacks a move,
   duplicate and delete; where it lacks a duplicate, create anew and report in
   the result entry what couldn't be recreated exactly; where it lacks a delete,
   leave an empty disabled object and say so in the result entry.

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
   change, but do report when the arg and the value read back can't be compared
   at all. Properties the call didn't touch aren't returned, with two
   exceptions: state that governs what the call just did, because the caller may
   never have read it, and a property the API moved on its own, because nothing
   else reveals it. A read returns the least that answers what was asked; more
   detail is opt-in and named by the caller.

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
   the same object or position (a locator), the result uses the spelling that
   stays valid longest. Where the API reaches one object by more than one route,
   one is canonical and the rest only resolve on input. Canonical is the route
   that carries the most context: `pC1/c1` names the pad and the pitch that
   plays it; a bare `cN` names neither.

10. Efficiency: Cover the Live API with as few tools, as few Live API calls, and
    as few tokens as the other principles allow.

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
