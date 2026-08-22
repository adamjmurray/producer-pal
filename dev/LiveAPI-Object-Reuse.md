# Reusing LiveAPI Objects

Building a LiveAPI object is expensive (ADR-0023, and
`dev/LiveAPI-Performance.md` for what it costs), so it is tempting to resolve
one once and pass it around. That is safe in some places and unsafe in others,
and the line between them is not where most people would guess.

## The hazard

A LiveAPI object is pointed at a path. Mutate the Live Set so a different object
now sits there — create a clip in an empty slot, delete a device, insert a chain
— and what you are still holding may not be what you think.

**An id target is not exempt.** At mode 0 an id resolves to a path once and
follows that path afterward, so an object built from `id N` is exposed the same
way one built from `live_set tracks 2 clip_slots 3 clip` is. See the comment at
the top of `live-api-adapter/live-api-build.ts`. "It came from an id" is not a
reason to skip the check below.

### What is measured

One case, on Live 12.4.3: **an object whose target is deleted goes stale rather
than noticing.** It keeps reporting its old id and path; a fresh lookup of the
dead id lands nowhere and reads id `"0"`. `confirmDeleted` in
`tools/actions/delete/delete.ts` depends on exactly that difference, and e2e
covers it.

So the held object does not track reality. That is the answer for a destroyed
target.

### What is not

Whether a held object follows an **index shift** (delete `devices 2`, and does
the object at `devices 3` now read the device that slid down?) and whether it
sees a **path filled after the fact** (resolve an empty slot, create a clip in
it, then read) are both open. Treat them as unknown.

The unit-test mock cannot settle either: `createGetMock` in
`src/test/mocks/mock-registry.ts` closes over the property bag captured at
registration, so a held mock object is stale _by construction_. A test simulates
a mutation by re-registering, which builds a new `get` the held object never
sees. That makes the mock wrong in both directions — a test that re-registers is
**stricter** than Live may be, and a test that doesn't re-register can't model
the mutation at all, so an **incorrect** refactor passes green. Which one you
get is an accident of how each test was written.

Do not read a green unit suite as evidence that a reuse refactor is correct.
ADR-0028's rejection of path memoization ("breaks 8 files") is mock evidence
too. Its decision is safe either way, but it is not proof of how Live behaves.

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
   same function or passed down. Id-built counts; see above.
2. Ask what happens in between. A `.call()` with a writing method, a `.set()` or
   `setProperty`, or a loop iteration that writes another target all count.
3. Ask whether the second use reads something the mutation could have changed —
   `id`, `path`, `exists()`, a child list, or a property at that path.

Deleting or inserting siblings is the sharpest case, because it moves every
later index. `delete` handles this by sorting tracks, scenes, and devices
highest-index-first before the loop; anything that mutates a collection while
holding objects from it needs an equivalent, or an argument for why it doesn't.

All three true is a finding. Batch write tools are the highest-yield place to
look: they resolve shared context once and then write N targets through it.

A read tool that never writes is low risk. A tool that reads, writes, then reads
the same path again to check what happened is the exact shape that breaks.

## Settling it

What is left open needs a probe that holds one object while mutating through
another inside a single V8 request. Nothing available can do that today:
`ppal-live-api` drives one instance, objects are released at request end so
nothing survives across MCP calls, and code execution is scoped to clip notes.

Until that probe exists, e2e (`e2e/mcp/`) is the only apparatus that runs
against real Live and can catch this at all — and it can settle a specific site
without settling the general question. A test that deletes three clips in one
call and checks the right three died answers that site for good, whatever the
underlying mechanism turns out to be.
