// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { type ComponentProps } from "preact";
import { describe, expect, it } from "vitest";
import {
  type ConversationLock,
  LockedSettingsNotice,
} from "#webui/components/settings/LockedSettingsNotice";
import { LIVE_API_TOOL_ID } from "#src/shared/tool-groups";

type NoticeProps = ComponentProps<typeof LockedSettingsNotice>;

describe("LockedSettingsNotice", () => {
  const defaultProps: Omit<NoticeProps, "conversationLock"> = {
    model: "gpt-4o",
    provider: "openai",
    smallModelMode: false,
    notation: "barbeat",
    enabledTools: {},
    liveApiEnabled: false,
  };

  /** A lock whose every field already agrees with defaultProps. */
  const matchingLock: ConversationLock = {
    activeModel: "gpt-4o",
    activeProvider: "openai",
    activeSmallModelMode: false,
    activeNotation: "barbeat",
    activeEnabledTools: null,
  };

  /**
   * Render the notice, diverging from the matching baseline only where asked.
   *
   * @param lock - Lock fields to override on the matching baseline
   * @param props - Settings props to override on defaultProps
   * @returns The render result
   */
  function renderNotice(
    lock: Partial<ConversationLock> = {},
    props: Partial<NoticeProps> = {},
  ) {
    return render(
      <LockedSettingsNotice
        conversationLock={{ ...matchingLock, ...lock }}
        {...defaultProps}
        {...props}
      />,
    );
  }

  /** Assert the "new conversations only" notice is on screen. */
  function expectNoticeShown(): void {
    expect(
      screen.getByText("Changes apply to new conversations only."),
    ).toBeTruthy();
  }

  it("returns null when activeModel is null", () => {
    const { container } = renderNotice({
      activeModel: null,
      activeProvider: null,
      activeSmallModelMode: null,
      activeNotation: null,
    });

    expect(container.innerHTML).toBe("");
  });

  it("returns null when locked settings match defaults", () => {
    const { container } = renderNotice();

    expect(container.innerHTML).toBe("");
  });

  it("shows notice when model diverges", () => {
    renderNotice({ activeModel: "gpt-3.5-turbo" });

    expectNoticeShown();
  });

  it("shows notice when provider diverges", () => {
    renderNotice({ activeProvider: "anthropic" });

    expectNoticeShown();
  });

  it("shows notice when small model mode diverges", () => {
    renderNotice({ activeSmallModelMode: true });

    expectNoticeShown();
    expect(screen.getByText(/small model mode/)).toBeTruthy();
  });

  it("shows large model mode when activeSmallModelMode is false but settings has true", () => {
    renderNotice({}, { smallModelMode: true });

    expect(screen.getByText(/large model mode/)).toBeTruthy();
  });

  it("shows both model and small model mode when both diverge", () => {
    renderNotice({ activeModel: "gpt-3.5-turbo", activeSmallModelMode: true });

    expectNoticeShown();
  });

  it("shows notice when notation diverges", () => {
    renderNotice({ activeNotation: "stark" });

    expectNoticeShown();
    expect(screen.getByText(/Stark notation/)).toBeTruthy();
  });

  it("stays quiet about notation for a conversation that locked none", () => {
    // A record saved before notation was locked has nothing to compare against,
    // so claiming a divergence would be inventing one.
    const { container } = renderNotice(
      { activeNotation: null },
      { notation: "stark" },
    );

    expect(container.innerHTML).toBe("");
  });

  it("reports a toolset that has moved since the conversation connected", () => {
    renderNotice(
      { activeEnabledTools: { "ppal-library": false } },
      { enabledTools: { "ppal-library": true } },
    );

    // Pinned like the rest, so it reads as one of the settings the running
    // conversation is using — not as a special case with its own timing.
    expect(screen.getByText(/Current conversation uses/)).toBeTruthy();
    expect(screen.getByText(/different set of tools/)).toBeTruthy();
  });

  it("ignores a toolset that only spells out the defaults", () => {
    // Absent means enabled, so a record that lists every tool as true matches a
    // settings map that lists none of them. Reporting that as a change would
    // make the notice permanent for anyone who has never touched the Tools tab.
    const { container } = renderNotice({
      activeEnabledTools: { "ppal-read-clip": true, "ppal-library": true },
    });

    expect(container.innerHTML).toBe("");
  });

  it("stays quiet about tools for a conversation that locked none", () => {
    // A record saved before the toolset was locked reconnects on the current
    // selection, so there is no divergence to report — same as the notation case.
    const { container } = renderNotice(
      {},
      { enabledTools: { "ppal-library": false } },
    );

    expect(container.innerHTML).toBe("");
  });

  it("reports the Direct Live API tool in both directions", () => {
    // Its checkbox flips the device flag instead of writing a map entry, so
    // without the stamp the pinned-on/now-off case reads as "absent = enabled"
    // on the settings side and the notice misses it.
    for (const [pinned, liveApiEnabled] of [
      [true, false],
      [false, true],
    ] as const) {
      const { unmount } = renderNotice(
        { activeEnabledTools: { [LIVE_API_TOOL_ID]: pinned } },
        { liveApiEnabled },
      );

      expect(screen.getByText(/different set of tools/)).toBeTruthy();
      unmount();
    }
  });

  it("stays quiet when the pinned Live API state still matches the flag", () => {
    const { container } = renderNotice(
      { activeEnabledTools: { [LIVE_API_TOOL_ID]: true } },
      { liveApiEnabled: true },
    );

    expect(container.innerHTML).toBe("");
  });

  it("lists the pinned settings alongside the tools line when both diverge", () => {
    renderNotice({
      activeModel: "gpt-3.5-turbo",
      activeEnabledTools: { "ppal-library": false },
    });

    expect(screen.getByText(/Current conversation uses/)).toBeTruthy();
    expect(screen.getByText(/different set of tools/)).toBeTruthy();
  });

  it("uses provider from settings when activeProvider is null", () => {
    renderNotice({ activeModel: "different-model", activeProvider: null });

    expectNoticeShown();
  });
});
