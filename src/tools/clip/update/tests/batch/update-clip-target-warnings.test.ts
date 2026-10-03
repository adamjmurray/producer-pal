// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateClip - blank and empty target params", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  // The wording truth table is target-lists.test.ts; these pin WHEN update-clip
  // says it. A blank is an unset param, so the path carries the call
  // — but nothing in the result would say the id the caller sent was dropped.
  it("warns when a blank id is dropped and path carries the call", async () => {
    setupMidiClipMock(mocks.clip456);

    const result = await updateClip({
      id: "   ",
      path: "t1/s1",
      name: "By Path",
    });

    expect(capturedWarnings()).toStrictEqual([
      'blank id ignored — "path" names the clips',
    ]);
    expect(mocks.clip456.set).toHaveBeenCalledWith("name", "By Path");
    expect(result).toStrictEqual({ id: "456", path: "t1/s1" });
  });

  it("says once that an id names nothing, while path carries the call", async () => {
    setupMidiClipMock(mocks.clip456);

    await updateClip({ id: "null", path: "t1/s1", name: "By Path" });

    expect(capturedWarnings()).toStrictEqual(['id "null" names nothing']);
    expect(mocks.clip456.set).toHaveBeenCalledWith("name", "By Path");
  });

  it("warns when a blank path is dropped and id carries the call", async () => {
    setupMidiClipMock(mocks.clip123);

    await updateClip({ id: "123", path: "   ", name: "By Id" });

    expect(capturedWarnings()).toStrictEqual([
      'blank path ignored — "id" names the clips',
    ]);
    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "By Id");
  });

  it("says nothing when only one of id and path was sent", async () => {
    setupMidiClipMock(mocks.clip456);

    await updateClip({ path: "t1/s1", name: "By Path" });

    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("says nothing when id and path both name clips", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);

    await updateClip({ id: "123", path: "t1/s1", name: "Both" });

    expect(capturedWarnings()).toStrictEqual([]);
  });

  // The warning claims what the call did, and a refused call did nothing. V8
  // attaches a request's warnings to its error response too, so saying it
  // before the refusals would tell the model that a path it never used named
  // the clips.
  it.each([
    ["a list has a hole", { path: "t1/s1,,t2/s1" }, "empty entry"],
    [
      "a whole-call param can't be read",
      { path: "t1/s1", timeSignature: "x" },
      "Time signature must be in format",
    ],
  ])(
    "says nothing when the call is refused because %s",
    async (_label, args, message) => {
      setupMidiClipMock(mocks.clip456);

      await expect(updateClip({ id: "   ", ...args })).rejects.toThrow(message);
      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("blank id ignored"),
      );
    },
  );
});
