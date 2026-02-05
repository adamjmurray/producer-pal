// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { AssistantText } from "./AssistantText";

describe("AssistantText", () => {
  describe("basic rendering", () => {
    it("renders as div element", () => {
      render(<AssistantText content="Test content" />);
      const div = document.querySelector(".prose");

      expect(div).toBeDefined();
    });

    it("has prose styling classes", () => {
      render(<AssistantText content="Test content" />);
      const div = document.querySelector(".prose");

      expect(div!.className).toContain("prose");
      expect(div!.className).toContain("dark:prose-invert");
      expect(div!.className).toContain("prose-sm");
      expect(div!.className).toContain("max-w-none");
    });
  });

  describe("content display", () => {
    it("renders plain text content", () => {
      render(<AssistantText content="Simple text" />);
      const div = document.querySelector(".prose");

      expect(div!.innerHTML).toContain("Simple text");
    });

    it("renders content with dangerouslySetInnerHTML", () => {
      render(<AssistantText content="Test" />);
      const div = document.querySelector(".prose");

      expect(div!.innerHTML).toBeDefined();
    });
  });

  describe("markdown rendering", () => {
    it("renders bold markdown", () => {
      render(<AssistantText content="**bold** text" />);
      const div = document.querySelector(".prose");

      expect(div!.innerHTML).toContain("<strong>");
      expect(div!.innerHTML).toContain("bold");
    });

    it("renders italic markdown", () => {
      render(<AssistantText content="*italic* text" />);
      const div = document.querySelector(".prose");

      expect(div!.innerHTML).toContain("<em>");
      expect(div!.innerHTML).toContain("italic");
    });

    it("renders code markdown", () => {
      render(<AssistantText content="`code` text" />);
      const div = document.querySelector(".prose");

      expect(div!.innerHTML).toContain("<code>");
      expect(div!.innerHTML).toContain("code");
    });

    it("renders links", () => {
      render(<AssistantText content="[link](https://example.com)" />);
      const div = document.querySelector(".prose");

      expect(div!.innerHTML).toContain("<a");
      expect(div!.innerHTML).toContain("href");
    });

    it("renders headings", () => {
      render(<AssistantText content="# Heading" />);
      const div = document.querySelector(".prose");

      expect(div!.innerHTML).toContain("<h1");
      expect(div!.innerHTML).toContain("Heading");
    });

    it("renders lists", () => {
      render(<AssistantText content="- item 1\n- item 2" />);
      const div = document.querySelector(".prose");

      expect(div!.innerHTML).toContain("<ul>");
      expect(div!.innerHTML).toContain("<li>");
    });

    it("renders multi-line content", () => {
      render(<AssistantText content="Line 1\n\nLine 2" />);
      const div = document.querySelector(".prose");

      expect(div!.innerHTML).toContain("Line 1");
      expect(div!.innerHTML).toContain("Line 2");
    });
  });
});
