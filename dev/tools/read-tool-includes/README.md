# Read Tool Include System

The read tools (`ppal-read-live-set`, `ppal-read-track`, `ppal-read-scene`,
`ppal-read-clip`, `ppal-read-device`) use an `include` parameter to control what
data is returned. This keeps default responses small (saving context window
tokens) and lets callers request only the data they need.

## General Conventions

### Default behavior

- `include` defaults to `[]` for all read tools.

### Tool description

The first line of the tool description is the title/summary. The second line
should say:

```
Returns overview by default. Use include to add detail.
```

### Enum ordering

In the `.def.ts` schema, the `"*"` wildcard must always be **last** in the enum
array. Other options are listed alphabetically or in logical groupings.

### Include parameter description

The `include` parameter's `.describe()` lists available options as a compact
comma-separated list, ending with `"*" for all`. Example:

```
'data: sample, timing, notes, color, warp, "*" for all'
```

### Wildcard `"*"`

Expands to all available include options for that tool type. Useful for
debugging, but should be avoided in production for large Live Sets.

### Small-model trims

Every read tool drops some include options in small-model mode, via
`excludeEnumValues` on the `include` param (see `dev/tools/tool-schemas.md`).
The trim is enforced: the value is removed from the schema that validates, so
sending it is an error rather than a no-op. `"*"` is dropped everywhere.

Which options go, and why, is ADR-0026 — the short version is that an option
goes when nothing the small model can do depends on it. Fields inside a
surviving option are never suppressed. The per-tool lists live in each
`.def.ts`; the per-tool files describe large-model mode.

### Include propagation

`ppal-read-track` and `ppal-read-scene` expand `"*"` against their OWN option
list and pass the expanded array to `readClip()`; only clip-recognized includes
affect clip output. Forwarding a bare `"*"` would let the nested read expand it
against the clip options instead, turning on options the outer tool never
published. `ppal-read-live-set` propagates only track-level includes
(`routings`, `mixer`, `color`) to its nested track/scene reads.

### Redundant field stripping

Nested clip results have context-redundant fields removed to save tokens:

- **In `ppal-read-track`**: `view` and `type` are stripped from clips in
  `sessionClips`/`arrangementClips`/`takeLanes` (redundant with the parent
  track's properties and the array name). A take lane clip keeps its `path` — it
  says where on the lane the clip starts, which the lane's own path doesn't.
- **In `ppal-read-scene`**: `view` is stripped from clips in the `clips` array
  (scenes are always session view)

When reading clips directly via `ppal-read-clip`, all fields are present.

### Implementation

All include parsing is centralized in
`src/tools/shared/tool-framework/include-params.ts`:

- `parseIncludeArray(include, defaults)` — returns an `IncludeFlags` object with
  boolean flags
- `expandWildcardIncludes(include, defaults)` — expands `"*"` to all options for
  the tool type; call it before forwarding an include array to a nested read
- `ALL_INCLUDE_OPTIONS` — the options per tool type. A meta test holds each
  `.def.ts` enum equal to its list plus `"*"`, so an option can't be reachable
  by wildcard and rejected by name
- `READ_CLIP_DEFAULTS`, `READ_TRACK_DEFAULTS`, etc. — default flag values per
  tool type
- `IncludeFlags` interface — all possible boolean flags
- `FLAG_TO_OPTION` — maps flag names to option strings (used by
  `includeArrayFromFlags()`)

Each tool's `.def.ts` defines the available enum values. The handler
destructures the flags it needs from `parseIncludeArray()`.

## Per-tool references

| File                                 | Contents                                           |
| ------------------------------------ | -------------------------------------------------- |
| [read-live-set.md](read-live-set.md) | Live Set overview fields and track/scene includes  |
| [read-track.md](read-track.md)       | Track fields, clip/take-lane includes, mixer       |
| [read-scene.md](read-scene.md)       | Scene fields and clip includes                     |
| [read-clip.md](read-clip.md)         | Clip fields, timing/notes/audio includes, examples |
| [read-device.md](read-device.md)     | Device includes (chains, params, options), depth   |
