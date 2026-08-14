// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { StepUsageLabel } from "#webui/components/chat/assistant/StepUsageLabel";
import { calcStepNewContent } from "#webui/components/chat/assistant/helpers/step-usage-helpers";

describe("StepUsageLabel", () => {
  it("falls back to 0 for every absent token field", () => {
    // Empty usage exercises the `?? 0` fallback on inputTokens, outputTokens,
    // cacheReadTokens and reasoningTokens (their nullish branches).
    const { container } = render(
      <StepUsageLabel usage={{}} newContentTokens={null} />,
    );

    // "tokens: 0 → 0" — no (new), (cached) or (reasoning) segments.
    expect(container.textContent).toContain("tokens:");
    expect(container.textContent).not.toContain("new");
    expect(container.textContent).not.toContain("cached");
    expect(container.textContent).not.toContain("reasoning");
  });
});

describe("calcStepNewContent", () => {
  it("returns null and defaults input to 0 when the part has no prev usage", () => {
    // Empty map → no prev; empty usage → inputTokens falls back to 0.
    expect(calcStepNewContent(0, {}, new Map())).toBeNull();
  });
});
