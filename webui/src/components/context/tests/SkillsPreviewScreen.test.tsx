// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillsPreviewScreen } from "#webui/components/context/skills/SkillsPreviewScreen";
import { installClipboardMock } from "#webui/test-utils/clipboard-test-helpers";

const CONFIG_URL = "http://localhost:3000/config";

/** Preview response fields beyond the blob itself. */
interface PreviewExtras {
  warnings?: string[];
  dropped?: string[];
}

const TAB_SLOT = <div data-testid="tabs">tabs</div>;
const VIEW_SLOT = <div data-testid="view-toggle">toggle</div>;

/**
 * A 200 JSON Response.
 * @param body - Response body serialized as JSON
 * @returns A Response instance
 */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Stub `fetch` to route /config and /skills-preview. The preview echoes the
 * requested combination so assertions can key off the selected values.
 * @param config - Live config to return, or "fail" for a non-ok response
 * @param preview - "ok" echoes the combo; "fail" returns a non-ok response
 * @param extras - Extra preview fields (assembly warnings, gated-out fragments)
 * @returns The fetch mock
 */
function stubFetch(
  config: { notation: string; smallModelMode: boolean } | "fail",
  preview: "ok" | "fail" = "ok",
  extras: PreviewExtras = {},
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: unknown) => {
    const url = String(input);

    if (url.startsWith(CONFIG_URL)) {
      return config === "fail"
        ? Promise.resolve(new Response("no", { status: 500 }))
        : Promise.resolve(jsonResponse(config));
    }

    if (preview === "fail") {
      return Promise.resolve(new Response("no", { status: 500 }));
    }

    const params = new URL(url).searchParams;
    const notation = params.get("notation");
    const small = params.get("smallModel") === "true";

    return Promise.resolve(
      jsonResponse({
        head: notation,
        driver: small ? "basic" : "standard",
        skills: `S:${notation}:${small}`,
        warnings: extras.warnings ?? [],
        dropped: extras.dropped ?? [],
      }),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

/**
 * Stub `fetch` and render the screen with the standard slots.
 * @param config - Live config to return, or "fail" for a non-ok response
 * @param preview - "ok" echoes the combo; "fail" returns a non-ok response
 * @param extras - Extra preview fields (assembly warnings, gated-out fragments)
 * @returns The fetch mock
 */
function renderPreview(
  config?: { notation: string; smallModelMode: boolean } | "fail",
  preview: "ok" | "fail" = "ok",
  extras: PreviewExtras = {},
): ReturnType<typeof vi.fn> {
  const fetchMock = stubFetch(
    config ?? { notation: "barbeat", smallModelMode: false },
    preview,
    extras,
  );

  render(<SkillsPreviewScreen tabSlot={TAB_SLOT} viewSlot={VIEW_SLOT} />);

  return fetchMock;
}

describe("SkillsPreviewScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the header note, the active slots, and the blob size", async () => {
    renderPreview();

    expect(screen.getByText("Read-only preview")).toBeTruthy();

    await waitFor(() => {
      expect(
        screen.getByText(/Driver: standard · Notation: barbeat/),
      ).toBeTruthy();
    });

    // "S:barbeat:false" is 15 chars → ceil(15/4) = 4 tokens.
    expect(screen.getByText(/15 chars · ≈4 tokens/)).toBeTruthy();
    expect(screen.getByTestId("view-toggle")).toBeTruthy();
  });

  it("badges the combination that matches the live settings", async () => {
    renderPreview();

    await waitFor(() => {
      expect(screen.getByText("★ Current settings")).toBeTruthy();
    });
  });

  it("drops the live badge and refetches when the notation changes", async () => {
    renderPreview();

    await waitFor(() => {
      expect(screen.getByText("★ Current settings")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Preview notation"), {
      target: { value: "stark" },
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Driver: standard · Notation: stark/),
      ).toBeTruthy();
    });
    expect(screen.queryByText("★ Current settings")).toBeNull();
  });

  it("refetches the small-model core when the model size changes", async () => {
    renderPreview();

    await waitFor(() => {
      expect(
        screen.getByText(/Driver: standard · Notation: barbeat/),
      ).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Preview model size"), {
      target: { value: "small" },
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Driver: basic · Notation: barbeat/),
      ).toBeTruthy();
    });
  });

  it("does not refetch when the live mode already matches the selection", async () => {
    // The live config equals the default selection. Adopting it must not re-run
    // the preview effect (which flashes the loading state and refetches an
    // identical blob, and could clobber a mid-flight interaction like a copy).
    const fetchMock = renderPreview({
      notation: "barbeat",
      smallModelMode: false,
    });

    await waitFor(() => {
      expect(screen.getByText("★ Current settings")).toBeTruthy();
    });
    // Flush any effect the config resolution might have queued.
    await act(async () => {
      await Promise.resolve();
    });

    const previewCalls = fetchMock.mock.calls.filter(
      ([input]) => !String(input).startsWith(CONFIG_URL),
    );

    expect(previewCalls).toHaveLength(1);
  });

  it("surfaces override assembly warnings above the blob", async () => {
    renderPreview({ notation: "barbeat", smallModelMode: false }, "ok", {
      warnings: [`skills include names an unknown fragment: "core-devices"`],
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(
      screen.getByText(/This override didn't fully assemble/),
    ).toBeTruthy();
    expect(screen.getByText(/unknown fragment/)).toBeTruthy();
  });

  it("names the fragments the toolset left out", async () => {
    renderPreview({ notation: "barbeat", smallModelMode: false }, "ok", {
      dropped: ["library", "devices"],
    });

    await waitFor(() => {
      expect(screen.getByText(/no enabled tool uses them/)).toBeTruthy();
    });
    expect(screen.getByText("library, devices")).toBeTruthy();
  });

  it("gates on the enabled tools until the checkbox is cleared", async () => {
    const fetchMock = renderPreview();

    await waitFor(() => {
      expect(screen.getByText(/Driver: standard/)).toBeTruthy();
    });

    const checkbox = screen.getByLabelText(
      "Enabled tools only",
    ) as HTMLInputElement;

    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    await waitFor(() => {
      const previews = fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter((url) => !url.startsWith(CONFIG_URL));

      expect(previews.at(-1)).toContain("allTools=true");
    });
  });

  it("says nothing about gating when the toolset dropped nothing", async () => {
    renderPreview();

    await waitFor(() => {
      expect(screen.getByText(/Driver: standard/)).toBeTruthy();
    });
    expect(screen.queryByText(/no enabled tool uses them/)).toBeNull();
  });

  it("shows no warning banner when the blob assembled cleanly", async () => {
    renderPreview();

    await waitFor(() => {
      expect(screen.getByText(/Driver: /)).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error when the preview request fails", async () => {
    renderPreview("fail", "fail");

    await waitFor(() => {
      expect(screen.getByText(/Skills preview failed/)).toBeTruthy();
    });
  });

  describe("copy", () => {
    const writeText = installClipboardMock();

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("copies the assembled blob to the clipboard", async () => {
      renderPreview();

      await waitFor(() => {
        expect(screen.getByText("Copy")).toBeTruthy();
      });

      fireEvent.click(screen.getByText("Copy"));

      expect(writeText).toHaveBeenCalledWith("S:barbeat:false");
      // The button confirms the copy by flipping its label.
      expect(await screen.findByText("Copied")).toBeTruthy();
    });
  });
});
