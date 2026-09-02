// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { updateScene } from "../update-scene.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

// An id whose entries all trim away was still sent, and reads exactly like an
// omitted id. Nothing has run yet, so refusing costs the caller nothing.
describe("updateScene when id names nothing", () => {
  it("refuses an id of only commas and blanks", () => {
    expect(() => updateScene({ id: ",  ," })).toThrow(
      'invalid id ",  ," - it names nothing',
    );
  });

  // A blank value reads as omitted, so this lands on the missing-target
  // refusal rather than the names-nothing one.
  it("still reports a whitespace-only id as missing", () => {
    expect(() => updateScene({ id: "   " })).toThrow(
      "updateScene failed: id or path is required",
    );
  });
});

// name and color are positional: name[k] goes to id[k]. Dropping an empty entry
// leaves the list one short, so every name after it lands on the wrong scene;
// keeping it names nothing. Neither reading is recoverable, so neither is taken.
describe("updateScene when an id entry is empty", () => {
  beforeEach(() => {
    registerMockObject("123", { path: livePath.scene(0) });
    registerMockObject("456", { path: livePath.scene(1) });
  });

  it("refuses the call instead of renaming the wrong scene quietly", () => {
    expect(() => updateScene({ id: "123,,456", name: "A,B,C" })).toThrow(
      'invalid id "123,,456" - it has an empty entry.',
    );
  });
});
