// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";

/** A generated uuid: a fresh value every run, so only its shape is assertable. */
export const UUID = expect.stringMatching(
  /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/,
) as unknown as string;
