// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { useEffect } from "preact/hooks";
import { describe, expect, it, vi } from "vitest";
import { AppHost } from "#webui/components/gen/AppHost";

function frame(): HTMLIFrameElement {
  return screen.getByTestId("gen-app-frame") as HTMLIFrameElement;
}

describe("AppHost", () => {
  it("runs the app in a script-only sandbox with the policy in front", () => {
    render(<AppHost source="<p>hi</p>" />);

    expect(frame().getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame().getAttribute("srcdoc")).toMatch(
      /^<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'.*connect-src 'none'.*"><script>.*<\/script><p>hi<\/p>$/,
    );
  });

  it("gives the frame no way to learn host details", () => {
    render(<AppHost source="<p>hi</p>" />);

    expect(frame().hasAttribute("src")).toBe(false);
    expect(frame().getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("replaces the source in the same frame", () => {
    const { rerender } = render(<AppHost source="<p>one</p>" />);
    const first = frame();

    rerender(<AppHost source="<p>two</p>" />);

    expect(frame()).toBe(first);
    expect(frame().getAttribute("srcdoc")).toContain("<p>two</p>");
  });

  it("restarts the app on a new reload token", () => {
    const { rerender } = render(
      <AppHost source="<p>one</p>" reloadToken={0} />,
    );
    const first = frame();

    rerender(<AppHost source="<p>one</p>" reloadToken={1} />);

    expect(frame()).not.toBe(first);
  });

  it("leaves the rest of the page mounted when the app changes", () => {
    const mounted = vi.fn();

    function Chat(): preact.JSX.Element {
      useEffect(mounted, []);

      return <div>chat</div>;
    }

    const page = (source: string, reloadToken: number): preact.JSX.Element => (
      <>
        <Chat />
        <AppHost source={source} reloadToken={reloadToken} />
      </>
    );
    const { rerender } = render(page("<p>one</p>", 0));

    rerender(page("<p>two</p>", 0));
    rerender(page("<p>two</p>", 1));

    expect(mounted).toHaveBeenCalledTimes(1);
  });
});
