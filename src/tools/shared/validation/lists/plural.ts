// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * "1 entry", "3 copies", "2 tracks" — a trailing y becomes -ies.
 * @param count - How many
 * @param noun - The singular noun
 * @returns The counted phrase
 */
export function plural(count: number, noun: string): string {
  if (count === 1) {
    return `${count} ${noun}`;
  }

  const plur = noun.endsWith("y") ? `${noun.slice(0, -1)}ies` : `${noun}s`;

  return `${count} ${plur}`;
}
