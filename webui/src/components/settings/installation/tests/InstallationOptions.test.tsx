// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { InstallationOptions } from "#webui/components/settings/installation/InstallationOptions";
import { FINISH_INSTALLATION_DOCS_URL } from "#webui/lib/config";

describe("InstallationOptions", () => {
  const fetchMock = installFetchMock();

  const warn = (): HTMLInputElement =>
    screen.getByTestId("warn-install-incomplete") as HTMLInputElement;
  const updates = (): HTMLInputElement =>
    screen.getByTestId("auto-update-check") as HTMLInputElement;

  it("starts with both boxes checked, and links to what finishing means", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<InstallationOptions />);

    expect(warn().checked).toBe(true);
    expect(updates().checked).toBe(true);
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveProperty(
      "href",
      FINISH_INSTALLATION_DOCS_URL,
    );
  });

  it("shows what the server has stored", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ autoUpdateCheck: false, warnIfInstallIncomplete: false }),
    );
    render(<InstallationOptions />);

    await waitForHookState(() => {
      expect(warn().checked).toBe(false);
    });
    expect(updates().checked).toBe(false);
  });

  it("writes each box as it is toggled", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    render(<InstallationOptions />);

    fireEvent.click(warn());
    fireEvent.click(updates());

    await waitForHookState(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/settings"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ warnIfInstallIncomplete: false }),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/settings"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ autoUpdateCheck: false }),
        }),
      );
    });
  });
});
