// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { SubscriptionHint } from "#webui/components/settings/helpers/SubscriptionHint";
import { SUBSCRIPTION_INSTALL_DOCS_URL } from "#webui/lib/config";

describe("SubscriptionHint", () => {
  it("links to the subscription install paths before chat is set up", () => {
    render(<SubscriptionHint chatSetUp={false} />);

    const link = screen.getByRole("link", { name: /AI subscription/ });

    expect(link.getAttribute("href")).toBe(SUBSCRIPTION_INSTALL_DOCS_URL);
  });

  it("shows nothing once chat is set up", () => {
    render(<SubscriptionHint chatSetUp />);

    expect(screen.queryByTestId("subscription-hint")).toBeNull();
  });
});
