// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { InstallationTabHarness } from "#webui/components/settings/installation/tests/helpers/InstallationTabHarness";
import { type DeviceInstallStatus } from "#webui/hooks/settings/installation/use-device-install";
import {
  deviceStatusBody,
  routeInstallationFetch,
} from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";

describe("InstallationTab device card", () => {
  const fetchMock = installFetchMock();
  let routes: ReturnType<typeof routeInstallationFetch>;

  beforeEach(() => {
    routes = routeInstallationFetch(fetchMock);
  });

  /**
   * Render the tab past the device's mount read.
   * @param overrides - Status fields to change
   * @returns The device card
   */
  async function renderCard(
    overrides: Partial<DeviceInstallStatus> = {},
  ): Promise<HTMLElement> {
    routes.device(jsonResponse(deviceStatusBody(overrides)));
    render(<InstallationTabHarness />);
    await waitForHookState(() => {
      expect(screen.queryByTestId("device-loading")).toBeNull();
    });

    return screen.getByTestId("device-section");
  }

  const icon = (card: HTMLElement): string | null =>
    within(card).getByTestId("status-icon").getAttribute("data-kind");

  it("is labelled by its title", async () => {
    const card = await renderCard();

    expect(card.tagName).toBe("SECTION");
    expect(screen.getByRole("region", { name: "Max for Live device" })).toBe(
      card,
    );
  });

  it("warns, and offers Copy, when the User Library has no copy", async () => {
    const card = await renderCard();

    expect(icon(card)).toBe("warning");
    expect(within(card).getByTestId("device-status").textContent).toBe(
      "Not in your User Library",
    );
    expect(within(card).getByTestId("device-install").textContent).toBe("Copy");
    // Nothing to swap to yet.
    expect(within(card).queryByTestId("device-swap")).toBeNull();
  });

  it("describes what the card is for", async () => {
    const card = await renderCard();

    expect(card.textContent).toContain(
      "Add Producer Pal to your User Library so the remote script can load it.",
    );
  });

  it("puts the install button beside the title", async () => {
    const card = await renderCard();
    const install = within(card).getByTestId("device-install");

    expect(
      install.parentElement?.contains(within(card).getByRole("heading")),
    ).toBe(true);
  });

  it("shows a check, with no button or swap, once the device is the copy", async () => {
    const card = await renderCard({
      state: "same",
      installedVersion: "1.2.0",
      inUserLibrary: true,
    });

    expect(icon(card)).toBe("done");
    expect(within(card).getByTestId("device-status").textContent).toBe(
      "In your User Library (v1.2.0)",
    );
    expect(within(card).queryByTestId("device-install")).toBeNull();
    expect(within(card).queryByTestId("device-swap")).toBeNull();
  });

  it("names the update for an older copy", async () => {
    const card = await renderCard({
      state: "installed-older",
      installedVersion: "1.1.0",
    });

    expect(within(card).getByTestId("device-status").textContent).toBe(
      "Update available: v1.1.0 → v1.2.0",
    );
    expect(within(card).getByTestId("device-install").textContent).toBe(
      "Update copy",
    );
  });

  it("offers the swap as a line under the status when the Set uses another copy", async () => {
    const card = await renderCard({
      state: "same",
      installedVersion: "1.2.0",
      swap: { allowed: true, reason: null },
    });

    expect(icon(card)).toBe("warning");
    expect(within(card).getByTestId("device-swap-note").textContent).toBe(
      "This Set uses a copy from elsewhere.",
    );
    expect(
      (within(card).getByTestId("device-swap") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("keeps the warning icon, with no button, when the device can't be read", async () => {
    const card = await renderCard({
      source: null,
      problem: "unknown-source",
      state: null,
    });

    expect(within(card).queryByTestId("device-install")).toBeNull();
    expect(icon(card)).toBe("warning");
  });

  it("shows an unread icon until the status lands", () => {
    routes.device(new Promise(() => {}));
    render(<InstallationTabHarness />);

    expect(icon(screen.getByTestId("device-section"))).toBe("unknown");
  });

  it("shows a development build as a disabled Copy with a note, and no swap", async () => {
    const card = await renderCard({
      problem: "not-frozen",
      state: null,
      path: null,
      swap: { allowed: true, reason: null },
    });

    expect(within(card).getByTestId("device-status").textContent).toBe(
      "Development build: freeze it to copy.",
    );
    expect(
      (within(card).getByTestId("device-install") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(within(card).queryByTestId("device-swap")).toBeNull();
    expect(within(card).queryByRole("link")).toBeNull();
    expect(icon(card)).toBe("warning");
  });
});
