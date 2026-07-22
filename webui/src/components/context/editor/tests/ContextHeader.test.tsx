// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { ContextHeader } from "#webui/components/context/editor/ContextHeader";
import { CONTEXT_DOCS_URL } from "#webui/lib/config";

const CLOSE_LABEL = "Close context editor";

describe("ContextHeader", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("shows a Documentation help link to the context guide by default", () => {
    render(
      <ContextHeader
        title="Project Context"
        closeAriaLabel={CLOSE_LABEL}
        onClose={() => {}}
      />,
    );

    const link = screen.getByTitle("Documentation");

    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(CONTEXT_DOCS_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("places the help link directly before the close button", () => {
    render(
      <ContextHeader
        title="Project Context"
        closeAriaLabel={CLOSE_LABEL}
        onClose={() => {}}
      />,
    );

    const link = screen.getByTitle("Documentation");
    const closeButton = screen.getByLabelText(CLOSE_LABEL);

    // The close button follows the help link in document order (help is to its
    // left in the right-hand cluster).
    expect(
      link.compareDocumentPosition(closeButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("hides the help link when help links are disabled in preferences", () => {
    localStorage.setItem("producer_pal_show_help_links", "false");

    render(
      <ContextHeader
        title="Project Context"
        closeAriaLabel={CLOSE_LABEL}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByTitle("Documentation")).toBeNull();
    // The close button still renders — only the help link is gated.
    expect(screen.getByLabelText(CLOSE_LABEL)).toBeTruthy();
  });
});
