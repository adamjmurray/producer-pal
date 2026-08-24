// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import pkceChallenge from "../pkce-challenge-disabled.ts";

describe("pkce-challenge-disabled", () => {
  it("throws, since the portal never performs an OAuth handshake", () => {
    expect(() => pkceChallenge()).toThrow(/Authorization not supported/);
  });
});
