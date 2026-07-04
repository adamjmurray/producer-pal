// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCustomSkillsCollection } from "#webui/hooks/context/use-custom-skills-collection";
import { jsonResponse } from "./doc-memory-transport-test-helpers";

// happy-dom origin is http://localhost:3000/, so the endpoints resolve there.
// The collection machinery itself is covered by use-memory-collection.test; this
// verifies the custom-skills binding hits the right endpoints and round-trips
// the enabled flag.
const LIST_URL = "http://localhost:3000/custom-skills";
const ENTRY_URL = "http://localhost:3000/custom-skills/jazz-voicings";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCustomSkillsCollection", () => {
  it("loads skills from the /custom-skills endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        entries: [
          {
            name: "jazz-voicings",
            description: "rich",
            enabled: true,
            body: "b",
          },
        ],
      }),
    );

    const { result } = renderHook(useCustomSkillsCollection);

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    expect(fetchMock).toHaveBeenCalledWith(LIST_URL, { cache: "no-store" });
    expect(
      result.current.status.kind === "ready" &&
        result.current.status.entries[0]?.enabled,
    ).toBe(true);
  });

  it("PUTs a saved skill (with its enabled flag) to the per-entry endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ entries: [] }));

    const { result } = renderHook(useCustomSkillsCollection);

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    const input = { description: "rich", content: "b", enabled: false };

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ entry: { name: "jazz-voicings", ...input } }),
    );

    await act(async () => {
      await result.current.saveEntry("jazz-voicings", input);
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      ENTRY_URL,
      expect.objectContaining({ method: "PUT", body: JSON.stringify(input) }),
    );
  });
});
