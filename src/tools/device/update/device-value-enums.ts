// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What the per-target enum params accept. A leaf module so the tool schema can
// name the values without pulling the update handlers in behind them.

/** What macroVariation does to a rack. */
export const MACRO_VARIATIONS = [
  "create",
  "load",
  "delete",
  "revert",
  "randomize",
] as const;

/** What abCompare does to a device. */
export const AB_COMPARE_ACTIONS = ["a", "b", "save"] as const;
