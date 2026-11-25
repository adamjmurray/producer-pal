// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import {
  deferred,
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { useNetworkAccess } from "#webui/hooks/settings/installation/use-network-access";

describe("useNetworkAccess when the tab closes during the first read", () => {
  const fetchMock = installFetchMock();

  it.each([
    { what: "a usable answer", body: { allowNetwork: true } },
    { what: "an unusable answer", body: {} },
  ])("takes $what as saying nothing about the server", async ({ body }) => {
    const read = deferred<Response>();

    fetchMock.mockReturnValueOnce(read.promise);

    const { result, unmount } = renderHook(() => useNetworkAccess());

    unmount();

    await act(async () => {
      read.resolve(jsonResponse(body));
      await read.promise;
    });

    expect(result.current.allowNetwork).toBeNull();
    expect(result.current.loadFailed).toBe(false);
  });
});
