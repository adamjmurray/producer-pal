// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { resolveLabeledTargets } from "#src/tools/shared/validation/lists/labeled-targets.ts";

describe("resolveLabeledTargets", () => {
  it("says once that an id names nothing, whatever the path carries", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { targets } = resolveLabeledTargets({
      noun: "track",
      targets: { id: "null", path: "t0" },
      name: "A",
    });

    expect(targets).toHaveLength(1);
    expect(warn.mock.calls).toStrictEqual([['id "null" names nothing']]);
  });

  it("says once for each alias that names nothing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    resolveLabeledTargets({
      noun: "scene",
      targets: { ids: "undefined", paths: "null", path: "s0" },
    });

    expect(warn.mock.calls).toStrictEqual([
      ['ids "undefined" names nothing'],
      ['paths "null" names nothing'],
    ]);
  });
});
