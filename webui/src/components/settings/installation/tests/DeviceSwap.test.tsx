// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { InstallationTabHarness } from "#webui/components/settings/installation/tests/helpers/InstallationTabHarness";
import {
  deviceStatusBody,
  routeInstallationFetch,
} from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";
import { USER_LIBRARY } from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";
import { type DeviceInstallStatus } from "#webui/hooks/settings/installation/use-device-install";
import {
  POLL_MS,
  SWAP_TIMED_OUT,
  SWAP_TIMEOUT_MS,
} from "#webui/hooks/settings/installation/use-device-swap";

const SWAPPABLE: Partial<DeviceInstallStatus> = {
  state: "same",
  installedVersion: "1.2.0",
  swap: { allowed: true, reason: null },
};

const NEW_DEVICE = deviceStatusBody({ inUserLibrary: true, state: "same" });

describe("InstallationTab device swap", () => {
  const fetchMock = installFetchMock();
  let routes: ReturnType<typeof routeInstallationFetch>;

  beforeEach(() => {
    vi.useFakeTimers();
    routes = routeInstallationFetch(fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * @param ms - How long to let timers and requests run
   */
  async function pass(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  /**
   * Render the tab past its mount reads.
   *
   * @param overrides - Device status fields to change
   */
  async function renderTab(
    overrides: Partial<DeviceInstallStatus> = {},
  ): Promise<void> {
    routes.device(jsonResponse(deviceStatusBody(overrides)));
    render(<InstallationTabHarness />);
    await pass(0);
  }

  const button = (): HTMLButtonElement =>
    screen.getByTestId("device-swap") as HTMLButtonElement;

  it("offers the swap, as a line under the status, when the server allows it", async () => {
    await renderTab(SWAPPABLE);

    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe("Swap");
    expect(screen.getByTestId("device-swap-note").textContent).toBe(
      "This Set uses a copy from elsewhere.",
    );
  });

  it("shows the server's reason, and a disabled button, when it doesn't", async () => {
    await renderTab({
      state: "same",
      swap: { allowed: false, reason: "The remote script isn't running." },
    });

    expect(button().disabled).toBe(true);
    expect(screen.getByTestId("device-swap-note").textContent).toBe(
      "The remote script isn't running.",
    );
  });

  it("falls back to a generic note when the server gave no reason", async () => {
    await renderTab({ state: "same", swap: { allowed: false, reason: null } });

    expect(screen.getByTestId("device-swap-note").textContent).toBe(
      "The swap isn't available.",
    );
  });

  it("offers nothing when this device is already the User Library copy", async () => {
    await renderTab({ ...SWAPPABLE, inUserLibrary: true });

    expect(screen.queryByTestId("device-swap")).toBeNull();
  });

  it("offers nothing before there is a copy to swap to", async () => {
    await renderTab({ swap: { allowed: false, reason: "Install it first." } });

    expect(screen.queryByTestId("device-swap")).toBeNull();
  });

  it("offers nothing for a development build", async () => {
    await renderTab({
      ...SWAPPABLE,
      problem: "not-frozen",
      state: null,
      path: null,
    });

    expect(screen.queryByTestId("device-swap")).toBeNull();
  });

  it("offers nothing before the device has said where it is", async () => {
    await renderTab({ source: null, problem: "unknown-source", state: null });

    expect(screen.queryByTestId("device-swap")).toBeNull();
  });

  it("disables the swap for a typed path the status doesn't describe", async () => {
    await renderTab(SWAPPABLE);

    fireEvent.input(screen.getByTestId("user-library-path"), {
      target: { value: "/elsewhere" },
    });
    await pass(0);

    expect(button().disabled).toBe(true);
    expect(screen.getByTestId("device-swap-note").textContent).toContain(
      "detected User Library",
    );
  });

  it("waits, with the button gone, when the connection drops as the old device dies", async () => {
    await renderTab(SWAPPABLE);

    // The POST: this server dies mid-swap and never answers it.
    routes.device(new TypeError("Failed to fetch"));
    fireEvent.click(button());
    await pass(0);

    expect(screen.getByTestId("device-swap-waiting")).toBeTruthy();
    expect(screen.queryByTestId("device-swap")).toBeNull();
  });

  it("confirms the swap, and says to save the Set, once the new device answers", async () => {
    await renderTab(SWAPPABLE);

    routes.device(
      jsonResponse({ swapping: true, confirmed: true }),
      jsonResponse(NEW_DEVICE),
      // The re-read after the swap.
      jsonResponse(NEW_DEVICE),
    );
    fireEvent.click(button());
    await pass(0);

    expect(screen.getByTestId("device-swap-waiting")).toBeTruthy();

    await pass(POLL_MS);

    expect(screen.getByTestId("device-swap-done").textContent).toContain(
      "Save your Live Set",
    );
    expect(screen.getByTestId("device-swap-new-chat-hint").textContent).toBe(
      "Start a new chat so it picks up the new version.",
    );
    expect(screen.queryByTestId("device-swap")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/device-install/swap"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userLibrary: USER_LIBRARY }),
      }),
    );
  });

  it("shows the server's reason and keeps the button when the swap is refused", async () => {
    await renderTab(SWAPPABLE);

    routes.device(
      new Response(
        JSON.stringify({ error: "Producer Pal isn't in this Live Set" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );
    fireEvent.click(button());
    await pass(0);

    expect(screen.getByTestId("device-swap-error").textContent).toBe(
      "Producer Pal isn't in this Live Set",
    );
    expect(button().disabled).toBe(false);
  });

  it("says so, and offers the swap again, when no new device ever answers", async () => {
    await renderTab(SWAPPABLE);

    routes.device(jsonResponse({ swapping: true, confirmed: false }));
    fireEvent.click(button());
    await pass(SWAP_TIMEOUT_MS + POLL_MS);

    expect(screen.getByTestId("device-swap-error").textContent).toBe(
      SWAP_TIMED_OUT,
    );
    expect(button().disabled).toBe(false);
  });
});
