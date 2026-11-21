// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PREVIEW_APP_SOURCE_KEY,
  readPreviewAppSource,
} from "#webui/lib/utils/gen-ui/preview-app-source";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("readPreviewAppSource", () => {
  it("is null when nothing is set", () => {
    expect(readPreviewAppSource()).toBeNull();
  });

  it("returns the stored source", () => {
    sessionStorage.setItem(PREVIEW_APP_SOURCE_KEY, "<p>hi</p>");

    expect(readPreviewAppSource()).toBe("<p>hi</p>");
  });

  it("is null when storage throws", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readPreviewAppSource()).toBeNull();
  });
});
