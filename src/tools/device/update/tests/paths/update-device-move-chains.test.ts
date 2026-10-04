// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A toPath reaching past a rack's last chain makes the chains below it too, and
// the moved device's entry names them.

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  registerGrowingRack,
  registerMoveSourceAndRackTrack,
} from "../../../tests/helpers/growing-rack-fixtures.ts";
import {
  mockWorkingDeviceMoves,
  updateDevice,
} from "../update-device-test-helpers.ts";

describe("updateDevice - a toPath that makes chains", () => {
  beforeEach(() => {
    mockWorkingDeviceMoves();
    registerMoveSourceAndRackTrack();
  });

  it("names the chains the move had to make first", () => {
    registerGrowingRack({ track: 1, existing: 1 });

    expect(updateDevice({ id: "src-0", toPath: "t1/d0/c2/d+" })).toStrictEqual({
      id: "src-0",
      path: "t1/d0/c2/d0",
      created: "c1-c2",
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("says nothing when the chain the move names is already there", () => {
    registerGrowingRack({ track: 1, existing: 2 });

    expect(updateDevice({ id: "src-0", toPath: "t1/d0/c1/d+" })).toStrictEqual({
      id: "src-0",
      path: "t1/d0/c1/d0",
    });
  });
});
