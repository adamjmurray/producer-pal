// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @param version - A version the server reported, or null
 * @returns The version to show, never "vnull"
 */
export function versionText(version: string | null): string {
  return version == null ? "an unknown version" : `v${version}`;
}
