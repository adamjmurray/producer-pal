// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { loadFailure } from "../../../examples/skills/ableton-open-live-set/open-live-set.mjs";

describe("open-live-set loadFailure", () => {
  it("lists the candidates when the browser has more than one device", () => {
    const message = loadFailure(409, {
      error: "'Producer_Pal' matches 2 items - pass one as path",
      candidates: ["User Library/A.amxd", "User Library/B.amxd"],
    });

    expect(message).toContain("more than one Producer_Pal device");
    expect(message).toContain("User Library/A.amxd, User Library/B.amxd");
  });

  it("passes on the error when the Set already has Producer Pal", () => {
    const error =
      "Producer Pal is already in this Live Set, on track 0 'Bass' - a Set can only have one";

    const message = loadFailure(409, { error });

    expect(message.startsWith(`${error}. It didn't answer on port `)).toBe(
      true,
    );
    expect(message).toContain("check that device, or set PPAL_PORT");
  });
});
