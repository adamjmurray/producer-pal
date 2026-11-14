// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { stubConfirm } from "#webui/hooks/context/tests/editor-state/use-context-editor-state-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { NetworkAccessOption } from "#webui/components/settings/installation/InstallationOptions";

const THIS_COMPUTER_ONLY =
  "Couldn't change it, so only this computer can connect.";

describe("NetworkAccessOption", () => {
  const fetchMock = installFetchMock();

  const box = (): HTMLInputElement =>
    screen.getByTestId("allow-network") as HTMLInputElement;
  const message = (): string | undefined =>
    screen.getByTestId("allow-network-message").textContent || undefined;
  const puts = (): unknown[] =>
    fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT")
      .map(([url, init]) => [url, (init as RequestInit).body]);

  /**
   * Queue the page's first read, then the answer to the change it will make.
   * @param shown - What the first read reports
   * @param answer - The change's response, or the error it fails with
   */
  function serve(shown: boolean, answer?: Response | Error): void {
    fetchMock.mockResolvedValueOnce(jsonResponse({ allowNetwork: shown }));

    if (answer instanceof Error) {
      fetchMock.mockRejectedValueOnce(answer);
    } else if (answer != null) {
      fetchMock.mockResolvedValueOnce(answer);
    }
  }

  /**
   * Render, wait for the first read, and click the box.
   */
  async function renderAndClick(): Promise<void> {
    render(<NetworkAccessOption />);
    await waitForHookState(() => {
      expect(box().disabled).toBe(false);
    });
    fireEvent.click(box());
  }

  /** Wait for the box to turn off. */
  async function untilBoxOff(): Promise<void> {
    await waitForHookState(() => {
      expect(box().checked).toBe(false);
    });
  }

  /**
   * Make the page look like it was opened at `host`.
   * @param host - Host and port of the page
   */
  function openedAt(host: string): void {
    const [hostname, port] = host.split(":");

    vi.stubGlobal("location", { host, hostname, port, protocol: "http:" });
  }

  it("labels the section and the box for what they do", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<NetworkAccessOption />);

    expect(
      screen.getByRole("heading", { name: "Remote Control" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Allow other computers to connect")).toBe(
      box(),
    );
  });

  it("warns in amber that anyone on the network gets control, with no password", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<NetworkAccessOption />);

    const warning = screen.getByText(
      /Warning: anyone on that network can control Live/,
    );

    expect(warning.textContent).toMatch(/there's no password/);
    expect(warning.className).toContain("text-amber-700");
    expect(warning.className).toContain("dark:text-amber-300");
    expect(box().getAttribute("aria-describedby")).toContain(
      "allow-network-warning",
    );
    expect(
      document.getElementById("allow-network-warning")?.contains(warning),
    ).toBe(true);
  });

  it("waits for the server before it can be changed", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<NetworkAccessOption />);

    expect(box().disabled).toBe(true);
  });

  it("says nothing while the first read is in flight", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<NetworkAccessOption />);

    expect(screen.queryByTestId("allow-network-unavailable")).toBeNull();
  });

  it("says so only when the server can't be read", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<NetworkAccessOption />);

    const note = await screen.findByTestId("allow-network-unavailable");

    expect(note.textContent).toMatch(/Switch to another tab and back/);
    expect(box().disabled).toBe(true);
  });

  it("ties the warning and hints to the box", async () => {
    openedAt("192.168.1.20:3350");
    serve(false);
    render(<NetworkAccessOption />);

    await screen.findByTestId("allow-network-blocked");

    const ids = (box().getAttribute("aria-describedby") ?? "").split(" ");

    expect(ids).toStrictEqual([
      "allow-network-warning",
      "allow-network-blocked",
    ]);
    expect(ids.every((id) => document.getElementById(id) != null)).toBe(true);
  });

  it("has its status region in place before any message", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<NetworkAccessOption />);

    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("shows what the server reports", async () => {
    serve(true);
    render(<NetworkAccessOption />);

    await waitForHookState(() => {
      expect(box().checked).toBe(true);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/network-access"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("shows the state the server reports after a change, not the request", async () => {
    serve(
      false,
      jsonResponse({ allowNetwork: false, message: THIS_COMPUTER_ONLY }),
    );
    await renderAndClick();

    await waitForHookState(() => {
      expect(message()).toBe(THIS_COMPUTER_ONLY);
    });
    expect(box().checked).toBe(false);
    expect(puts()).toStrictEqual([
      [expect.stringContaining("/network-access"), '{"allowNetwork":true}'],
    ]);
  });

  it("turns on when the server reports it on", async () => {
    serve(false, jsonResponse({ allowNetwork: true }));
    await renderAndClick();

    await waitForHookState(() => {
      expect(box().checked).toBe(true);
    });
    expect(message()).toBeUndefined();
  });

  it("shows the server's message on a refusal and keeps the old value", async () => {
    serve(
      false,
      new Response(
        JSON.stringify({ error: "Only from the computer running Live." }),
        { status: 403 },
      ),
    );
    await renderAndClick();

    await waitForHookState(() => {
      expect(message()).toBe("Only from the computer running Live.");
    });
    expect(box().checked).toBe(false);
    expect(box().disabled).toBe(false);
  });

  it("explains a failed request", async () => {
    serve(false, new Error("offline"));
    await renderAndClick();

    await waitForHookState(() => {
      expect(message()).toBe("Couldn't reach the server.");
    });
  });

  it("falls back to the status code when a refusal has no message", async () => {
    serve(false, new Response("nope", { status: 502 }));
    await renderAndClick();

    await waitForHookState(() => {
      expect(message()).toBe("The server answered 502.");
    });
  });

  it("doesn't ask before turning off on this computer", async () => {
    const confirm = stubConfirm(true);

    serve(true, jsonResponse({ allowNetwork: false }));
    await renderAndClick();

    await untilBoxOff();
    expect(confirm).not.toHaveBeenCalled();
  });

  describe("on another phone or computer", () => {
    it("can't be turned on, and says it must be done at the computer", async () => {
      openedAt("192.168.1.20:3350");
      serve(false);
      render(<NetworkAccessOption />);

      await screen.findByTestId("allow-network-blocked");
      expect(box().disabled).toBe(true);
      expect(screen.getByTestId("allow-network-blocked").textContent).toMatch(
        /only be turned on from the computer running Live/,
      );
    });

    it("warns that turning it off disconnects you, and confirms first", async () => {
      openedAt("192.168.1.20:3350");
      const confirm = stubConfirm(false);

      serve(true);
      render(<NetworkAccessOption />);
      await waitForHookState(() => {
        expect(box().checked).toBe(true);
      });
      expect(screen.getByTestId("allow-network-leaving")).toBeTruthy();

      fireEvent.click(box());

      expect(confirm).toHaveBeenCalledOnce();
      expect(puts()).toStrictEqual([]);
      expect(box().checked).toBe(true);
    });

    it("turns it off once confirmed", async () => {
      openedAt("192.168.1.20:3350");
      stubConfirm(true);
      serve(true, jsonResponse({ allowNetwork: false }));
      await renderAndClick();

      await untilBoxOff();
      expect(puts()).toStrictEqual([
        [expect.stringContaining("/network-access"), '{"allowNetwork":false}'],
      ]);
    });

    it("explains a dropped connection after asking to turn it off", async () => {
      openedAt("192.168.1.20:3350");
      stubConfirm(true);
      serve(true, new Error("dropped"));
      await renderAndClick();

      await waitForHookState(() => {
        expect(message()).toMatch(/that is expected/);
      });
    });
  });
});
