N# Reusing LiveAPI Objects

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

All of the below on Live 12.4.3, with the probe in "Settling it". The short
version: **a held object tracks its object, not its index — and when that object
dies the handle half-notices.**

| What happened to the target                                  | The held object afterwards                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **An earlier sibling was deleted**, shifting indices         | Follows the object. Its `path` is rewritten to the new index and every property still reads the same object.        |
| **It was deleted**                                           | `path` clears to `""`, but `id` and `exists()` stay stale. Property reads return nothing.                           |
| **It never existed** (empty slot, then a clip created there) | Never bound. `path` `""` and id `"0"` from the start, and it stays that way — it does not pick up the new occupant. |

Two consequences worth keeping straight.

**Index shift is safe.** Deleting `scenes 8` while holding `scenes 9` leaves the
held object reading the same scene, with its path rewritten to `scenes 8`. It
does not slide onto whatever now occupies the old index. Measured on both scenes
and arrangement clips. This is the opposite of the obvious fear, and it is why
`delete` sorting highest-index-first matters for the _arguments_ it passes, not
for objects it holds.

**A dead target disagrees with itself.** `path` tells the truth and `id` lies,
so `exists()` — which is derived from the id — reports `true` for a clip that is
gone. `confirmDeleted` in `tools/actions/delete/delete.ts` depends on a fresh
lookup of the dead id reading `"0"`, which still holds. Do not substitute
`exists()` on a held object for it.

**An id-built object is not different.** Built from `id N`, an object resolves
to a path immediately and then behaves exactly like a path-built one in every
case above — including clearing its path on delete while keeping the stale id.

### What is not

The cases above cover session clips, arrangement clips and scenes. Devices and
rack chains were not measured, and neither was the user editing the Set from the
UI mid-request. Nothing suggests they differ, but they are inference, not
measurement.

The unit-test mock settles none of it: `createGetMock` in
`src/test/mocks/mock-registry.ts` closes over the property bag captured at
registration, so a held mock object is stale _by construction_. A test simulates
a mutation by re-registering, which builds a new `get` the held object never
sees. That makes the mock wrong in both directions — a test that re-registers is
**stricter** than Live may be, and a test that doesn't re-register can't model
the mutation at all, so an **incorrect** refactor passes green. Which one you
get is an accident of how each test was written.

Do not read a green unit suite as evidence that a reuse refactor is correct. The
memo's own design — only the five stable targets, nothing indexed — was argued
from the same mock ("memoizing any path breaks 8 test files"). That decision is
safe either way, but the evidence for it was never proof of how Live behaves.
The header comment of `live-api-adapter/live-api-build.ts` carries the
reasoning.

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
- **Safe:** holding an object across a mutation that only shifts indices —
  inserting or deleting a sibling. The object follows its target and rewrites
  its own path. Measured; see above.
- **Unsafe:** holding an object across a mutation that can **destroy or fill**
  its target, then trusting `id` or `exists()`. Both go stale. Re-look-up the
  target instead, and compare — which is what the tools that get this right
  already do.
- **Unsafe:** resolving a path that is empty and expecting the object to notice
  when something lands there. It never binds. Build it after the write.

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
another inside a single V8 request. `ppal-live-api` can do that in a build made
with `ENABLE_OBJECT_PROBE=true`: each operation takes an optional `path` that
runs it against its own object, leaving the object built from the call's
top-level `path` where it is.

```bash
ENABLE_OBJECT_PROBE=true npm run build:debug
```

```jsonc
{
  "path": "live_set tracks 0 clip_slots 0 clip", // held throughout
  "operations": [
    { "type": "exists" }, // read it
    {
      "path": "live_set tracks 0 clip_slots 0",
      "type": "call",
      "method": "create_clip",
      "args": [4],
    }, // mutate elsewhere
    { "type": "exists" }, // read it again
    { "type": "get_property", "property": "id" },
  ],
}
```

`goto` cannot substitute: it moves the only object there is, so the original
target becomes unreachable. Naming the path again builds a _fresh_ object, which
is the control to compare against, not the held handle under test.

Two things to keep in mind while measuring. A path-less operation always means
the default object, wherever it sits in the list. And each operation carrying a
path gets its own object — two operations naming the same path are two objects,
which is what makes the fresh-lookup control available.

The field is absent from every other build, so nothing here changes what users
see. Unit tests cannot stand in for the probe: the mock's `LiveAPI.from` builds
a fresh instance with no memo and no pool, which is the blindness described
above.

e2e (`e2e/mcp/`) remains the way to settle a _specific site_ without settling
the general question. A test that deletes three clips in one call and checks the
right three died answers that site for good, whatever the underlying mechanism
turns out to be.
