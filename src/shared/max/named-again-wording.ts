// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The wording for a target a later one replaced. No imports, so the V8 tools
// and the Node-side routes say it the same way.

/**
 * The stem every named-twice reason shares.
 * @param address - How the later mention spelled it, when that differs
 * @returns The stem
 */
export function namedAgain(address?: string): string {
  return address == null
    ? "named again later in this call"
    : `named again as ${address} later in this call`;
}

/**
 * How an entry says the later one meant to replace it failed, so nothing of it
 * was written: the one wording for every tool.
 * @param by - The later mention, as the caller spelled it ("t0", id 12)
 * @returns The reason
 */
export function replacementFailedDetail(by: string): string {
  return `not written: ${by} was meant to replace it, but failed`;
}
