// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The ppal-manage fragment, gated on that one tool. Standard depth only: small-
// model mode never offers the tool, so there is no basic variant.

/**
 * Undo and redo through ppal-manage: what a step is, who else's edits it holds,
 * and what the remote script has to do with it.
 */
export const history = `## Undo & Redo

\`ppal-manage\` \`undo\`/\`redo\` step Live's own history: one step is one of your write calls, or one edit the user made in Live. \`steps\` takes several: count your write calls for "undo all that". Say what you're undoing, and ask first if they may have edited since. They need the remote script: if it isn't installed, \`install-remote-script\` installs it, then the user restarts Live.`;
