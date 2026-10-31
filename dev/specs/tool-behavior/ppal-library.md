# ppal-library

How `ppal-library` answers a search, and when Live's library data may be out of
date. The refusal rules are in
[up-front-refusals-by-tool.md](up-front-refusals-by-tool.md).

## `search`

- **A search needs a query or a filter.** `query`, `tags`, `type`, `deviceKind`,
  `source`, `inFolder` or a `kind` other than `audio` count; blank strings,
  `sort`, `verifyPaths`, `limit`, `offset` and `label` do not. The schema fills
  in `kind: "audio"`, and every audio file in the library is no narrower a set,
  so the default counts for nothing. Without one the call would list the
  library's first files, which can fill a small model's context. A bare search,
  or any bare `searches` entry, refuses the whole call before any search runs,
  naming the entries by label (or position) and what to add. `find-similar` and
  `find-duplicates` are not searches in this sense: the seed or the whole
  library is what they ask for.
- **`limit` is capped at 200 for `search`** (default 50). A larger value is
  clamped to 200 without a note. The other actions keep the 1000 cap
  (`list-tags` defaults to 200): they have no paging, so a long plug-in list
  must still fit.
- **A search that hit its limit says so, and the next page is one call away.**
  `offset` (default 0) skips that many matches. When more matched than the page
  holds, the result carries `more` (how many matches lie beyond this page) and
  `nextOffset` (where the next page starts). Both are left off when nothing lies
  beyond: a search that fits, and a last page, look as they did before paging.
  `searches` entries take their own `offset` and answer with their own `more`
  and `nextOffset`, also when a lone entry is unwrapped into a plain answer.
  - A count, not a flag: `more: 3` and `more: 3000` call for different next
    steps (page on, or narrow the search), and the number costs the same tokens
    as `true`. The count is exact except for the overlap below.
  - The search reads one row past its page, and only finding one runs a
    `COUNT(*)` over the same filters (milliseconds). A search that fits its page
    never counts.
  - Pages are windows on one list: the sample folder's matches first, then the
    database's, each in its own sort order (the order a search always had).
    Every order ends on the file's id, so a file can't land on two pages or
    none. A page of folder items alone still asks the database for one row, to
    learn whether any follow.
  - A file both the sample folder and Live's database list shows once, as the
    folder's. The database's copy is dropped from its page, which can leave that
    page short, and is still counted in `more`, which is then one too high per
    such file beyond the page. `nextOffset` stays right: it is the position
    after this page, not the number of items shown.
  - An `offset` past the last match returns no items, no `more`, and a `detail`
    saying so, so it isn't read as a search with no matches. A negative,
    fractional or non-numeric `offset` is treated as a whole number from 0,
    without a note, as `limit` is.
  - `offset` is for `search` only: other actions refuse it (see
    [up-front-refusals-by-tool.md](up-front-refusals-by-tool.md)), and it can't
    sit beside `searches`.
  - The rack note for an empty `preset` search counts the offset, so a page past
    the last preset doesn't claim there were none.
- **An item leaves out what the request or its own `path` already says.** The
  items are sorted on their full fields first, then trimmed:
  - `name` goes when it is the last segment of `path`. A name with a `/` in it
    (a `:` in the file on disk) reads `:` in the path, so it differs and stays.
  - `folder` goes when it is the second-to-last segment of `path`. It stays when
    it differs the same way. A file directly under the root has no `folder`.
  - `useCount` goes when 0.
  - `kind` goes when it equals the search's `kind`, `source` when it equals the
    search's `source`. They stay when the search sent none, and when the item
    differs: a `kind: "midi"` search also returns MIDI Live clips, which stay
    `kind: "live-clip"`.
  - Everything else stays: `path`, `tags`, `subtype`, `type`, `pathTruncated`,
    `pathExists`.
- Only `search` trims. `find-similar` and `find-duplicates` return full items.

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
    They carry no category or subcategories, so the `deviceKind` and
    `subcategory` filters never match them. When one of those filters left out
    such plug-ins (and nothing else ruled them out), the result has a short
    `note`: see "Unknown-category note" below.
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
- **Unknown-category note.** A plug-in with no category and no subcategories
  (not in the database) can't match a `deviceKind` or `subcategory` filter, so a
  filtered call leaves it out. When it does, the result carries a short `note`
  saying how many were left out and that dropping `deviceKind`/`subcategory`
  lists them. Only plug-ins that pass the other filters (`query`, `vendor`,
  `format`) count, once each, and the count is taken before `limit`. No `note`
  when none were left out that way. It applies with or without the remote
  script, and sits beside `stalenessNote` when both apply.
