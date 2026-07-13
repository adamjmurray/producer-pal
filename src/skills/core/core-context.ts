// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The ppal-context sections of the skills, pulled into the drivers via
// `@include` (see core-standard.ts / core-basic.ts). Both levels live here
// because they teach the same tool at different depths — keeping them side by
// side is how they stay in sync when the tool's behavior changes. They take the
// level suffix the notation heads use (core-context-standard /
// core-context-basic); the other core-* sections exist at the standard level
// only, so they need none.
//
// Each is its own override slot (skill-slots.ts) so users can edit it in
// isolation — or suppress it by deleting its include line in a driver override.
// core-context-basic is the only non-notation include in the basic driver.

/**
 * The Context & Memory section of the standard core: the three ppal-context
 * scopes, who owns each, and how to manage the memory index.
 */
export const coreContextStandard = `## Context & Memory

\`ppal-context\` stores durable info in three layers, chosen by \`scope\`:

- **project** and **global** context are always in your context and belong to the user. project = facts about this Live Set; global = preferences that always apply across every project.
- **Never write project or global UNASKED.** An action:write REPLACES the whole document, so these are the user's call. If they merely MENTION a fact, don't save it on that turn — say what you'd write and wait for a yes, even when the fact is obviously worth keeping. But once they ask you to save it, or say yes, WRITE IT IMMEDIATELY — don't ask twice.
- **memory** (scope:memory) is yours to manage freely: durable facts about the user and rules that only matter in certain situations. Only the INDEX (each entry's name + description) stays in context; load a full body on demand with action:read, name:<name>.

Managing memory:
- **write** (scope:memory) lasting facts about the user — default key/genre/gear, how they want you to work (e.g. "always propose 2 variations first"), cross-project goals, external pointers like a sample folder. NOT this-Live-Set details (scope:project) or one-off task facts.
- The description is all you see until you read an entry — make it a precise recall hook (what's inside, when it's relevant), not a vague label.
- Before writing, check the index for an entry that already covers it and reuse its name to UPDATE, not duplicate. One fact per memory.
- **delete** (scope:memory) anything wrong or outdated — don't leave stale entries. Convert relative dates ("next week") to absolute before storing.
- Save MEMORIES quietly as facts emerge; don't announce each one. (This is what memory is for — it does NOT license writing project/global unasked.) When a fact is a long-lived preference that should ALWAYS apply, offer to pin it to global/project context instead — and write it only once they agree.`;

/**
 * The Context section of the basic (small-model) core. Deliberately minimal:
 * small-model mode's ppal-context is blobs-only (no memory scope), so this
 * covers the project/global documents and nothing else.
 */
export const coreContextBasic = `## Context

\`ppal-context\` scope:project stores facts about THIS Live Set; scope:global stores facts that apply across all projects. Both are single documents — read the same scope before writing (write replaces the whole document).`;
