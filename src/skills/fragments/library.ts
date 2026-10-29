// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What the ppal-library schema can't say: how to read a result's `folder`, and
// where its `path` goes next. The filters and actions all live in
// library.def.ts — don't restate them here. The handoff names its destination
// by kind, not by tool, because the gate is ppal-library alone.
export const library = `## Finding Library Content

Use \`ppal-library\` to search Live's browser library and the user's configured sample folder. Its schema covers the filters. What it doesn't:

- Live's tags are noisy. Each result carries \`folder\`, its immediate parent folder name — use it to sanity-check a tag hit: a \`Kick\`-tagged file under an \`IR Library\` folder is probably a reverb impulse, not a drum.
- Pass a result's absolute \`path\` wherever an audio clip or a Simpler \`sample\` is set.`;
