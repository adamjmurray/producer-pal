// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A section of the standard skills body, pulled into the standard driver via
// `@include` (see core-standard.ts, which lists the manifest). Each section is
// its own override slot (skill-slots.ts) so users can edit it in isolation —
// or suppress it by deleting its include line in a `standard` driver override.
// The Finding Library Content section of the standard core: ppal-library
// search, tags, kinds, and similarity actions.
export const coreLibrary = `## Finding Library Content

Use \`ppal-library\` to search Live's browser library and the user's configured sample folder.

- Defaults to audio samples (the only kind loadable into clips/Simpler today). Other \`kind\` values are discovery-only.
- \`query\` is a name substring; use \`*\` as a multi-character wildcard (e.g., \`kick*acoustic\`).
- \`tags\` is comma-separated; results must match ALL listed tags. Use \`action: "listTags"\` to discover available tags, or \`action: "listCategories"\` to browse Live's category taxonomy (Sounds, Drums, Genres, …) and \`category: "Drums"\` to list a category's tags.
- \`type\` filters by playback type: \`loop\` (loops), \`oneshot\` (one-shots, e.g. a kick), \`impulse-response\` (convolution IRs). Each result also reports \`type\`, so you can tell a one-shot kick from a drum loop — prefer \`oneshot\` for hits and \`loop\` for grooves.
- \`kind: "midi"\` covers ALL MIDI content — both \`.mid\` files and MIDI Live clips (\`.alc\`) — so it's the right kind for melody/chord ideas. \`kind: "live-clip"\` returns every \`.alc\` (MIDI and audio); \`.alc\` results carry \`subtype\` (\`midi\`/\`audio\`) to disambiguate.
- \`source\`: filter where the file lives. \`sampleFolder\` is the user-configured sample folder on disk (bypasses Live's DB); \`user\`, \`pack\`, \`builtin\`, \`cloud\`, \`plugin\` query Live's DB.
- \`inFolder\` restricts a search to immediate children of one absolute folder path (composes with the other filters).
- \`verifyPaths: true\` stats each result and adds \`pathExists\` so you can skip files moved/deleted since Live last indexed (off by default; adds one filesystem check per result).
- \`action: "searchBatch"\` runs many filtered searches in one call. Pass \`queries\` as an array of objects each carrying the same filters as a single search plus an optional \`label\`; results come back grouped per query (capped at 20).
- \`action: "listPlugins"\` enumerates installed VST/AU/etc. from Live's plugin DB. Filter with \`query\` (name substring), \`vendor\`, \`format\` (VST/VST3/AU), \`deviceKind\` (\`instrument\` / \`audiofx\` — \`midifx\` has no plugin equivalent), or \`subcategory\`.
- \`action: "findSimilar"\` ranks samples by audio similarity to a seed sample (\`similarTo\`: an absolute path, e.g. from a prior result); each result carries a \`similarity\` score (-1 to 1, ~1 = very similar). Combine with the search filters to constrain candidates (e.g. \`similarTo\` a kick + \`tags: "Kick"\` for "more kicks like this"). \`action: "findDuplicates"\` groups library samples with identical audio (re-shipped duplicates), scoped by the same filters.
- Items from the user's sample folder appear before Live's library items in results.
- Each result includes \`folder\` (its immediate parent folder name). Use it to sanity-check tag hits: Live's tags are noisy, so a \`Kick\`-tagged file under an \`IR Library\` folder is probably a reverb impulse, not a drum.
- Pass an absolute \`path\` from a result to \`ppal-create-clip\` / \`ppal-update-clip\` (audio clips) or \`ppal-create-device\` / \`ppal-update-device\` (Simpler \`sample\`).`;
