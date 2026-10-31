# ADR-0061: One generic wrapper hosts every plug-in

- **Status:** Accepted
- **Date logged:** 2026-10-31

## Decision

Producer Pal hosts VST/AU plug-ins in two generic Max for Live wrappers (effect
and instrument). Nothing is generated per plug-in, and hosted plug-in params are
not real Live params: they're reached through the wrapper, and automated through
a fixed bank of generic slots.

## Rejected

- **A generated wrapper per plug-in, with a `live.*` param for each plug-in
  param.** Device tools would work unchanged and the user would get automation
  lanes with real names. But it needs a patch file per plug-in, and dials can't
  be added at runtime instead: Live reads a device's param list once, about 90
  ms after load, so runtime-created `live.*` objects never reach it. Real names
  would mean baking the mapping into a file per plug-in or per instance. We
  don't keep per-project or per-plug-in files.
- **Writing the plug-in's params into the `.als` and reloading the Set.** Never
  verified, and reloading the user's Set to change a param is too disruptive.
- **Python's `PluginDevice.get_parameter_names`.** It lists names only, with no
  way to read or set values, so the model can't act on them.
