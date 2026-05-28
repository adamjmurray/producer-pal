// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCycledEntry,
  warnExtraEntries,
} from "#src/tools/shared/validation/cycle-utils.ts";

describe("cycle-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCycledEntry", () => {
    it("returns undefined for an undefined list", () => {
      expect(getCycledEntry(undefined, 0)).toBeUndefined();
    });

    it("returns undefined for an empty list", () => {
      expect(getCycledEntry([], 3)).toBeUndefined();
    });

    it("returns the entry at the index when in range", () => {
      expect(getCycledEntry(["a", "b", "c"], 1)).toBe("b");
    });

    it("cycles via modulo when the index exceeds the list length", () => {
      expect(getCycledEntry(["a", "b"], 0)).toBe("a");
      expect(getCycledEntry(["a", "b"], 1)).toBe("b");
      expect(getCycledEntry(["a", "b"], 2)).toBe("a");
      expect(getCycledEntry(["a", "b"], 3)).toBe("b");
    });
  });

  describe("warnExtraEntries", () => {
    it("warns when the list has more entries than items", () => {
      warnExtraEntries(["a", "b", "c"], 2, "tool", "transforms");

      expect(outlet).toHaveBeenCalledWith(
        1,
        "tool: 3 transforms provided but only 2 clips — ignoring extra",
      );
    });

    it("does not warn when entries match or are fewer than items", () => {
      warnExtraEntries(["a", "b"], 2, "tool", "code");
      warnExtraEntries(["a"], 3, "tool", "code");

      expect(outlet).not.toHaveBeenCalled();
    });

    it("does not warn for an undefined list", () => {
      warnExtraEntries(undefined, 0, "tool", "transforms");

      expect(outlet).not.toHaveBeenCalled();
    });
  });
});
