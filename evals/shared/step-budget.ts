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
 * off the event stream and kill the subprocess. Claude Code marks its
 * generations, so it counts those; Codex's stream doesn't, so it counts tool
 * calls, which is the same number for every turn that isn't pure narration.
 * What none of the three may do is charge narration a step of its own — that
 * halves the tool work the same budget buys.
 */

export const MAX_TOOL_STEPS = 25;
