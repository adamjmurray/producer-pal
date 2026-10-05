// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import * as selectModule from "#src/tools/session/select.ts";

const NOTHING_TO_UPDATE =
  "nothing to update: id and path only name the clips; also send a param to change";

describe("updateClip - a call that asks nothing of its clips", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123);
  });

  it.each([
    { id: "123" },
    { path: "t0/s0" },
    { id: "123", focus: false },
    { id: "123", duplicateLoop: false },
    { id: "123", toPath: "", arrangementSplit: " ", arrangementLength: "" },
    { id: "123", notes: undefined, name: undefined },
  ])("refuses %j, writing nothing", async (args) => {
    await expect(updateClip(args)).rejects.toThrow(NOTHING_TO_UPDATE);
    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  it.each([
    ["name", { name: "A" }],
    ["looping false", { looping: false }],
    ["a blank name, which clears it", { name: "" }],
    ["transforms", { transforms: "velocity = 100" }],
    ["quantizeGrid", { quantizeGrid: "1/8" as const }],
  ])("accepts %s as something to write", async (_label, extra) => {
    await expect(updateClip({ id: "123", ...extra })).resolves.toBeDefined();
  });

  it("counts focus: true as work, and selects the clip", async () => {
    const selectSpy = vi
      .spyOn(selectModule, "select")
      .mockReturnValue({} as never);

    await updateClip({ id: "123", focus: true });

    expect(selectSpy).toHaveBeenCalledWith({ id: "123", detailView: "clip" });
  });
});
