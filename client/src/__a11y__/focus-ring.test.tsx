// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  compositeOver,
  contrastRatio,
  oklchToLinearRgb,
  parseOklch,
  swatch,
  toHex,
} from "./contrast";

/**
 * WCAG 2.2 SC 1.4.11 Non-text Contrast (AA) — finding A11Y-01.
 *
 * The focus indicator must reach 3:1 against adjacent colour. This asserts the
 * ring as actually rendered: the --ring token from index.css, at the alpha
 * button.tsx applies, composited over the surfaces the app actually uses.
 * A ring that exists in the DOM but cannot be seen does not satisfy 1.4.11.
 */

const root = path.resolve(__dirname, "../../..");
const indexCss = readFileSync(path.join(root, "client/src/index.css"), "utf8");
const buttonTsx = readFileSync(
  path.join(root, "client/src/components/ui/button.tsx"),
  "utf8"
);

/** The --ring declaration inside the `.dark { ... }` block. */
function darkRingToken(): string {
  const darkBlock = indexCss.match(/\.dark\s*\{([\s\S]*?)\n\}/);
  if (!darkBlock) throw new Error("Could not locate .dark block in index.css");
  const ring = darkBlock[1].match(/^\s*--ring:\s*([^;]+);/m);
  if (!ring) throw new Error("Could not locate --ring in the .dark block");
  return ring[1].trim();
}

/** The alpha button.tsx applies to the ring: `ring-ring/50` -> 0.5, `ring-ring` -> 1. */
function ringAlpha(): number {
  const withAlpha = buttonTsx.match(/focus-visible:ring-ring\/(\d+)/);
  if (withAlpha) return Number(withAlpha[1]) / 100;
  if (/focus-visible:ring-ring\b/.test(buttonTsx)) return 1;
  throw new Error("button.tsx no longer applies a focus-visible ring at all");
}

describe("A11Y-01: focus indicator contrast (WCAG 1.4.11)", () => {
  // Every page sits on bg-gradient-to-br from-slate-900 via-slate-800; cards are slate-800.
  const surfaces = [
    ["slate-800", swatch("slate-800")],
    ["slate-900", swatch("slate-900")],
  ] as const;

  it.each(surfaces)(
    "focus ring reaches 3:1 against %s as rendered",
    (name, surface) => {
      const ring = oklchToLinearRgb(parseOklch(darkRingToken()));
      const rendered = compositeOver(ring, surface, ringAlpha());
      const ratio = contrastRatio(rendered, surface);

      expect(
        ratio,
        `focus ring ${toHex(rendered)} on ${name} ${toHex(surface)} = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(3);
    }
  );

  it("does not dilute the ring with alpha", () => {
    // Alpha is what sank this originally: blue-700 at 50% over a dark surface
    // measured 1.57:1. An opaque ring is the fix; guard the regression.
    expect(ringAlpha()).toBe(1);
  });
});
