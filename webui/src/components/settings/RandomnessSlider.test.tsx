/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { RandomnessSlider } from "./RandomnessSlider.jsx";

describe("RandomnessSlider", () => {
  it("renders with correct temperature value", () => {
    const setTemperature = vi.fn();
    render(
      <RandomnessSlider temperature={1.0} setTemperature={setTemperature} />,
    );

    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.value).toBe("1");
  });

  it("displays correct percentage calculation", () => {
    const setTemperature = vi.fn();
    render(
      <RandomnessSlider temperature={1.0} setTemperature={setTemperature} />,
    );

    // getByText will throw if element is not found
    expect(screen.getByText("Randomness: 50%")).toBeDefined();
  });

  it("displays 0% for temperature 0", () => {
    const setTemperature = vi.fn();
    render(
      <RandomnessSlider temperature={0} setTemperature={setTemperature} />,
    );

    expect(screen.getByText("Randomness: 0%")).toBeDefined();
  });

  it("displays 100% for temperature 2", () => {
    const setTemperature = vi.fn();
    render(
      <RandomnessSlider temperature={2.0} setTemperature={setTemperature} />,
    );

    expect(screen.getByText("Randomness: 100%")).toBeDefined();
  });

  it("triggers setTemperature callback on slider input", () => {
    const setTemperature = vi.fn();
    render(
      <RandomnessSlider temperature={1.0} setTemperature={setTemperature} />,
    );

    const slider = screen.getByRole("slider");
    fireEvent.input(slider, { target: { value: "1.5" } });

    expect(setTemperature).toHaveBeenCalledOnce();
    expect(setTemperature).toHaveBeenCalledWith(1.5);
  });

  it("parses float values from slider input", () => {
    const setTemperature = vi.fn();
    render(
      <RandomnessSlider temperature={0.5} setTemperature={setTemperature} />,
    );

    const slider = screen.getByRole("slider");
    fireEvent.input(slider, { target: { value: "0.7" } });

    expect(setTemperature).toHaveBeenCalledWith(0.7);
  });
});
