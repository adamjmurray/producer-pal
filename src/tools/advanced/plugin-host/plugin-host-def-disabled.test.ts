// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import * as real from "./plugin-host.def.ts";
import * as stub from "./plugin-host-def-disabled.ts";

describe("plugin-host-def-disabled", () => {
  it("exports exactly the names the real definition does, with no tool behind them", () => {
    expect(Object.keys(stub).toSorted()).toStrictEqual(
      Object.keys(real).toSorted(),
    );
    expect(stub.toolDefPluginHost).toBeUndefined();
  });
});
