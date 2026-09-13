# ADR-0041: device-type path segments are input only

- **Status:** Accepted
- **Date logged:** 2026-09-12

## Context

A path addresses a device by position: `t0/d2`. That index is the one thing
about a device chain that moves on its own — Live re-sorts the chain around
every insert that isn't an audio effect, so a `d<n>` a model read a moment ago
can name a different device by the next call. And it doesn't say what the device
is, so "set the instrument's volume" starts with a read-track or a read-device
just to find out which index the instrument sits at.

`inst`, `mfx<n>` and `afx<n>` address a device by what it is instead. Live keeps
a container's device list sorted MIDI effects → instrument → audio effects, so
they are a filter over the order that is already there: the n-th device of that
type, 0-based within the type, and `inst` with no index because a container
holds at most one.

That leaves the question of whether results should spell them too.

## Decision

They are **input only**. `objectPathForApi`, `pathField` and every derived path
keep producing `d<n>`.

The cost is asymmetric. Going in, a type segment is resolved once per path: read
the container's devices, filter on `type`, substitute the index. Coming out,
every device a result names would pay that same device-list read — and results
name a device per chain, per drum pad, per param entry, on the per-object hot
path where `d<n>` comes free from string manipulation off the Live path Live
already handed back.

Nothing is lost by it. A `d<n>` a result reports still resolves, and the
addresses stay round-trippable: a result that echoes the caller's own spelling
may echo `t0/inst`, which parses.

Making them canonical is a separate decision, and it needs a measurement of that
per-object read rather than an argument.

## Rejected alternatives

**Canonical in results.** Above: it buys a nicer-reading path for a read on the
hottest path there is, and the stability argument cuts the other way for a
result — `d<n>` is what Live's own path says, so reporting it can't disagree
with Live, where a filtered index can if the device list shifts between the read
and the caller's next call.

**Bare `afx` meaning `afx0`.** Reads as "the audio effect" on a container that
usually has several, and the singular spelling is exactly what a caller writes
when they mean "the one I know about". A parse error naming `afx0` costs one
retry and teaches the numbering; a silent first-effect default is a wrong target
that looks like success. `inst` stays bare because a container really does hold
one.

**Param-name prefixes.** A `params` entry may carry a path prefix
(`{name: "c0/d0/Volume"}`), so `pC1/inst/Volume` looks like it should work. It
doesn't: these are path segments, and that prefix is its own grammar whose
general form is already open (see Object Paths, "Not paths"). Extending a
spelling we may retire would make retiring it harder.
