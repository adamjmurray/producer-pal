# Principles

1. Addressing: All objects can be referred to by `path` or by `id`. An object
   being created doesn't have an `id` yet, so it can only be referenced by
   `path`. Results report both `path` and `id`, but `path` should be omitted to
   save tokens when it is unambiguous from the containing structure. Paths also
   address positions within objects. When multiple path strings can resolve to
   the same object, the result uses the same spelling as the input.

2. Relocation: Any object that can exist at different paths always supports
   moving and duplicating to a different location. When the API does not support
   duplicating or moving, a new object is created in the target location with
   warnings about anything that could not be recreated exactly. When the API
   does not directly support moving, it is done by duplicating and deleting.
   When the API does not support deleting, an empty disabled object is left
   behind with a warning.

3. Multi-operation: Every tool that could possibly operate on multiple objects
   supports it by allowing a single value or a comma-separated list in any
   relevant args, which are always named in the singular. Lists pair 1:1 with
   their targets, so all lists must be the same length. Single values are
   allowed with lists and apply to all.

4. Errors and warnings: A call that can't do anything, can't be interpreted
   unambiguously, or can't be partially done without cleanup throws an error
   before it starts. A call that can do part of what was asked does what it can,
   skips the rest, and warns about what was skipped. Every error and warning
   names its object by both path and id, or by path alone where there is no id.
   An operation that changes other objects' paths says so via warning.

5. Destruction: An operation that would destroy something the caller didn't name
   is skipped with a warning pointing to the `force` arg that performs it
   anyway.

---

IMPORTANT: Never edit without a human's approval. These principles capture the
intended future state, not how things work today. Editing a principle to match
the current code silently retires a goal.
