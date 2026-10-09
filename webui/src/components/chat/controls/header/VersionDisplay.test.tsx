// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { VersionDisplay } from "./VersionDisplay";

describe("VersionDisplay", () => {
  it("renders current version", () => {
    render(
      <VersionDisplay
        version="1.2.3"
        update={null}
        onDismissUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText("v1.2.3")).toBeDefined();
  });

  it("does not show update link when up to date", () => {
    render(
      <VersionDisplay
        version="1.2.3"
        update={null}
        onDismissUpdate={vi.fn()}
      />,
    );
    expect(screen.queryByText("(update)")).toBeNull();
  });

  it("shows the build on hover when known", () => {
    render(
      <VersionDisplay
        version="1.2.3"
        build="1a2b3c4"
        update={null}
        onDismissUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText("v1.2.3").getAttribute("title")).toBe(
      "Build 1a2b3c4",
    );
  });

  it("omits the build tooltip when unknown", () => {
    render(
      <VersionDisplay
        version="1.2.3"
        update={null}
        onDismissUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText("v1.2.3").getAttribute("title")).toBeNull();
  });

  it("shows update link when newer version is available", () => {
    render(
      <VersionDisplay
        version="1.2.3"
        update={{ version: "1.3.0" }}
        onDismissUpdate={vi.fn()}
      />,
    );
    const link = screen.getByText("(update)");

    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toContain("upgrading");
    expect(link.getAttribute("title")).toContain("v1.3.0 available");
  });

  it("dismisses the update notification", () => {
    const onDismissUpdate = vi.fn();

    render(
      <VersionDisplay
        version="1.2.3"
        update={{ version: "1.3.0" }}
        onDismissUpdate={onDismissUpdate}
      />,
    );
    fireEvent.click(
      screen.getByLabelText("Dismiss the v1.3.0 update notification"),
    );

    expect(onDismissUpdate).toHaveBeenCalledOnce();
  });

  it("stops propagation on update link click", () => {
    let parentClicked = false;

    render(
      <div onClick={() => (parentClicked = true)}>
        <VersionDisplay
          version="1.2.3"
          update={{ version: "1.3.0" }}
          onDismissUpdate={vi.fn()}
        />
      </div>,
    );
    fireEvent.click(screen.getByText("(update)"));
    expect(parentClicked).toBe(false);
  });

  it("shows no remote script badge when it needs nothing", () => {
    render(
      <VersionDisplay
        version="1.2.3"
        update={null}
        onDismissUpdate={vi.fn()}
        remoteScriptNotice={null}
        onOpenRemoteScriptSettings={vi.fn()}
      />,
    );
    expect(screen.queryByText("(script update)")).toBeNull();
    expect(screen.queryByText("(restart Live)")).toBeNull();
  });

  it("shows a script update badge that opens the remote script settings", () => {
    const onOpen = vi.fn();

    render(
      <VersionDisplay
        version="1.2.3"
        update={null}
        onDismissUpdate={vi.fn()}
        remoteScriptNotice="update"
        onOpenRemoteScriptSettings={onOpen}
      />,
    );
    fireEvent.click(screen.getByText("(script update)"));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("shows a restart badge that opens the remote script settings", () => {
    const onOpen = vi.fn();

    render(
      <VersionDisplay
        version="1.2.3"
        update={null}
        onDismissUpdate={vi.fn()}
        remoteScriptNotice="restart"
        onOpenRemoteScriptSettings={onOpen}
      />,
    );

    const badge = screen.getByText("(restart Live)");

    expect(badge.getAttribute("title")).toContain("Restart Live");

    fireEvent.click(badge);

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("shows the remote script badge beside the update link", () => {
    render(
      <VersionDisplay
        version="1.2.3"
        update={{ version: "1.3.0" }}
        onDismissUpdate={vi.fn()}
        remoteScriptNotice="update"
        onOpenRemoteScriptSettings={vi.fn()}
      />,
    );
    expect(screen.getByText("(update)")).toBeDefined();
    expect(screen.getByText("(script update)")).toBeDefined();
  });
});
