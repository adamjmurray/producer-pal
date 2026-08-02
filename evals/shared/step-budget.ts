// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The per-turn step budget every eval transport runs under.
 *
 * Single source of truth, so a looping model is bounded the same way whichever
 * transport ran it. The AI SDK path spends it through `stepCountIs`, counting
 * model generations; the agent-CLI transports have no such knob, so they count
 * model actions (a tool call, or a reply) off the event stream and kill the
 * subprocess. Near enough the same number either way — the point is that a
 * runaway fails as a blown budget rather than as a five-minute timeout.
 */

export const MAX_TOOL_STEPS = 10;
