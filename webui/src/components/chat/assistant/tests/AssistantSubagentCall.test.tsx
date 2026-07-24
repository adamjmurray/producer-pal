// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { AssistantSubagentCall } from "#webui/components/chat/assistant/tool-calls/AssistantSubagentCall";

describe("AssistantSubagentCall", () => {
  it("shows a working state while the subagent runs (result null)", () => {
    render(<AssistantSubagentCall task="write a bassline" result={null} />);

    expect(screen.getByText("working…")).toBeDefined();
    expect(screen.getByText(/Working on write a bassline/)).toBeDefined();
  });

  it("pulses only while the assistant is still responding", () => {
    const { container } = render(
      <AssistantSubagentCall task="x" result={null} isResponding />,
    );

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("renders the return value when done", () => {
    render(
      <AssistantSubagentCall
        task="write a bassline"
        result={JSON.stringify("Added a bassline in the Bass track.")}
      />,
    );

    expect(screen.getByText("done")).toBeDefined();
    expect(
      screen.getByText("Added a bassline in the Bass track."),
    ).toBeDefined();
  });

  it("shows a failed status and red border on error", () => {
    const { container } = render(
      <AssistantSubagentCall task="x" result={"boom"} isError />,
    );

    expect(screen.getByText("failed")).toBeDefined();
    expect(container.querySelector(".border-red-500")).not.toBeNull();
  });

  it("renders the transcript in a nested disclosure when provided", () => {
    render(
      <AssistantSubagentCall
        task="x"
        result={JSON.stringify("done")}
        transcript={<div>worker said hi</div>}
      />,
    );

    expect(screen.getByText("↳ subagent transcript")).toBeDefined();
    expect(screen.getByText("worker said hi")).toBeDefined();
  });

  it("omits the transcript disclosure when there is none", () => {
    render(<AssistantSubagentCall task="x" result={JSON.stringify("done")} />);

    expect(screen.queryByText("↳ subagent transcript")).toBeNull();
  });
});
