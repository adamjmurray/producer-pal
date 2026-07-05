// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsPreviewScreen } from "#webui/components/context/skills/SkillsPreviewScreen";

const CONFIG_URL = "http://localhost:3000/config";
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
 * @param previewWarnings - Assembly warnings to include in the preview response
 * @returns The fetch mock
 */
function stubFetch(
  config: { notation: string; smallModelMode: boolean } | "fail",
  preview: "ok" | "fail" = "ok",
  previewWarnings: string[] = [],
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
        warnings: previewWarnings,
      }),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

describe("SkillsPreviewScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the header note, active fragments, and the blob size", async () => {
    stubFetch({ notation: "barbeat", smallModelMode: false });

    render(<SkillsPreviewScreen tabSlot={TAB_SLOT} viewSlot={VIEW_SLOT} />);

    expect(screen.getByText("Read-only preview")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/Fragments: standard \+ barbeat/)).toBeTruthy();
    });

    // "S:barbeat:false" is 15 chars → ceil(15/4) = 4 tokens.
    expect(screen.getByText(/15 chars · ≈4 tokens/)).toBeTruthy();
    expect(screen.getByTestId("view-toggle")).toBeTruthy();
  });

  it("badges the combination that matches the live settings", async () => {
    stubFetch({ notation: "barbeat", smallModelMode: false });

    render(<SkillsPreviewScreen tabSlot={TAB_SLOT} viewSlot={VIEW_SLOT} />);

    await waitFor(() => {
      expect(screen.getByText("★ Current settings")).toBeTruthy();
    });
  });

  it("drops the live badge and refetches when the notation changes", async () => {
    stubFetch({ notation: "barbeat", smallModelMode: false });

    render(<SkillsPreviewScreen tabSlot={TAB_SLOT} viewSlot={VIEW_SLOT} />);

    await waitFor(() => {
      expect(screen.getByText("★ Current settings")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Preview notation"), {
      target: { value: "stark" },
    });

    await waitFor(() => {
      expect(screen.getByText(/Fragments: standard \+ stark/)).toBeTruthy();
    });
    expect(screen.queryByText("★ Current settings")).toBeNull();
  });

  it("refetches the small-model core when the model size changes", async () => {
    stubFetch({ notation: "barbeat", smallModelMode: false });

    render(<SkillsPreviewScreen tabSlot={TAB_SLOT} viewSlot={VIEW_SLOT} />);

    await waitFor(() => {
      expect(screen.getByText(/Fragments: standard \+ barbeat/)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Preview model size"), {
      target: { value: "small" },
    });

    await waitFor(() => {
      expect(screen.getByText(/Fragments: basic \+ barbeat/)).toBeTruthy();
    });
  });

  it("surfaces override assembly warnings above the blob", async () => {
    stubFetch({ notation: "barbeat", smallModelMode: false }, "ok", [
      "skills include cycle refused: standard → standard",
    ]);

    render(<SkillsPreviewScreen tabSlot={TAB_SLOT} viewSlot={VIEW_SLOT} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(
      screen.getByText(/This override didn't fully assemble/),
    ).toBeTruthy();
    expect(screen.getByText(/cycle refused/)).toBeTruthy();
  });

  it("shows no warning banner when the blob assembled cleanly", async () => {
    stubFetch({ notation: "barbeat", smallModelMode: false });

    render(<SkillsPreviewScreen tabSlot={TAB_SLOT} viewSlot={VIEW_SLOT} />);

    await waitFor(() => {
      expect(screen.getByText(/Fragments:/)).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error when the preview request fails", async () => {
    stubFetch("fail", "fail");

    render(<SkillsPreviewScreen tabSlot={TAB_SLOT} viewSlot={VIEW_SLOT} />);

    await waitFor(() => {
      expect(screen.getByText(/Skills preview failed/)).toBeTruthy();
    });
  });

  describe("copy", () => {
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      writeText = vi.fn();
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("copies the assembled blob to the clipboard", async () => {
      stubFetch({ notation: "barbeat", smallModelMode: false });

      render(<SkillsPreviewScreen tabSlot={TAB_SLOT} viewSlot={VIEW_SLOT} />);

      await waitFor(() => {
        expect(screen.getByText("Copy")).toBeTruthy();
      });

      fireEvent.click(screen.getByText("Copy"));

      expect(writeText).toHaveBeenCalledWith("S:barbeat:false");
    });
  });
});
