// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { InstallationTabHarness } from "#webui/components/settings/installation/tests/helpers/InstallationTabHarness";
import { type RemoteScriptStatus } from "#webui/hooks/settings/installation/use-remote-script";
import { routeInstallationFetch } from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";
import { statusBody } from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";

const RUNNING: Partial<RemoteScriptStatus> = {
  installed: true,
  installedVersion: "1.2.0",
  running: true,
  runningVersion: "1.2.0",
};

describe("InstallationTab remote script card", () => {
  const fetchMock = installFetchMock();
  let routes: ReturnType<typeof routeInstallationFetch>;

  beforeEach(() => {
    routes = routeInstallationFetch(fetchMock);
  });

  /**
   * Render the tab past the remote script's mount read.
   * @param overrides - Status fields to change
   * @returns The remote script card
   */
  async function renderCard(
    overrides: Partial<RemoteScriptStatus> = {},
  ): Promise<HTMLElement> {
    routes.remote(jsonResponse(statusBody(overrides)));
    render(<InstallationTabHarness />);
    await waitForHookState(() => screen.getByTestId("remote-script-status"));

    return screen.getByTestId("remote-script-section");
  }

  const icon = (card: HTMLElement): string | null =>
    within(card).getByTestId("status-icon").getAttribute("data-kind");
  const statusClass = (): string =>
    screen.getByTestId("remote-script-status").className;

  it("is labelled by its title and says what the script is for", async () => {
    const card = await renderCard();

    expect(screen.getByRole("region", { name: "Remote script" })).toBe(card);
    expect(card.textContent).toContain(
      "Adds clip automation, undo, and loading plug-ins and device presets.",
    );
    expect(within(card).getByRole("link", { name: "Learn more" })).toBeTruthy();
  });

  it("is done and green when Live runs the installed version", async () => {
    const card = await renderCard(RUNNING);

    expect(icon(card)).toBe("done");
    expect(statusClass()).toContain("text-green-700");
  });

  it("collapses the steps under 'Setup steps' while it runs", async () => {
    const card = await renderCard(RUNNING);
    const steps = within(card).getByTestId("remote-script-steps");

    expect(steps.tagName).toBe("DETAILS");
    expect((steps as HTMLDetailsElement).open).toBe(false);
    expect(within(steps).getByText("Setup steps")).toBeTruthy();
    expect(within(card).queryByText("Check again")).toBeNull();
    // Refresh stays available for a status that changes later.
    expect(within(card).getByTestId("remote-script-refresh").textContent).toBe(
      "Refresh",
    );
  });

  it("is amber with a waiting icon, and expands the steps, when installed but not running", async () => {
    const card = await renderCard({
      installed: true,
      installedVersion: "1.2.0",
    });

    expect(icon(card)).toBe("waiting");
    expect(statusClass()).toContain("text-amber-700");

    const steps = within(card).getByTestId("remote-script-steps");

    expect(steps.tagName).toBe("DIV");
    expect(within(steps).getByText("Enable it in Live")).toBeTruthy();
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(steps).getByText("Turns green once Live loads it."),
    ).toBeTruthy();
    expect(within(steps).queryByTestId("remote-script-restart")).toBeNull();
  });

  it("checks again with the same refresh", async () => {
    const card = await renderCard({
      installed: true,
      installedVersion: "1.2.0",
    });
    const check = within(card).getByTestId("remote-script-refresh");

    expect(check.textContent).toBe("Check again");
    expect(within(card).getAllByTestId("remote-script-refresh")).toHaveLength(
      1,
    );

    routes.remote(jsonResponse(statusBody(RUNNING)));
    fireEvent.click(check);

    await waitForHookState(() => {
      expect(icon(card)).toBe("done");
    });
  });

  it("is amber with a warning when Live runs another copy", async () => {
    const card = await renderCard({ ...RUNNING, runningVersion: "1.1.0" });

    expect(icon(card)).toBe("warning");
    expect(statusClass()).toContain("text-amber-700");
    expect(within(card).getByTestId("remote-script-steps").tagName).toBe("DIV");
  });

  it("stays plain, with a warning, when it isn't installed", async () => {
    const card = await renderCard();

    expect(icon(card)).toBe("warning");
    expect(statusClass()).not.toMatch(/text-(amber|green)/);
    expect(within(card).queryByTestId("remote-script-steps")).toBeNull();
  });

  it("stays plain, with a warning, when an update is waiting", async () => {
    const card = await renderCard({ ...RUNNING, updateAvailable: true });

    expect(icon(card)).toBe("warning");
    expect(statusClass()).not.toMatch(/text-(amber|green)/);
  });

  it("puts the install button beside the title", async () => {
    const card = await renderCard(RUNNING);
    const install = within(card).getByTestId("remote-script-install");

    expect(install.textContent).toBe("Reinstall");
    expect(
      install.parentElement?.contains(within(card).getByRole("heading")),
    ).toBe(true);
  });

  it("shows an unread icon until the status lands", () => {
    routes.remote(new Promise(() => {}));
    render(<InstallationTabHarness />);

    expect(icon(screen.getByTestId("remote-script-section"))).toBe("unknown");
  });
});
