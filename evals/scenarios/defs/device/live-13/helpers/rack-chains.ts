// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** One chain of a read-device result. */
interface ChainRead {
  name?: string;
  deviceCount?: number;
}

/**
 * What is wrong with the Mid-Side Rack's chains: it has a fixed pair, Mid and
 * Side, and the Utility the user asked for should sit on Side alone.
 *
 * @param result - Parsed ppal-read-device result, read with chains
 * @returns A description of what is wrong, or null when the chains are right
 */
export function rackChainsProblem(result: unknown): string | null {
  const chains = (result as { chains?: ChainRead[] }).chains ?? [];
  const summary = chains
    .map((chain) => `${chain.name ?? "?"}:${chain.deviceCount ?? 0}`)
    .join(", ");

  return summary === "Mid:0, Side:1"
    ? null
    : `chains (name:devices) read ${summary || "none"}, wanted Mid:0, Side:1`;
}
