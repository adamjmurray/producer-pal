# Producer Pal migration adapter

Rewrites pre-2.4 tool arguments onto the `path` grammar that replaced them, for
scripts driving Producer Pal through
[MCP](https://producer-pal.org/guide/npx-cli) or the
[REST API](https://producer-pal.org/guide/rest-api).

The params these scripts rewrite still work in 2.3 — they emit a deprecation
warning — and are removed in 2.4. See the
[migration guide](https://producer-pal.org/guide/migration) for the full
picture, including the parts these scripts deliberately leave alone.

- [`ppal-migrate.mjs`](./ppal-migrate.mjs) — Node 18+, no dependencies
- [`ppal_migrate.py`](./ppal_migrate.py) — Python 3.8+, no dependencies

The two are ports of each other, with the same function names and the same test
cases. Change one, change the other.

## Use

```bash
node ppal-migrate.mjs ppal-read-track '{"trackIndex": 2}'
# {"path": "t2"}

python ppal_migrate.py ppal-create-clip '{"trackIndex":1,"arrangementStart":"33|1,37|1"}'
# {"path": "t1[33|1],t1[37|1]"}

node ppal-migrate.mjs --self-test    # every case below, plus path round trips
```

As a library:

```js
import { migrateArgs, buildPath, parsePath } from "./ppal-migrate.mjs";

const { args, notes } = migrateArgs("ppal-read-track", { trackIndex: 2 });
// args  -> { path: "t2" }
// notes -> []   (empty means it migrated cleanly)

buildPath({ trackIndex: 1, takeLane: 0, position: "17|1" }); // "t1/l0[17|1]"
parsePath("t1/l0[17|1]"); // { trackType: "regular", trackIndex: 1, ... }
```

```python
from ppal_migrate import migrate_args, build_path, parse_path

args, notes = migrate_args("ppal-read-track", {"trackIndex": 2})
```

Always check `notes`. An empty list means the call migrated cleanly; anything in
it is a case the adapter could not translate on its own, described in full.

## What it rewrites

| Old                                                  | New                                             |
| ---------------------------------------------------- | ----------------------------------------------- |
| `trackIndex` + `trackType`                           | `path`: `t2`, `rt0`, `mt`                       |
| `trackIndex: -1` (create-track)                      | `path: "t+"`                                    |
| `type: "return"` (create-track)                      | `path: "rt+"`                                   |
| `sceneIndex`                                         | `path: "s2"`                                    |
| `slot: "1/0"`, `slots`, `toSlot`                     | `path`/`toPath`: `t1/s0`                        |
| `arrangementStart: "5\|1"`                           | fused onto the path: `t1[5\|1]`                 |
| `takeLane: "1"`                                      | `/l0` on the path — **counts from 0**           |
| `takeLane: "new"` over several positions             | `l+` on the first, `l=` on the rest             |
| `locator: "Chorus"` (duplicate)                      | `toPath: "[loc:Chorus]"`                        |
| `startLocator`, `loopStartLocator`, `loopEndLocator` | `startTime`/`loopStart`/`loopEnd`: `loc:Chorus` |
| `devicePath` (select)                                | `path`                                          |
| `inputRoutingTypeId` and the other three `*Id`       | drop the `Id` suffix                            |

Two of these are **not renames**, which is why a find-and-replace is not enough:

- `takeLane` counted from 1; the `l<n>` path segment counts from 0.
  `takeLane: 1` is `l0`, and `takeLane: 0` was the main lane — no take lane at
  all. One `takeLane: "new"` also made one lane however many positions landed on
  it, so only the first position gets `l+`; the rest reuse it with `l=`.
- `arrangementStart` stops being its own param and becomes a coordinate on the
  destination path, so it has to be paired with a track rather than renamed.

A call can also name two destinations at once — a `slot` list for the session
and a `trackIndex` for the arrangement, or a track and a scene on `ppal-select`
— and both survive, as one comma-separated path.

## What it does not rewrite

These need a Live read or a judgement call, so the adapter reports them in
`notes` and leaves the params they name exactly as they were — a half-migrated
call is worse than an untouched one.

- **`ppal-update-clip` `split`.** Its positions are offsets from each clip's own
  start; `arrangementSplit` reads the song timeline. The same value cuts
  somewhere else, so converting needs each clip's arrangement start.
- **`params[].name` path prefixes** on `ppal-create-device` and
  `ppal-update-device`. `{name: "pC1/c0/d0/Volume"}` becomes path
  `t5/d0/pC1/c0/d0` with name `Volume`. Because `params` applies to every path
  in a call, values that differ per target turn one call into one call per
  target.
- **`ppal-library` `action: "searchBatch"`.** Becomes `action: "search"` with a
  `searches` list — a different request shape, not a path translation.
- **`takeLane` on `ppal-duplicate` when the source is addressed by `id`**, or
  spans several tracks. A take lane in a path needs its track (`t1/l0[5|1]`),
  and there is nowhere to read that track from.
- **`ppal-select`'s `trackIndex` + `sceneIndex` on a return or the main track.**
  The pair selects both, and only a regular track has a clip slot (`t1/s3`) that
  names both in one path. On a return track that takes two calls.
- **A value the tool itself refuses**, such as a `takeLane` that is neither 0, a
  positive integer, nor `"new"`. Rewriting it as the main lane would turn a
  refusal into a clip on the wrong lane.
