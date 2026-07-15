// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { contrastRatio, oklchToLinearRgb, swatch, toHex } from "./contrast";

/**
 * WCAG 2.2 SC 1.4.3 Contrast (Minimum), AA — finding A11Y-04.
 *
 * The amber CTA is the most-clicked control in the product: "Start free
 * assessment", "Sign In", "Create Account", "Continue Assessment",
 * "Generate Documents". It sits on the entire conversion flow.
 *
 * Label text is 14px semibold/bold, below the 18.66px-bold large-text
 * threshold, so the 4.5:1 minimum applies - not 3:1. Hover is a state the
 * text is read in, so it must clear 4.5:1 too.
 */

const PAGES_DIR = path.resolve(__dirname, "../pages");
const BLUE_50 = oklchToLinearRgb([97, 0.014, 254.604]); // --primary-foreground

describe("A11Y-04: amber CTA contrast (WCAG 1.4.3)", () => {
  describe("palette arithmetic", () => {
    it("documents why the original foregrounds fail on amber-600", () => {
      const amber600 = swatch("amber-600");
      // Both original foregrounds are below 4.5:1. Recorded so a future change
      // back to either fails loudly rather than silently.
      expect(contrastRatio(swatch("white"), amber600)).toBeLessThan(4.5);
      expect(contrastRatio(BLUE_50, amber600)).toBeLessThan(4.5);
    });

    it("slate-950 clears 4.5:1 at rest and on hover", () => {
      const fg = swatch("slate-950");
      const rest = contrastRatio(fg, swatch("amber-600"));
      const hover = contrastRatio(fg, swatch("amber-500"));

      expect(rest, `slate-950 on amber-600 = ${rest.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      expect(hover, `slate-950 on amber-500 = ${hover.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });

    it("rejects amber-700 as a hover target for slate-950", () => {
      // The audit originally recommended keeping hover:bg-amber-700. It computes
      // to 3.99:1 with slate-950 - a fail. Hover must get lighter, not darker.
      const hover = contrastRatio(swatch("slate-950"), swatch("amber-700"));
      expect(hover).toBeLessThan(4.5);
    });
  });

  describe("call sites", () => {
    const sources = readdirSync(PAGES_DIR)
      .filter((f) => f.endsWith(".tsx"))
      .flatMap((file) =>
        readFileSync(path.join(PAGES_DIR, file), "utf8")
          .split("\n")
          .map((line, i) => ({ file, line: i + 1, text: line }))
          .filter(({ text }) => text.includes("bg-amber-600"))
      );

    it("finds the amber CTA call sites to police", () => {
      expect(sources.length).toBeGreaterThan(0);
    });

    it.each(sources.map((s) => [`${s.file}:${s.line}`, s.text] as const))(
      "%s sets a compliant foreground",
      (_where, text) => {
        // Without an explicit foreground the shadcn Button default
        // (text-primary-foreground -> blue-50) applies at 2.93:1.
        expect(text).toContain("text-slate-950");
        expect(text).not.toContain("text-white");
      }
    );

    it.each(sources.filter((s) => s.text.includes("hover:bg-amber")).map((s) => [`${s.file}:${s.line}`, s.text] as const))(
      "%s hovers to a compliant background",
      (_where, text) => {
        expect(text).toContain("hover:bg-amber-500");
        expect(text).not.toContain("hover:bg-amber-700");
      }
    );
  });
});
