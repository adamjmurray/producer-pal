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
    notation: "barbeat" as const,
    enabledTools: {} as Record<string, boolean>,
  };

  it("returns null when activeModel is null", () => {
    const lock: ConversationLock = {
      activeModel: null,
      activeProvider: null,
      activeSmallModelMode: null,
      activeNotation: null,
      activeEnabledTools: null,
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
      activeNotation: "barbeat",
      activeEnabledTools: null,
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
      activeNotation: "barbeat",
      activeEnabledTools: null,
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
      activeNotation: "barbeat",
      activeEnabledTools: null,
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
      activeNotation: "barbeat",
      activeEnabledTools: null,
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
      activeNotation: "barbeat",
      activeEnabledTools: null,
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
      activeNotation: "barbeat",
      activeEnabledTools: null,
    };

    render(<LockedSettingsNotice conversationLock={lock} {...defaultProps} />);

    expect(
      screen.getByText("Changes apply to new conversations only."),
    ).toBeTruthy();
  });

  it("shows notice when notation diverges", () => {
    const lock: ConversationLock = {
      activeModel: "gpt-4o",
      activeProvider: "openai",
      activeSmallModelMode: false,
      activeNotation: "stark",
      activeEnabledTools: null,
    };

    render(<LockedSettingsNotice conversationLock={lock} {...defaultProps} />);

    expect(
      screen.getByText("Changes apply to new conversations only."),
    ).toBeTruthy();
    expect(screen.getByText(/Stark notation/)).toBeTruthy();
  });

  it("stays quiet about notation for a conversation that locked none", () => {
    // A record saved before notation was locked has nothing to compare against,
    // so claiming a divergence would be inventing one.
    const lock: ConversationLock = {
      activeModel: "gpt-4o",
      activeProvider: "openai",
      activeSmallModelMode: false,
      activeNotation: null,
      activeEnabledTools: null,
    };

    const { container } = render(
      <LockedSettingsNotice
        conversationLock={lock}
        {...defaultProps}
        notation="stark"
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("reports a toolset that has moved since the conversation connected", () => {
    const lock: ConversationLock = {
      activeModel: "gpt-4o",
      activeProvider: "openai",
      activeSmallModelMode: false,
      activeNotation: "barbeat",
      activeEnabledTools: { "ppal-library": false },
    };

    render(
      <LockedSettingsNotice
        conversationLock={lock}
        {...defaultProps}
        enabledTools={{ "ppal-library": true }}
      />,
    );

    expect(screen.getByText(/different set of tools/)).toBeTruthy();
    // Tools are reported, not locked, so the notice says what actually happens
    // next rather than listing them alongside the pinned settings.
    expect(screen.queryByText(/Current conversation uses/)).toBeNull();
  });

  it("ignores a toolset that only spells out the defaults", () => {
    // Absent means enabled, so a record that lists every tool as true matches a
    // settings map that lists none of them. Reporting that as a change would
    // make the notice permanent for anyone who has never touched the Tools tab.
    const lock: ConversationLock = {
      activeModel: "gpt-4o",
      activeProvider: "openai",
      activeSmallModelMode: false,
      activeNotation: "barbeat",
      activeEnabledTools: { "ppal-read-clip": true, "ppal-library": true },
    };

    const { container } = render(
      <LockedSettingsNotice conversationLock={lock} {...defaultProps} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("stays quiet about tools for a conversation that recorded none", () => {
    // A record saved before the toolset was recorded has nothing to compare
    // against — same reasoning as the notation case above.
    const lock: ConversationLock = {
      activeModel: "gpt-4o",
      activeProvider: "openai",
      activeSmallModelMode: false,
      activeNotation: "barbeat",
      activeEnabledTools: null,
    };

    const { container } = render(
      <LockedSettingsNotice
        conversationLock={lock}
        {...defaultProps}
        enabledTools={{ "ppal-library": false }}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("lists the pinned settings alongside the tools line when both diverge", () => {
    const lock: ConversationLock = {
      activeModel: "gpt-3.5-turbo",
      activeProvider: "openai",
      activeSmallModelMode: false,
      activeNotation: "barbeat",
      activeEnabledTools: { "ppal-library": false },
    };

    render(<LockedSettingsNotice conversationLock={lock} {...defaultProps} />);

    expect(screen.getByText(/Current conversation uses/)).toBeTruthy();
    expect(screen.getByText(/different set of tools/)).toBeTruthy();
  });

  it("uses provider from settings when activeProvider is null", () => {
    const lock: ConversationLock = {
      activeModel: "different-model",
      activeProvider: null,
      activeSmallModelMode: false,
      activeNotation: "barbeat",
      activeEnabledTools: null,
    };

    render(<LockedSettingsNotice conversationLock={lock} {...defaultProps} />);

    expect(
      screen.getByText("Changes apply to new conversations only."),
    ).toBeTruthy();
  });
});
