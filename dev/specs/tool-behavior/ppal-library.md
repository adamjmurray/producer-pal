# ppal-library

How `ppal-library` answers when Live's library data may be out of date. The
refusal rules are in
[up-front-refusals-by-tool.md](up-front-refusals-by-tool.md).

Samples and tags come from Live's browser database, opened read-only with the
write-ahead log ignored. New installs and samples sit in that log until Live
quits, so a read can miss them.

## Staleness note

- A log newer than the database means the read may be missing recent additions.
  Every database-backed action then carries a plain-language `stalenessNote` in
  its result: recent plug-ins and samples may be missing until Live restarts,
  and a plug-in can still be loaded by name. A `searches` call carries it once,
  not on each entry. It is not a warning: the result can carry it.
- No raw timestamps or sizes are reported.

## `list-plugins`

- With the remote script running, the list comes from Live's browser, which is
  current, merged with the plug-in database. The result has no `stalenessNote`.
  - The browser decides what is listed. Database rows it doesn't list are
    dropped (a format Live has turned off). Plug-ins only the browser lists
    (AUv3, never in the database) are kept with a name, format and vendor only.
    They carry no category or subcategories, so the `deviceKind`, `category` and
    `subcategory` filters never match them.
  - A plug-in is matched by format and name (ignoring case). The vendor is the
    browser's folder name; version, category and subcategories come from the
    database. When several database rows share the name, the one whose vendor
    reads like the browser's wins; none matching means the plug-in is treated as
    browser-only. A plug-in directly in a format folder has no browser vendor
    and takes the matched row's.
  - The remote script lists plug-ins without their presets (`plugins_only`).
- Without the remote script, or when it doesn't answer in time or is too old to
  know `plugins_only`, the list is the database alone, with `stalenessNote`
  under the rule above.
