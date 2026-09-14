# ADR-0046: `d+` appends a device

- **Status:** Accepted
- **Date logged:** 2026-09-14
- **Amends:** [ADR-0045](0045-c-plus-appends-a-rack-chain.md)

## Context

Every other creating path spells append with a `+` — `t+`, `rt+`, `t2/l+`,
`t0/d0/c+`. Device insertion spelled it by what the path left off instead: a
path ending in a container (`t0`, `t0/d0/c0`, `t0/d0/pC1`) appended, one ending
in `d<n>` inserted at n. Nothing said so, and a reviewer reached for `d+`
unprompted and was refused.

## Decision

`d+` appends a device to the container the rest of the path names, and is taken
by the same three tools `c+` is: `ppal-create-device`, `ppal-duplicate` and
`ppal-update-device`. It goes exactly where a `d<n>` could, and must be last —
the device it names isn't there yet, so nothing can be addressed below it.

`d<n>` is unchanged and still inserts at n.

One marker covers all three device types. Live's `insert_device` with no index
appends within the section for the device's own type — MIDI effect, instrument,
audio effect — so the type is Live's business, not the path's.

The bare container is still accepted, but it is not a synonym: create-device
appends to it, while a move or copy to one lands at the top. It is what results
and reads spell a container as, so refusing it would break callers pasting a
path back. It just isn't what we teach.

## Rejected alternatives

- **`mfx+` / `inst+` / `afx+`, one append marker per device type.** Live already
  puts a device in its own section, so the type marker would only restate what
  the device name says — three spellings to learn for one behavior.
- **Refuse the bare container, so append has exactly one spelling.** It is the
  spelling every result and read hands back for a container, and a model pasting
  one into `path` made a well-founded guess, not a typo.
