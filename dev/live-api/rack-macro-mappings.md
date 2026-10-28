# Rack macro mappings

What Producer Pal can learn about a rack's macro mappings, as of Live 12.4.6.

| Capability                             | Max `LiveAPI`            | Python remote script      | Saved `.als` |
| -------------------------------------- | ------------------------ | ------------------------- | ------------ |
| Whether the rack has any mappings      | Yes                      | Yes                       | Yes          |
| Which macros are mapped                | No                       | Yes (`macros_mapped`)     | Yes          |
| What a macro is mapped to, and range   | No                       | Only by inference (below) | Yes          |
| Create or remove a mapping             | No                       | No                        | —            |
| Rename a macro                         | No (no error, no effect) | No                        | Yes (read)   |
| Macro color, annotation, default value | No                       | No                        | Yes (read)   |

No API can create or remove a mapping. Live's Python classes expose their whole
native class, and none of them, nor Live's own remote scripts, has a way to.
`Song.View.mod_mapping_device` looks close, but it's the modulator devices' Map
button: it waits for a user click and takes no macro index.

## `macros_mapped` (Python only)

`RackDevice.macros_mapped` is a tuple of 16 bools, one per macro, true when that
macro is mapped to anything. It has a listener. Max's `info` on a rack doesn't
list it. The remote script's `/device/macros` route serves it, and
`ppal-read-device` and `ppal-update-device` use that.

## Lowering the macro count

Live doesn't refuse, and doesn't keep a mapped macro visible: lowering the count
(`remove_macro`) hides macros and **keeps their mappings**. On a rack with macro
7 mapped, the count went 8, 6, 4, 2, 1 and `macros_mapped` still showed macro 7
at every step, and raising the count back showed it still mapped. So a hidden
macro can be mapped: `macros_mapped` covers all 16, not just the visible ones.
The count steps by 2 and stops at 1, never 0. `visible_macro_count` has no
setter; `add_macro` and `remove_macro` change it.

## The saved Set

A mapping is stored on the **target** parameter, not on the macro:

```xml
<Cutoff>
  <KeyMidi>
    <Channel Value="16" />         <!-- 16 means a rack macro, not a MIDI channel -->
    <NoteOrController Value="1" /> <!-- the macro's index, from 0 -->
    ...
  </KeyMidi>
  <MidiControllerRange><Min Value="135" /><Max Value="20" /></MidiControllerRange>
</Cutoff>
```

- The range can be inverted, as above.
- A macro mapped to an inner rack's macro looks the same: the inner rack's
  `MacroControls.N` carries the `KeyMidi`.
- The owning rack is presumably the nearest enclosing one. Unverified: whether a
  parameter can map to an outer rack's macro across a nested rack, which would
  make the index alone ambiguous.
- The rack itself stores per-macro `MacroDisplayNames`, `MacroColor`,
  `MacroAnnotations`, `MacroDefaults`, `ExcludeMacroFromRandomization`,
  `ExcludeMacroFromSnapshots`, and `MacroVariations`.
- The file reflects the last save only, and Producer Pal can't trigger a save.

## Inferring mappings live (Python)

Move a macro and see which disabled (mapped) parameters change. It works, but:

- Changes land on the next update tick, even after
  `Song.sync_parameter_changes()`, so it needs a job that spans ticks.
- Chains leak through: moving an outer macro also moves what the inner macro it
  drives is mapped to, so direct and indirect mappings look the same.
- Getting each mapping's range takes two moves per macro.
- It's audible, and probably adds undo steps.
- A macro that is itself mapped from an outer rack can't be set ("Value cannot
  be set, the parameter is disabled").

Not worth building unless mapping details become a real need.
