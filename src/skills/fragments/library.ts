// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What the ppal-library schema can't say: how to read a result's `folder`, and
// where its `path` goes next. The filters and actions all live in
// library.def.ts — don't restate them here.
//
// The handoff bullet names four write tools while the gate is ppal-library
// alone, so a read-only caller pays ~40 tokens it can't act on (declared in
// DELIBERATE_CROSS_REFERENCES). A `library-write` split would fix that and cost
// a new public slot — not worth it at this size.
export const library = `## Finding Library Content

Use \`ppal-library\` to search Live's browser library and the user's configured sample folder. Its schema covers the filters. What it doesn't:

- Live's tags are noisy. Each result carries \`folder\`, its immediate parent folder name — use it to sanity-check a tag hit: a \`Kick\`-tagged file under an \`IR Library\` folder is probably a reverb impulse, not a drum.
- Pass a result's absolute \`path\` to \`ppal-create-clip\` / \`ppal-update-clip\` (audio clips) or \`ppal-create-device\` / \`ppal-update-device\` (Simpler \`sample\`).`;
