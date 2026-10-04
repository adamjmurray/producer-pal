// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** What "0 / 0.25 / 0.25 jumping to 0.9" parses to: a ramp that ends in a jump. */
export const RAMP_ENDING_IN_JUMP = [
  { time: 0, value: 0, jump: false },
  { time: 8, value: 0.25, jump: false },
  { time: 8, value: 0.9, jump: true },
];
