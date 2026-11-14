// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @param a - A plug-in name
 * @param b - Another
 * @returns Whether they are the same name, ignoring case and outer spaces
 */
export function samePluginName(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

/**
 * @param name - A plug-in name
 * @returns The name in the form names are compared in
 */
function fold(name: string): string {
  return name.normalize("NFC").trim().toLowerCase();
}
