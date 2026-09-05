// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Every tool that focuses what it just made goes through focusSelect, so a
// focus that fails can't take the finished work down with it.

import { describe, expect, it, vi } from "vitest";
import * as v8Console from "#src/shared/max/v8-max-console.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { focusSelect } from "#src/tools/session/helpers/select-focus-helpers.ts";

describe("focusSelect", () => {
  it("warns instead of throwing when the id resolves to nothing", () => {
    const warn = vi.spyOn(v8Console, "warn").mockImplementation(() => {});

    mockNonExistentObjects();

    expect(() => focusSelect({ id: "id gone" })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      'Could not move the focus: id "id gone" does not exist',
    );
  });
});
