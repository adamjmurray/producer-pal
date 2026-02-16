// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { AssistantThought } from "./AssistantThought";

const LONG_CONTENT = "A".repeat(81);
const MULTI_LINE = "First line\nSecond line\nThird line";

describe("AssistantThought", () => {
  describe("basic rendering", () => {
    it("renders as details element", () => {
      render(<AssistantThought content="Test thought" isOpen={false} />);
      const details = document.querySelector("details");

      expect(details).toBeDefined();
    });

    it("has correct styling classes", () => {
      render(<AssistantThought content="Test thought" isOpen={false} />);
      const details = document.querySelector("details");

      expect(details!.className).toContain("bg-gray-200");
      expect(details!.className).toContain("dark:bg-gray-700");
      expect(details!.className).toContain("border-green-500");
    });
  });

  describe("open state", () => {
    it.each([
      { isOpen: true, expected: true },
      { isOpen: false, expected: false },
    ])(
      "details.open is $expected when isOpen is $isOpen",
      ({ isOpen, expected }) => {
        render(<AssistantThought content="Test thought" isOpen={isOpen} />);
        const details = document.querySelector("details");

        expect(details!.open).toBe(expected);
      },
    );
  });

  describe("animation behavior", () => {
    it("has animate-pulse class when isOpen and isResponding are both true", () => {
      render(
        <AssistantThought
          content="Test thought"
          isOpen={true}
          isResponding={true}
        />,
      );
      const details = document.querySelector("details");

      expect(details!.className).toContain("animate-pulse");
    });

    it.each([
      {
        name: "isOpen true, isResponding false",
        isOpen: true,
        isResponding: false,
      },
      {
        name: "isOpen true, isResponding undefined",
        isOpen: true,
        isResponding: undefined,
      },
      {
        name: "isOpen false, isResponding true",
        isOpen: false,
        isResponding: true,
      },
      { name: "both false", isOpen: false, isResponding: false },
    ])("does not have animate-pulse when $name", ({ isOpen, isResponding }) => {
      render(
        <AssistantThought
          content="Test thought"
          isOpen={isOpen}
          isResponding={isResponding}
        />,
      );
      const details = document.querySelector("details");

      expect(details!.className).not.toContain("animate-pulse");
    });
  });

  describe("summary display", () => {
    it("shows 'Thinking...' when open", () => {
      render(<AssistantThought content={MULTI_LINE} isOpen={true} />);
      expect(screen.getByText("💭 Thinking...")).toBeDefined();
    });

    it("shows first line in summary when closed", () => {
      render(<AssistantThought content={MULTI_LINE} isOpen={false} />);
      const summary = document.querySelector("summary");

      expect(summary!.innerHTML).toContain("First line");
    });

    it("shows single-line content in summary", () => {
      render(<AssistantThought content="Single line" isOpen={false} />);
      const summary = document.querySelector("summary");

      expect(summary!.innerHTML).toContain("Single line");
    });

    it("shows 'Thought about:' label when details is opened", () => {
      render(<AssistantThought content={MULTI_LINE} isOpen={false} />);
      const summary = document.querySelector("summary");
      const openLabel = summary!.querySelector(".hidden.group-open\\:inline");

      expect(openLabel!.textContent).toBe("💭 Thought about:");
    });
  });

  describe("content display", () => {
    it("shows full content when open", () => {
      render(<AssistantThought content={MULTI_LINE} isOpen={true} />);
      const contentDiv = document.querySelector(".prose");

      expect(contentDiv!.innerHTML).toContain("First line");
      expect(contentDiv!.innerHTML).toContain("Second line");
      expect(contentDiv!.innerHTML).toContain("Third line");
    });

    it("body includes full content including first line", () => {
      render(<AssistantThought content={MULTI_LINE} isOpen={false} />);
      const contentDiv = document.querySelector(".prose");

      expect(contentDiv!.innerHTML).toContain("First line");
      expect(contentDiv!.innerHTML).toContain("Second line");
      expect(contentDiv!.innerHTML).toContain("Third line");
    });

    it("body includes full content for single-line", () => {
      render(<AssistantThought content={LONG_CONTENT} isOpen={false} />);
      const contentDiv = document.querySelector(".prose");

      expect(contentDiv!.innerHTML).toContain(LONG_CONTENT);
    });
  });

  describe("markdown rendering", () => {
    it("renders markdown in content", () => {
      render(
        <AssistantThought content={`**bold** text\nmore`} isOpen={true} />,
      );
      const contentDiv = document.querySelector(".prose");

      expect(contentDiv!.innerHTML).toContain("<strong>");
    });

    it("renders inline markdown in summary", () => {
      render(
        <AssistantThought content={`**bold** line\nSecond`} isOpen={false} />,
      );
      const summary = document.querySelector("summary");

      expect(summary!.innerHTML).toContain("<strong>");
    });
  });
});
