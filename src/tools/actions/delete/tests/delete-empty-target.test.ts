// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { deleteObject } from "../delete.ts";

// A comma-separated id/path with every segment blank parses to nothing, the
// same as an omitted param — but it was not omitted, so it must not read as
// "nothing to do".
describe("deleteObject when id or path names nothing", () => {
  it("refuses an id of only commas and blanks", () => {
    expect(() => deleteObject({ id: ",  ,", type: "track" })).toThrow(
      'invalid id ",  ," - it names nothing',
    );
  });

  it("refuses a path of only a comma", () => {
    expect(() => deleteObject({ path: ",", type: "device" })).toThrow(
      'invalid path "," - it names nothing',
    );
  });

  // Deleting is the one operation a caller can't undo by retrying, so a list
  // read two ways is refused before anything is deleted.
  it("refuses an empty id entry", () => {
    expect(() => deleteObject({ id: "123,,456", type: "track" })).toThrow(
      'invalid id "123,,456" - it has an empty entry.',
    );
  });

  // Unaffected by the fix above: a blank value already reads as omitted, so
  // the existing required-param error still fires instead of a warning.
  it("still throws when id is whitespace-only", () => {
    expect(() => deleteObject({ id: "   ", type: "track" })).toThrow(
      "delete failed: id or path is required",
    );
  });

  it("still throws when id is a single empty string", () => {
    expect(() => deleteObject({ id: "", type: "track" })).toThrow(
      "delete failed: id or path is required",
    );
  });
});
