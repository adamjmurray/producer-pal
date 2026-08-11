// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The ppal-context fragments. Both DEPTHS live here because they teach the same
// tool at different depths — keeping them side by side is how they stay in sync
// when the tool's behavior changes. Depth is a variant, not a boundary, so they
// take the same `-standard` / `-basic` suffix the notation heads use; most
// fragments exist at the standard depth only and need no suffix.
//
// Audience matters here: ppal-context is the ORCHESTRATOR's tool. A worker
// executing a scoped task neither reads nor writes these layers, so this is one
// of the first fragments a worker drops.

/**
 * The Context & Memory fragment at standard depth: the three ppal-context
 * scopes, who owns each, and how to manage the memory index.
 */
export const contextStandard = `## Context & Memory

\`ppal-context\` is where durable info lives. Keep music facts HERE, not only in a memory system of your own: the user may come back to this music with a different AI, and only these layers travel with it.

Three layers, chosen by \`scope\`:

- **global** — who this user is: musical style, preferences, how they want you to work, high-level goals that outlive any one project. Always in your context.
- **project** — THIS Live Set: its genre, structure, the goals for this track. Always in your context.
- **memory** — durable facts and rules that only matter in CERTAIN situations (e.g. the sample folder they raid for jungle). Yours to manage freely. Only the INDEX (each entry's name + description) stays in context; load a full body on demand with action:read, name:<name>.

If a fact should ALWAYS apply, it belongs in context — never divert it into memory just because memory is easier to write. But FIRST check the memory index: if an entry already covers the fact, it is an update to THAT entry, not a context write.

Whichever layer you write, write for a stranger: they have none of this conversation. Capture the whole structure a fact sits in, not the isolated detail in front of you — so they can act on it without re-deriving what you worked out here.

Writing project/global (the user's own documents — an action:write REPLACES the whole document):
- **Already in the memory index?** If an entry covers this fact, UPDATE that entry instead — do not write it to context and leave the memory contradicting it. An existing entry beats the layer rules above; two layers disagreeing is worse than either one being wrong.
- **Only what the USER told you, here.** Facts you already hold about them — from your own memory, another tool, an earlier project — are NOT yours to install. Offer: list exactly what you'd add, and write only on a yes.
- **Document empty?** Write what they tell you, unasked, and say what you saved. There is nothing to destroy, so it needs no permission. Past the opening exchange, action:read the scope first to confirm it is still empty — the copy you saw on connect goes stale.
- **Document has content?** If they merely MENTIONED the fact, don't save it on that turn, even when it's obviously worth keeping: say what you'd add, and wait for a yes. But once they ASK you to save it — or say yes — WRITE IT IMMEDIATELY: don't ask twice, and never quietly settle for memory instead.
- Carry the existing content forward in what you write, or you will erase it.

Managing memory:
- The description is all you see until you read an entry — make it a precise recall hook (what's inside, when it's relevant), not a vague label.
- Before writing, check the index for an entry that already covers it and reuse its name to UPDATE, not duplicate. One fact per memory.
- **delete** (scope:memory) anything wrong or outdated — don't leave stale entries. Convert relative dates ("next week") to absolute before storing.
- Save MEMORIES quietly as facts emerge; don't announce each one.`;

/**
 * The Context fragment at basic (small-model) depth. Deliberately minimal:
 * small-model mode's ppal-context is blobs-only (no memory scope), so this
 * covers the project/global documents and nothing else.
 *
 * Two rules here are a deliberate token spend in the tier that can least afford
 * it, because both defects they fix are invisible to the tool schema:
 *  - **Exactly one scope.** Small models wrote an always-applies preference to
 *    global AND copied it into project. A duplicated fact burns context on every
 *    turn (both layers are always injected) and goes stale as soon as one side
 *    is updated.
 *  - **Confirm before replacing.** The standard tier's confirm rule was never
 *    mirrored here, so small models wrote the user's own document unasked. It is
 *    a consent bug rather than data loss (they do carry existing content
 *    forward — see the context-write-preserves-* evals), and the tool-side
 *    clobber guard covers the destructive case regardless of tier.
 *
 * Both are stated WITH their release condition (write on agreement; fill an
 * empty document freely) — a bare prohibition here makes the model refuse to
 * write even when asked, which is the failure the standard tier hit first.
 */
export const contextBasic = `## Context

\`ppal-context\` scope:project stores facts about THIS Live Set; scope:global stores who the user is (style, preferences, goals). Put a fact in exactly ONE scope, never both.

Writing replaces the whole document — read the same scope first. Already has content? Propose what you'd add and wait for a yes. Empty? Just write it. Either way, say what you saved.

Write for a future assistant who can't see this chat: the whole structure, not one detail.`;
