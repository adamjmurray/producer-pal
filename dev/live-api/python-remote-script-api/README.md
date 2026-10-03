# Python remote script API

Live has two APIs. Max's `LiveAPI`, which the device uses, is a layer over the
Python API that remote scripts run in, so the two mostly match. This folder
records where they may not, and how to probe the Python side.

- [python-only-candidates.md](python-only-candidates.md) — Python members
  missing from Max's allowlist, as of Live 12.4.6. Spot-checked from Max.
- [../rack-macro-mappings.md](../rack-macro-mappings.md) — what can be learned
  about rack macro mappings, from either API or the saved Set.

Nothing is hidden below the Python API: Boost.Python exposes each native class
whole, and its only private member is `LomObject._live_ptr`, a raw pointer.

Prior art to check before writing new probes:
[PhotonicVelocity LiveAPI](https://github.com/PhotonicVelocity/LiveAPI) (a
Python API reference built from runtime introspection, decompiled Remote Scripts
and probing) and
[Structure Void's MIDI Remote Scripts docs](https://midiremotescripts.structure-void.com/)
(the object model across Live versions).

## Probing

The scripts are in `scripts/live-api/python-probe/`.

1. **Install the probe route:** `npm run remote-script:install -- --probe`, then
   restart Live. This adds a `/probe` route that runs posted Python on Live's
   main thread. It's arbitrary code execution over local HTTP, so it exists only
   in the installed copy: the route's source sits outside
   `remote-script/Producer_Pal/`, so the device never bundles it. Reinstall
   without the flag to remove it.
2. **Run Python in Live:**
   `node scripts/live-api/python-probe/run-probe.ts <file.py> [out.json]`. The
   code sees `song`, `app`, `Live` and `bridge`, and returns whatever it assigns
   to `result`. `snippets/` has examples; `native-docs.py` dumps every member's
   docstring, most with a C++ signature giving argument types.
3. **Compare with Max:**
   `node scripts/live-api/python-probe/compare-python-max.ts [out-dir]`. It
   writes a report of the Python members missing from Max's allowlist, and the
   full Python surface as JSON, both named for the Live version. Any Set works.

## A new Live version

Run `compare-python-max.ts` on the old and new Live and diff the two surface
JSON files: new members and enum values show up in the diff. Update
[python-only-candidates.md](python-only-candidates.md) from the report.

## How the Max check works

Max's `LiveAPI` runs through Live's own Python package `_MxDCore`. Its
`LomTypes.AVAILABLE_TYPE_PROPERTIES` lists, per Live class, every member Max may
use, and Max refuses the rest. The script diffs the Python surface against that
list. To confirm one member, run Max's `info` on the object (the `ppal-live-api`
tool's `info` operation): it lists what Max can reach. Details:

- Max can't reach a class missing from the list, or any module-level function.
- `hidden` members in the list are the old notes and routing APIs, still usable.
- Python control surfaces (`live_app control_surfaces N`) aren't limited: Max
  can use any attribute on them, with a warning for `_`-prefixed names.
- `get` and `call` can't prove a member is missing: both answer a bare `1` for
  an unknown name, and `get` does the same when a real member's read fails (e.g.
  `arm` on the main track). A real read comes back as a list.
- Cycling '74's LOM docs can run ahead of your Live. They list
  `Clip.is_session_clip`, but Max on Live 12.4.6 can't read it.
