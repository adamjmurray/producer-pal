// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { stripReturnSlotLetter } from "#src/tools/shared/validation/name-utils.ts";

/**
 * Live prepends a return track's send letter to its name, so writing back the
 * name read-track reported ("A-Delay") would double it ("A-A-Delay").
 * @param path - The track's Live API path
 * @param name - Requested name
 * @returns Name to write
 */
export function stripReturnTrackLetter(path: string, name: string): string {
  return stripReturnSlotLetter(path, name, /return_tracks (\d+)$/, "-");
}
