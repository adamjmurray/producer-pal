# Principles

1. Addressing: All Live API objects can be referred to by `path` or by `id`,
   except leaf objects the tools model as properties of their container (see
   Efficiency), which are named within their container by `id` or `name`. An
   object being created doesn't have an `id` yet, so it can only be referenced
   by `path`. Results report both `path` and `id`, but `path` should be omitted
   to save tokens when it is unambiguous from the containing structure. Paths
   also address positions within objects.

2. Multi-operation: Every tool that could possibly operate on multiple objects
   supports it by allowing a single value or a comma-separated list in any
   relevant args, which are always named in the singular. Lists pair 1:1 with
   their targets, so all lists must be the same length. Single values are
   allowed with lists and apply to all. A call that named N targets returns N
   entries in the order they were named, and a target that couldn't be done gets
   an entry saying so rather than being dropped. A single target returns its
   entry unwrapped: small models are steered away from multi-operation, and an
   array where they asked for one object is a point of confusion.

3. Relocation: Any object that can exist at different paths always supports
   moving and duplicating to a different location. When the API does not support
   duplicating or moving, a new object is created in the target location with
   the result entry reporting anything that could not be recreated exactly. When
   the API does not directly support moving, it is done by duplicating and
   deleting. When the API does not support deleting, an empty disabled object is
   left behind with an explanation in the result entry.

4. Partial completion: A call that can do part of what was asked does what it
   can and skips the rest, rather than refusing the whole. Skips are reported in
   the result. A call that can't do anything, can't be interpreted
   unambiguously, or can't be partially done without cleanup throws an error
   before it starts, having changed nothing.

5. Observability: A result says what the call changed. Every property the call
   tries to change is reported with the new value from the actual object, so a
   value the API snapped, clamped, rounded, or silently refused is visible with
   a reason when it's not self-explanatory. Properties the call didn't touch are
   not returned to save tokens, with two exceptions. State that governs what the
   operation just did is reported even when the call didn't set it, because the
   caller may never have read it. And a property the API moved on its own is
   reported with the value read back, because nothing else would reveal it.

6. Warnings: A warning is only for what no result can carry: a whole-call arg
   that couldn't be applied, an effect on objects the caller didn't name (such
   as changing another object's path), a deprecated arg spelling. Anything about
   a target belongs in that target's result, not a warning.

7. Destruction: An operation that would destroy something the caller didn't name
   is skipped, and its entry points to the `force` arg that performs it anyway.

8. Vocabulary: Everything a tool returns (results, errors, and warnings) uses
   only names the caller could have written: the tool and param names the schema
   published, and the spellings the call supplied. Internal function names and
   internal field names must never appear. Every object it names is named by
   both `path` and `id`, or by `path` alone where there is no id.

9. Spelling: When more than one path refers to the same object, the result uses
   the input spelling. When the call had no path, or one that won't keep
   referring to the same object or position (`l+`, a locator), the result uses
   the spelling that stays valid longest.

10. Efficiency: Cover the Live API with as few tools, as few Live API calls, and
    as few tokens as the other principles allow. A leaf object that is really a
    property of its container is modeled as one, not as an object with a path: a
    device parameter belongs to a device and carries only `id`, `name`, `value`,
    and metadata. Validation that needs to read from the API happens at the
    item, inside the loop, not up front, except when a partial failure would
    result in cleanup (e.g. when duplicating a list of objects).

---

IMPORTANT: Never edit without a human's approval. These principles capture the
intended future state, not how things work today. Editing a principle to match
the current code silently retires a goal.
