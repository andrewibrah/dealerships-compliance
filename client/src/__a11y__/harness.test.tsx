// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { contrastRatio, parseOklch, swatch, toHex, oklchToLinearRgb } from "./contrast";

describe("a11y test harness", () => {
  it("renders React into jsdom", () => {
    render(<button type="button">Hello</button>);
    expect(screen.getByRole("button", { name: "Hello" })).toBeDefined();
  });

  it("colorimetry matches Tailwind's published hex values", () => {
    // If these drift, every contrast assertion in this suite is untrustworthy.
    expect(toHex(swatch("slate-800"))).toBe("#1d293d");
    expect(toHex(swatch("slate-400"))).toBe("#90a1b9");
    expect(toHex(swatch("amber-600"))).toBe("#e17100");
  });

  it("contrast ratio matches known WCAG reference pairs", () => {
    const white = swatch("white");
    const black = oklchToLinearRgb([0, 0, 0]);
    // Black on white is the canonical 21:1.
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("parses oklch() as authored in index.css, percent or unit", () => {
    expect(parseOklch("oklch(0.488 0.243 264.376)")).toEqual([48.8, 0.243, 264.376]);
    expect(parseOklch("oklch(48.8% 0.243 264.376)")).toEqual([48.8, 0.243, 264.376]);
  });
});
