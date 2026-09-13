# ADR-0043: a `+` belongs to the tool that creates that kind of object

- **Status:** Accepted
- **Date logged:** 2026-09-13
- **Amends:** [ADR-0025](0025-object-path-grammar.md),
  [ADR-0038](0038-l-equals-names-the-lane-l-plus-made.md)

## Context

`l+` was cut before release on the rule that a `+` is a **root** — `t+`, `rt+`,
`s+` — taken only by a create tool. `l+` was neither a root nor a create tool's,
so it went, leaving `l<n>` on the clip tools as the only way to get a lane: name
an index, and the clip tools fill in the lanes up to it.

That left a lane as the one object with no tool of its own. It could only be
made as a side effect of writing a clip, only named through the deprecated
`takeLaneName`, and appending one meant reading the track first to find out how
many it already had.

## Decision

The rule is about **which tool**, not about where in the path the `+` sits: a
`+` is accepted only by the tool responsible for creating that kind of object.
Create tools make standalone objects and take the `+` roots. A take lane is an
aspect of its track — it can't exist apart from one, and Live gives it a name
and nothing else — so `ppal-update-track` grows one, and `t2/l+` is its
spelling. Each `l+` in the list appends its own lane.

A clip tool given `l+` is refused, naming `ppal-update-track`. That is unchanged
behavior with a better message: a clip goes on a lane that exists, and `l<n>`
already says which.

Since the lanes are a track's now, the whole call is refused when its entries
would put a track over the cap. A lane can't be deleted, so a list that made
some and then hit the cap would strand them.

## Rejected alternatives

- **Keep "a `+` is a root".** Simple to state and it made a take lane the only
  object a caller couldn't add, name, or address on its own.
- **`ppal-create-track` creates lanes.** A create tool's result is a new
  standalone object, and a lane isn't one: the track already exists, and
  `create-track` would then need to tell "make a track" from "make a lane on
  this one" out of one `path` list.
- **A `takeLane` param on update-track instead.** An index param beside the path
  grammar, for the one object the grammar can already spell. It would also have
  to answer what `0` means, which is the off-by-one the deprecated `takeLane`
  param exists to retire.
