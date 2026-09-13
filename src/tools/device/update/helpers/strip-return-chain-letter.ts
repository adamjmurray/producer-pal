// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { stripReturnSlotLetter } from "#src/tools/shared/validation/name-parsing.ts";

/**
 * Live prepends a rack return chain's send letter to its name, so writing back
 * the name read-device reported ("F Pedal") would double it ("F F Pedal").
 * @param chain - The chain being renamed
 * @param name - Requested name
 * @returns Name to write
 */
export function stripReturnChainLetter(chain: LiveAPI, name: string): string {
  return stripReturnSlotLetter(chain.path, name, /return_chains (\d+)$/, " ");
}
