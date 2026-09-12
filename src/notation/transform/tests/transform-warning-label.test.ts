// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  warn,
  withClipWarningLabel,
} from "#src/notation/transform/transform-warning-label.ts";
import {
  beginWarningCapture,
  capturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";

describe("transform warning label", () => {
  beforeEach(() => {
    beginWarningCapture();
  });

  it("names the clip a transform is running for", () => {
    withClipWarningLabel("clip id 7", () => warn("skipping"));

    expect(capturedWarnings()).toStrictEqual(["clip id 7: skipping"]);
  });

  it("leaves a warning bare when no clip is named", () => {
    warn("skipping");
    withClipWarningLabel(undefined, () => warn("also skipping"));

    expect(capturedWarnings()).toStrictEqual(["skipping", "also skipping"]);
  });

  it("restores the previous label, so the next clip is not mislabelled", () => {
    withClipWarningLabel("clip id 7", () => {
      withClipWarningLabel("clip id 8", () => warn("inner"));
      warn("outer");
    });
    warn("after");

    expect(capturedWarnings()).toStrictEqual([
      "clip id 8: inner",
      "clip id 7: outer",
      "after",
    ]);
  });

  it("restores the label when the transform throws", () => {
    expect(() =>
      withClipWarningLabel("clip id 7", () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    warn("after");

    expect(capturedWarnings()).toStrictEqual(["after"]);
  });
});
