# Reusing LiveAPI Objects

Building a LiveAPI object is expensive (ADR-0023), so it is tempting to resolve
one once and pass it around. That is safe in some places and unsafe in others,
and the line between them is not where most people would guess.

## The hazard

A LiveAPI object built from a path is pointed at that path. Mutate the Live Set
so a different object now sits there — create a clip in an empty slot, delete a
device, insert a chain — and it is an open question whether the object you are
still holding reports the new occupant or the old one.

**We have not measured this against real Live.** Everything the codebase asserts
about it comes from the unit-test mock, which cannot answer the question:
`createGetMock` in `src/test/mocks/mock-registry.ts` closes over the property
bag captured at registration, so a held mock object is stale _by construction_.
A test simulates a mutation by re-registering, which builds a new `get` the held
object never sees.

That makes the mock wrong in both directions:

- A test that re-registers is **stricter** than Live may be, so a correct
  refactor can fail.
- A test that doesn't re-register can't model the mutation at all, so an
  **incorrect** refactor passes green.

Which one you get is an accident of how each test was written. Do not read a
green unit suite as evidence that a reuse refactor is correct.

ADR-0028's rejection of path memoization ("breaks 8 files") is mock evidence.
Its decision is safe either way, but it is not proof of how Live behaves.

## The rule

Reuse is safe when nothing can change what the target names between the two
uses. In practice:

- **Safe:** building _fewer_ objects. Not constructing something you never read
  extends no lifetime and cannot go stale. `getChildCount` / `getChildAt` /
  `someChild` instead of `getChildren(...)`, or skipping a walk whose result is
  discarded, are always safe.
- **Safe:** the six `STABLE_TARGETS` in `live-api-adapter/live-api-build.ts`.
  Each names one object for the life of the Live Set.
- **Needs review:** holding an object across a read-only stretch. Sound unless
  the user edits the Set mid-request, which no request can rule out.
- **Unsafe until measured:** holding an object across a mutation — a `.call()`
  that writes, a `.set()` / `setProperty`, or any tool operation on another
  target in the same batch. This is the whole defect class.

Nothing may outlive the request either way; see `live-api-release.ts`.

## Reviewing for it

Look for a `LiveAPI` reference that is **live across a mutation**, not for reuse
in general:

1. Find where a `LiveAPI` variable is assigned, then used again later in the
   same function or passed down.
2. Ask what happens in between. A `.call()` with a writing method, a `.set()` or
   `setProperty`, or a loop iteration that writes another target all count.
3. Ask whether the second use reads something the mutation could have changed —
   `id`, `exists()`, a child list, or a property of the object at that path.

All three true is a finding. Batch write tools are the highest-yield place to
look: they resolve shared context once and then write N targets through it.

A read tool that never writes is low risk. A tool that reads, writes, then reads
the same path again to check what happened is the exact shape that breaks.

## Settling it

The open question needs a probe that holds one object while mutating through
another inside a single V8 request. Nothing available can do that today:
`ppal-live-api` drives one instance, objects are released at request end so
nothing survives across MCP calls, and code execution is scoped to clip notes.

Until that probe exists, e2e (`e2e/mcp/`) is the only apparatus that runs
against real Live and can catch this at all.
