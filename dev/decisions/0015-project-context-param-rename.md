# ADR-0015: Rename the project-context device parameter in 2.1.0

- **Status:** Accepted
- **Date logged:** 2026-07-29

## Context

Project context is stored in a Max for Live parameter — a hidden blob `textedit`
in `tab-context.maxpat` — which is why it travels with the `.als` rather than
living in `~/.producer-pal`. The "memory" → "context" rename went through all
the TypeScript, but the parameter's identity in the patch was still
`memoryContent`, along with the message and send names it feeds. Leaving that
would make the patch — the least greppable part of the codebase, since the
`.amxd` is binary — permanently contradict every other name in the project.

Renaming a saved M4L parameter is normally breaking: a value Live stored under
the old name has nothing to bind to in the new device. Two facts make 2.1.0 the
exception:

- **Project context doesn't survive a device upgrade today.** A replaced `.amxd`
  comes up empty. That's the problem 2.1.0 fixes with an on-disk sidecar beside
  the Set.
- **That fix can't help the upgrade _into_ 2.1.0.** No earlier version wrote a
  sidecar, so there's nothing to restore from. Everyone arriving at 2.1.0 loses
  their in-device project context and copies it by hand, rename or no rename.

## Decision

Do the rename now, along with the patch's message and send names. Document the
one-time manual copy in `docs/installation/upgrading.md` and the release notes.

## Alternatives rejected

- **Keep `memoryContent` indefinitely** — costs nothing to change now and can
  only get more expensive. A misleading name is worst exactly where this one
  lives: inside a binary patch no test reads and no `grep` finds.
- **Defer to a later release** — 2.1.0 is the only release where the cost is
  provably zero. From 2.1.0 on the sidecar makes upgrades lossless and we start
  telling users so, and a later rename would have to be argued safe rather than
  being obviously moot.
- **Ship a migration shim** that copies `memoryContent` into `projectContext` on
  load — only pays off if Live restores the old parameter into the new device,
  which is exactly what doesn't happen. It would also have to live in the patch,
  the part we're least able to test.

## Consequences

- Users upgrading from any earlier version copy their project context across by
  hand once. Called out in `upgrading.md` with a version-scoped warning to
  remove later.
- From 2.1.0 on, the sidecar carries project context across upgrades; the
  parameter name stops being load-bearing for that.
- **The assumption this rests on:** an upgrade loses the parameter's value
  regardless of its name. If Live turns out to preserve saved blob parameters
  across an in-place `.amxd` swap in some configuration, those users would have
  kept their context on a no-rename 2.1.0 and now lose it — the one scenario
  where this decision is wrong. Worth confirming once in Ableton; the documented
  upgrade warning is correct either way.
