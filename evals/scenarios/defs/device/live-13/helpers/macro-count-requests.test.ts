// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { toolCall, turnsOf } from "../../../helpers/turns-test-helpers.ts";
import { macroCountRequests } from "./macro-count-requests.ts";

describe("macroCountRequests", () => {
  const asked = toolCall("ppal-update-device", {
    path: "t1/d0",
    macroCount: 16,
  });

  it("finds a successful call with the count, sent as a number or text", () => {
    const text = toolCall("ppal-update-device", {
      path: "t1/d0",
      macroCount: "16",
    });

    expect(macroCountRequests(turnsOf([asked, text]), 16)).toStrictEqual([
      asked,
      text,
    ]);
  });

  it("skips other counts, other tools, calls with no count and refused calls", () => {
    const other = toolCall("ppal-update-device", {
      path: "t1/d0",
      macroCount: 12,
    });
    const none = toolCall("ppal-update-device", { path: "t1/d0", name: "x" });
    const read = toolCall("ppal-read-device", {
      path: "t1/d0",
      macroCount: 16,
    });
    const refused = toolCall(
      "ppal-update-device",
      { macroCount: 16 },
      "no",
      true,
    );

    expect(
      macroCountRequests(turnsOf([other, none, read, refused]), 16),
    ).toStrictEqual([]);
  });
});
