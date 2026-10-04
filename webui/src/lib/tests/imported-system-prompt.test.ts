// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { importedPromptDiffers } from "#webui/lib/conversations/imported-system-prompt";

describe("importedPromptDiffers", () => {
  it("flags an imported conversation whose prompt differs from the user's", () => {
    expect(importedPromptDiffers(true, "from file", "mine", true)).toBe(true);
  });

  it("does not flag an imported conversation with the same prompt", () => {
    expect(importedPromptDiffers(true, "same", "same", true)).toBe(false);
  });

  it("does not flag a local conversation, even when its prompt differs", () => {
    expect(importedPromptDiffers(false, "old", "edited since", true)).toBe(
      false,
    );
  });

  it("does not flag an imported conversation with no locked prompt", () => {
    expect(importedPromptDiffers(true, null, "mine", true)).toBe(false);
  });

  it("stays quiet until the user's prompt has loaded", () => {
    expect(importedPromptDiffers(true, "from file", "built-in", false)).toBe(
      false,
    );
  });
});
