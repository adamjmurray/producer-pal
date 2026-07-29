# ADR-0015: Rename the project-context device parameter in 2.1.0, the one release where it is free

- **Status:** Accepted
- **Date logged:** 2026-07-29

## Context

Project context is stored in a Max for Live **parameter**: a `textedit` in
`tab-context.maxpat` with `parameter_enable: 1`, `parameter_type: 3` (blob), and
`parameter_invisible: 1`. Live saves its value with the Set, which is why
project context travels with a `.als` rather than living in `~/.producer-pal`.

The "memory" → "context" terminology cleanup (#1008) renamed the concept
everywhere in TypeScript, but the parameter's identity in the patch — `varname`,
`parameter_longname`, `parameter_shortname` — was still spelled `memoryContent`,
along with the message and send names it feeds (`update_memory`,
`---memory-editor`, `prepend memoryContent`). Leaving that would make the patch
— the least greppable part of the codebase, since `Producer_Pal.amxd` is a
binary container — permanently contradict every other name in the project.

Renaming a saved M4L parameter is normally breaking: a value Live has stored
against the old name has nothing to bind to in the new device.

Two facts make this release the exception:

- **Project context does not survive a device upgrade today.** A replaced
  `.amxd` comes up as a fresh, empty device. This is the problem 2.1.0 fixes,
  with the on-disk sidecar beside the Set's `.als` (#1009).
- **That fix cannot help the upgrade _into_ 2.1.0.** No earlier version ever
  wrote a sidecar, so there is nothing on disk to restore from. Everyone
  arriving at 2.1.0 from any prior release loses their in-device project context
  and has to copy it across by hand, rename or no rename.

The loss itself is not new — it has been true of every upgrade since project
context existed. What is new is that 2.0.0 started actively encouraging project
context, so this is the first upgrade where a meaningful number of users have
something to lose. That raises the urgency of documenting the manual copy step;
it does not change the rename's cost, which is zero either way.

## Decision

Do the rename now, in 2.1.0, together with the patch's message and send names.
Document the manual copy step in
[upgrading](../../docs/installation/upgrading.md) and in the 2.1.0 release
notes, and say plainly that it is a one-time cost.

## Alternatives rejected

- **Keep `memoryContent` indefinitely.** Rejected: it costs nothing to change
  now and can only get more expensive. A misleading name is worst exactly where
  this one lives — inside a binary patch that no test reads and no `grep` finds.
- **Defer the rename to a later release.** Rejected: 2.1.0 is the only release
  where the cost is _provably_ zero. From 2.1.0 on, the sidecar makes upgrades
  lossless and we begin telling users so. A rename after that would have to be
  argued safe rather than being obviously moot. It very likely _would_ be safe —
  the restore path repopulates the parameter through the
  `update_project_context` outlet and the `---project-context-editor` send, not
  by parameter name — but resting an advertised guarantee on "very likely" is a
  worse trade than spending the rename in the release where nothing is at stake.
- **Ship a migration shim that reads `memoryContent` and copies it into
  `projectContext` on load.** Rejected: it only pays off if Live restores the
  old parameter into the new device, which is precisely what does not happen on
  an upgrade. The shim would also have to live in the patch (a second hidden
  `textedit` and its wiring) — the part of the codebase we are least able to
  test — to guard a case that cannot arise.
- **Roll the rename back and ship the sidecar alone.** This was an adversarial
  review's initial recommendation, on the mistaken premise that the rename was
  an unnoticed data-loss hazard. Rejected: the loss it "causes" happens anyway,
  so a rollback would buy nothing and commit us to the old name for good.

## Consequences

- Users arriving at 2.1.0 from any earlier version must copy their project
  context out of the old device before replacing it. One-time, called out in
  `upgrading.md` (with a version-scoped warning to remove once nobody is still
  coming from a pre-2.1.0 device) and in the release notes.
- From 2.1.0 onward the **sidecar**, not the parameter, is what carries project
  context across an upgrade. The parameter name stops being load-bearing for
  upgrade survival.
- **Revisit trigger:** if a future change ever makes the parameter's saved value
  the upgrade-survival path again, renaming it stops being free.
- **The one fact that would falsify this:** the argument holds because an
  upgrade loses the parameter's value regardless of its name. If Live turns out
  to preserve saved blob parameters across an in-place `.amxd` swap in some
  configuration, then those users would have kept their context on a no-rename
  2.1.0 and now lose it — the only scenario in which this decision is wrong.
  Worth confirming once in Ableton; the documented upgrade warning is correct
  either way.
