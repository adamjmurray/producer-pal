// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  type UnresolvedParam,
  type WrittenPseudoParam,
} from "../../helpers/param-reading.ts";

/**
 * Assert a pseudo-param write was refused: the param keeps its slot as
 * `ok: false` with the reason, named the way the call spelled it, and nothing
 * warns — the entry is the whole report.
 * @param outcome - What applySpecializedParamWrite returned
 * @param name - The param name as the call spelled it
 * @param reason - Substring the reason must contain
 */
export function expectWriteRefused(
  outcome: (WrittenPseudoParam | UnresolvedParam)[] | null,
  name: string,
  reason: string,
): void {
  expect(outcome).toStrictEqual([
    { name, ok: false, reason: expect.stringContaining(reason) },
  ]);
  expect(capturedWarnings()).toStrictEqual([]);
}
