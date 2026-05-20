// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isSetLikelyOpen } from "#src/automation/als-file.ts";

/**
 * Mutable Spy-Seam fuer den `ppal-write-automation`-CLI-Open-Set-Guard.
 * Tests umlenken ueber `vi.spyOn(ppalWriteAutomationInternals, "isSetLikelyOpen")`
 * (frozen ESM-Namespace darf nicht direkt gespy't werden — Vorbild
 * `routingInternals`, `shiftTimeInternals` etc.).
 */
export const ppalWriteAutomationInternals = { isSetLikelyOpen };
