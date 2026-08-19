// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  beginWarningCapture,
  endWarningCapture,
  MAX_CAPTURED_WARNINGS,
  recordWarning,
  resetWarningCapture,
  resumeWarningCapture,
  suspendWarningCapture,
} from "#src/shared/max/v8-warning-capture.ts";

describe("v8-warning-capture", () => {
  it("collects warnings for the request that began the capture", () => {
    const capture = beginWarningCapture();

    expect(recordWarning("first")).toBe(true);
    expect(recordWarning("second")).toBe(true);
    expect(endWarningCapture(capture)).toStrictEqual(["first", "second"]);
  });

  it("refuses a warning when no request is in flight", () => {
    resetWarningCapture();

    expect(recordWarning("nobody's")).toBe(false);
  });

  it("stops collecting once the capture ends", () => {
    const capture = beginWarningCapture();

    endWarningCapture(capture);

    expect(recordWarning("too late")).toBe(false);
  });

  it("leaves another request's capture active when one ends", () => {
    const parked = beginWarningCapture();
    const later = beginWarningCapture();

    // The parked request finishes second in wall-clock terms but is not the
    // active capture, so ending it must not silence the one that is.
    endWarningCapture(parked);

    expect(recordWarning("belongs to the active request")).toBe(true);
    expect(endWarningCapture(later)).toStrictEqual([
      "belongs to the active request",
    ]);
  });

  it("caps what one request can hold and says how much it dropped", () => {
    const capture = beginWarningCapture();

    for (let i = 0; i < MAX_CAPTURED_WARNINGS + 3; i++) {
      recordWarning(`warning ${i}`);
    }

    const sent = endWarningCapture(capture);

    expect(sent).toHaveLength(MAX_CAPTURED_WARNINGS + 1);
    expect(sent.at(-1)).toBe(
      `3 more warning(s) dropped (limit ${MAX_CAPTURED_WARNINGS})`,
    );
  });

  describe("suspendWarningCapture", () => {
    it("collects nothing while suspended and resumes the caller's capture", async () => {
      const capture = beginWarningCapture();

      await suspendWarningCapture(
        Promise.resolve().then(() => {
          // Stands in for a warning raised while V8 is waiting on Node, with no
          // request's synchronous stretch running.
          expect(recordWarning("raised mid-flight")).toBe(false);
        }),
      );

      expect(recordWarning("after the round trip")).toBe(true);
      expect(endWarningCapture(capture)).toStrictEqual([
        "after the round trip",
      ]);
    });

    it("restores the caller's capture even when the promise rejects", async () => {
      const capture = beginWarningCapture();

      await expect(
        suspendWarningCapture(Promise.reject(new Error("round trip failed"))),
      ).rejects.toThrow("round trip failed");

      expect(recordWarning("still mine")).toBe(true);
      expect(endWarningCapture(capture)).toStrictEqual(["still mine"]);
    });
  });

  describe("resumeWarningCapture", () => {
    it("takes the active capture back from a request that started later", () => {
      const parked = beginWarningCapture();

      // A second request arrives while the first is parked on an await.
      const interloper = beginWarningCapture();

      recordWarning("theirs");

      // The parked request resumes and re-asserts itself, as handleRequest does.
      resumeWarningCapture(parked);
      recordWarning("mine");

      expect(endWarningCapture(interloper)).toStrictEqual(["theirs"]);
      expect(endWarningCapture(parked)).toStrictEqual(["mine"]);
    });
  });
});
