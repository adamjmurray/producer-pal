// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { VersionDisplay } from "./VersionDisplay";

describe("VersionDisplay", () => {
  it("renders current version", () => {
    render(<VersionDisplay version="1.2.3" update={null} />);
    expect(screen.getByText("v1.2.3")).toBeDefined();
  });

  it("does not show update link when up to date", () => {
    render(<VersionDisplay version="1.2.3" update={null} />);
    expect(screen.queryByText("(update)")).toBeNull();
  });

  it("shows the build on hover when known", () => {
    render(<VersionDisplay version="1.2.3" build="1a2b3c4" update={null} />);
    expect(screen.getByText("v1.2.3").getAttribute("title")).toBe(
      "Build 1a2b3c4",
    );
  });

  it("omits the build tooltip when unknown", () => {
    render(<VersionDisplay version="1.2.3" update={null} />);
    expect(screen.getByText("v1.2.3").getAttribute("title")).toBeNull();
  });

  it("shows update link when newer version is available", () => {
    render(<VersionDisplay version="1.2.3" update={{ version: "1.3.0" }} />);
    const link = screen.getByText("(update)");

    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toContain("upgrading");
    expect(link.getAttribute("title")).toContain("v1.3.0 available");
  });

  it("stops propagation on update link click", () => {
    let parentClicked = false;

    render(
      <div onClick={() => (parentClicked = true)}>
        <VersionDisplay version="1.2.3" update={{ version: "1.3.0" }} />
      </div>,
    );
    fireEvent.click(screen.getByText("(update)"));
    expect(parentClicked).toBe(false);
  });
});
