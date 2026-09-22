// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { toolDefUpdateClip } from "#src/tools/clip/update/update-clip.def.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateClip - per-clip timing params", () => {
  let mocks: UpdateClipMocks;

  /** A two-bar 4/4 region, so a new start or length moves a real boundary. */
  const REGION = {
    loop_start: 0,
    loop_end: 8,
    start_marker: 0,
    end_marker: 8,
  };

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123, REGION);
    setupMidiClipMock(mocks.clip456, REGION);
  });

  // A broadcast start beside a paired length: one covers both clips, the other
  // gives each its own.
  it("gives each clip its own length", async () => {
    await updateClip({ id: "123,456", start: "1|1", length: "1bar,2bar" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_end", 4);
    expect(mocks.clip456.set).toHaveBeenCalledWith("loop_end", 8);
  });

  it("applies a single length to every clip", async () => {
    await updateClip({ id: "123,456", start: "1|1", length: "1bar" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_end", 4);
    expect(mocks.clip456.set).toHaveBeenCalledWith("loop_end", 4);
  });

  it("gives each clip its own time signature", async () => {
    await updateClip({ id: "123,456", timeSignature: "4/4,3/4" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_numerator", 4);
    expect(mocks.clip456.set).toHaveBeenCalledWith("signature_numerator", 3);
  });

  it("gives each clip its own region start", async () => {
    await updateClip({ id: "123,456", start: "1|1,2|1" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_start", 0);
    expect(mocks.clip456.set).toHaveBeenCalledWith("loop_start", 4);
  });

  it("gives each clip its own firstStart", async () => {
    await updateClip({
      id: "123,456",
      looping: "true",
      firstStart: "1|1,2|1",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("start_marker", 0);
    expect(mocks.clip456.set).toHaveBeenCalledWith("start_marker", 4);
  });

  it("refuses a list that names a different number of clips", async () => {
    await expect(
      updateClip({ id: "123,456", length: "1bar,2bar,3bar" }),
    ).rejects.toThrow("id names 2 entries but length names 3 entries");

    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  it("refuses an empty entry rather than guessing", async () => {
    await expect(updateClip({ id: "123,456", start: "1|1,," })).rejects.toThrow(
      'invalid start "1|1,," - it has an empty entry',
    );

    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  // With one clip there is no list to pair, so the value stays whole — here
  // that makes it an unreadable meter rather than two readable ones.
  it("takes the whole value literally when the call names one clip", async () => {
    await expect(
      updateClip({ id: "123", timeSignature: "4/4,3/4" }),
    ).rejects.toThrow("Time signature must be in format");

    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  it("refuses the whole call when one entry's meter won't parse", async () => {
    await expect(
      updateClip({ id: "123,456", timeSignature: "4/4,nope" }),
    ).rejects.toThrow("Time signature must be in format");

    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });
});

describe("updateClip - per-clip booleans", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
  });

  it("gives each clip its own looping", async () => {
    await updateClip({ id: "123,456", looping: "true,false" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("looping", true);
    expect(mocks.clip456.set).toHaveBeenCalledWith("looping", false);
  });

  it("applies a single looping to every clip", async () => {
    await updateClip({ id: "123,456", looping: "false" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("looping", false);
    expect(mocks.clip456.set).toHaveBeenCalledWith("looping", false);
  });

  it("doubles only the clip duplicateLoop names", async () => {
    await updateClip({ id: "123,456", duplicateLoop: "true,false" });

    expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
    expect(mocks.clip456.call).not.toHaveBeenCalledWith("duplicate_loop");
  });

  it("gives each audio clip its own warping", async () => {
    setupAudioClipMock(mocks.clip123);
    setupAudioClipMock(mocks.clip456);

    await updateClip({ id: "123,456", warping: "true,false" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("warping", 1);
    expect(mocks.clip456.set).toHaveBeenCalledWith("warping", 0);
  });

  it("refuses a boolean list that names a different number of clips", async () => {
    await expect(
      updateClip({ id: "123,456", looping: "true,false,true" }),
    ).rejects.toThrow("id names 2 entries but looping names 3 entries");

    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  // start/length set the region duplicateLoop doubles, and the list can ask
  // for the double on one clip only.
  it("refuses start beside a duplicateLoop list that turns it on anywhere", async () => {
    await expect(
      updateClip({ id: "123,456", duplicateLoop: "false,true", start: "1|1" }),
    ).rejects.toThrow("duplicateLoop cannot be combined with start");
  });

  it("allows start beside a duplicateLoop list that doubles nothing", async () => {
    await updateClip({
      id: "123,456",
      duplicateLoop: "false,false",
      start: "1|1",
    });

    expect(mocks.clip123.call).not.toHaveBeenCalledWith("duplicate_loop");
  });
});

// The MCP layer coerces before the handler runs, so the handler only ever sees
// strings.
describe("updateClip - booleans through the tool schema", () => {
  const params = resolveToolSchema(
    toolDefUpdateClip.toolOptions.inputSchema,
    {},
  ).validating;

  it("takes a plain boolean", () => {
    const args = z
      .object(params)
      .parse({ looping: true, duplicateLoop: false, warping: true });

    expect(args.looping).toBe("true");
    expect(args.duplicateLoop).toBe("false");
    expect(args.warping).toBe("true");
  });

  it("refuses an entry that names no boolean", () => {
    expect(() => z.object(params).parse({ looping: "true,maybe" })).toThrow(
      "each entry must be true or false",
    );
  });
});
