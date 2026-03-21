// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import {
  ConversationItem,
  type ConversationItemProps,
} from "#webui/components/chat/ConversationItem";
import { createTestSummary } from "#webui/test-utils/conversation-test-helpers";

const defaultHandlers = {
  onSelect: vi.fn(),
  onDelete: vi.fn(),
  onExport: vi.fn(),
  onToggleBookmark: vi.fn(),
  onEditStart: vi.fn(),
  onEditChange: vi.fn(),
  onEditCommit: vi.fn(),
  onEditCancel: vi.fn(),
};

function renderItem(overrides: Partial<ConversationItemProps> = {}) {
  const props: ConversationItemProps = {
    conv: createTestSummary({ title: "Test Chat" }),
    isActive: false,
    isEditing: false,
    editValue: "",
    ...defaultHandlers,
    ...overrides,
  };

  return render(<ConversationItem {...props} />);
}

describe("ConversationItem", () => {
  describe("ConversationMeta", () => {
    it("shows token usage when totalUsage is present", () => {
      const { container } = renderItem({
        conv: createTestSummary({
          title: "With Usage",
          totalUsage: { inputTokens: 12345, outputTokens: 678 },
        }),
      });

      const usageDiv = container.querySelector(
        '[title="token usage (input → output)"]',
      );

      const usage = usageDiv as HTMLElement;

      expect(usage).not.toBeNull();
      expect(usage.textContent).toContain("12.3K");
      expect(usage.textContent).toContain("678");
    });

    it("omits token usage when totalUsage is null", () => {
      const { container } = renderItem({
        conv: createTestSummary({
          title: "No Usage",
          totalUsage: null,
        }),
      });

      expect(container.textContent).not.toContain("tokens");
    });

    it("uses preset label when model is in presets", () => {
      const { container } = renderItem({
        conv: createTestSummary({
          title: "Known Model",
          model: "gemini-3-flash-preview",
          modelLabel: null,
        }),
      });

      expect(container.textContent).toContain("Gemini 3 Flash");
    });

    it("resolves model label from stored label when preset lookup fails", () => {
      const { container } = renderItem({
        conv: createTestSummary({
          title: "Custom Model",
          model: "custom-model-id-not-in-presets",
          modelLabel: "My Custom Model",
        }),
      });

      expect(container.textContent).toContain("My Custom Model");
    });

    it("falls back to raw model ID when no label available", () => {
      const { container } = renderItem({
        conv: createTestSummary({
          title: "Raw ID",
          model: "some-unknown-model-xyz",
          modelLabel: null,
        }),
      });

      expect(container.textContent).toContain("some-unknown-model-xyz");
    });
  });
});
