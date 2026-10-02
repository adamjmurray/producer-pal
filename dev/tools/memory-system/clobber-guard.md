# The clobber guard

How a `project`/`global` write that would discard the existing document is
blocked in code. Part of the [memory system](README.md)'s layer discipline.

**The clobber guard** (`clobberWarning` in `project-context-operations.ts`).
Instructions are not a mechanism, so the destructive case is also blocked in
code: a `project`/`global` write whose content keeps NONE of the existing
document is skipped, and the model gets a `WARNING:` block plus the current
document back, so it can re-send a merged write. `force: true` overrides it —
declared in `context.def.ts` in every mode (a guard whose escape hatch is
invisible to the tier that hits it would deadlock the write) but deliberately
absent from the skills, so the model meets it in the warning rather than
reaching for it.

Detection is line containment, both sides normalized (list marker stripped,
whitespace collapsed, trailing punctuation dropped) so a reformat _of a line_
survives — a restructuring that splits one line across several still fires,
since an existing line must land whole inside one incoming line — and only lines
of ≥ 8 _alphanumeric_ characters may vouch for a write — otherwise a `---` rule
or a `| --- | --- |` table separator would satisfy it for free.

That floor picks _which_ line vouches; it does not decide whether a document is
worth guarding. Applied unconditionally it would measure a document by its
_longest line_, which is the wrong measure — a twelve-line roster of short
entries (`- 124` / `- A min` / `- kick: t0` / `- drop: b33`, nothing over 7
alphanumerics) is a lot of accumulated context and would have had zero
protection, while one sentence of prose is fully covered. Shorthand is a note
style, not a signal that there is little to lose. So there is one rule: test
against the strongest lines the document _has_. When none clear the floor, any
line carrying letters or digits vouches instead — genuinely weaker, since short
needles match by coincidence (a write that discards that roster but says "in A
minor" satisfies the `- A min` needle), but far better than leaving those
documents unprotected. A document with a substantive line is unaffected. The
guard is inert on an empty document, on a blank write (the documented clear),
and on a document of pure structure with no letters or digits anywhere.

It applies to the TOOL path only. The webui/REST editors write through their own
routes, so the user may select-all-and-replace their own document freely; this
guards an LLM discarding content it never meant to touch, not the user's
editing. Automation that legitimately replaces a whole document through the tool
(the e2e round-trip, the eval seed/restore) passes `force`.
