// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import {
  type ConversationLock,
  LockedSettingsNotice,
} from "#webui/components/settings/LockedSettingsNotice";

describe("LockedSettingsNotice", () => {
  const defaultProps = {
    model: "gpt-4o",
    provider: "openai" as const,
    smallModelMode: false,
  };

  it("returns null when activeModel is null", () => {
    const lock: ConversationLock = {
      activeModel: null,
      activeProvider: null,
      activeSmallModelMode: null,
    };
    const { container } = render(
      <LockedSettingsNotice conversationLock={lock} {...defaultProps} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("returns null when locked settings match defaults", () => {
    const lock: ConversationLock = {
      activeModel: "gpt-4o",
      activeProvider: "openai",
      activeSmallModelMode: false,
    };
    const { container } = render(
      <LockedSettingsNotice conversationLock={lock} {...defaultProps} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("shows notice when model diverges", () => {
    const lock: ConversationLock = {
      activeModel: "gpt-3.5-turbo",
      activeProvider: "openai",
      activeSmallModelMode: false,
    };

    render(<LockedSettingsNotice conversationLock={lock} {...defaultProps} />);

    expect(
      screen.getByText("Changes apply to new conversations only."),
    ).toBeTruthy();
  });

  it("shows notice when provider diverges", () => {
    const lock: ConversationLock = {
      activeModel: "gpt-4o",
      activeProvider: "anthropic",
      activeSmallModelMode: false,
    };

    render(<LockedSettingsNotice conversationLock={lock} {...defaultProps} />);

    expect(
      screen.getByText("Changes apply to new conversations only."),
    ).toBeTruthy();
  });

  it("shows notice when small model mode diverges", () => {
    const lock: ConversationLock = {
      activeModel: "gpt-4o",
      activeProvider: "openai",
      activeSmallModelMode: true,
    };

    render(<LockedSettingsNotice conversationLock={lock} {...defaultProps} />);

    expect(
      screen.getByText("Changes apply to new conversations only."),
    ).toBeTruthy();
    expect(screen.getByText(/small model mode/)).toBeTruthy();
  });

  it("shows large model mode when activeSmallModelMode is false but settings has true", () => {
    const lock: ConversationLock = {
      activeModel: "gpt-4o",
      activeProvider: "openai",
      activeSmallModelMode: false,
    };

    render(
      <LockedSettingsNotice
        conversationLock={lock}
        {...defaultProps}
        smallModelMode={true}
      />,
    );

    expect(screen.getByText(/large model mode/)).toBeTruthy();
  });

  it("shows both model and small model mode when both diverge", () => {
    const lock: ConversationLock = {
      activeModel: "gpt-3.5-turbo",
      activeProvider: "openai",
      activeSmallModelMode: true,
    };

    render(<LockedSettingsNotice conversationLock={lock} {...defaultProps} />);

    expect(
      screen.getByText("Changes apply to new conversations only."),
    ).toBeTruthy();
  });

  it("uses provider from settings when activeProvider is null", () => {
    const lock: ConversationLock = {
      activeModel: "different-model",
      activeProvider: null,
      activeSmallModelMode: false,
    };

    render(<LockedSettingsNotice conversationLock={lock} {...defaultProps} />);

    expect(
      screen.getByText("Changes apply to new conversations only."),
    ).toBeTruthy();
  });
});
