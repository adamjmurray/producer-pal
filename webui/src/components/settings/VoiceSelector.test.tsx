/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { VoiceSelector } from "./VoiceSelector";

describe("VoiceSelector", () => {
  it("renders voice selector with default value", () => {
    const setVoice = vi.fn();
    const { container } = render(
      <VoiceSelector voice="" setVoice={setVoice} />,
    );

    const select = container.querySelector("select");
    expect(select).toBeDefined();
    expect(select!.value).toBe("");
  });

  it("renders voice selector with selected voice", () => {
    const setVoice = vi.fn();
    const { container } = render(
      <VoiceSelector voice="Puck" setVoice={setVoice} />,
    );

    const select = container.querySelector("select");
    expect(select!.value).toBe("Puck");
  });

  it("calls setVoice when selection changes", () => {
    const setVoice = vi.fn();
    const { container } = render(
      <VoiceSelector voice="" setVoice={setVoice} />,
    );

    const select = container.querySelector("select")!;
    fireEvent.change(select, { target: { value: "Charon" } });

    expect(setVoice).toHaveBeenCalledWith("Charon");
  });

  it("includes all voice options", () => {
    const setVoice = vi.fn();
    const { container } = render(
      <VoiceSelector voice="" setVoice={setVoice} />,
    );

    const options = Array.from(container.querySelectorAll("option")).map(
      (opt) => opt.textContent,
    );
    expect(options).toContain("Default");
    expect(options).toContain("Puck");
    expect(options).toContain("Charon");
    expect(options).toContain("Kore");
    expect(options).toContain("Fenrir");
    expect(options).toContain("Aoede");
  });
});
