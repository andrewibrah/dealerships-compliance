/**
 * Test-only colorimetry for WCAG contrast assertions.
 *
 * Not imported by application code — it exists so accessibility tests can assert
 * real ratios against the real design tokens instead of hand-checked numbers.
 *
 * Pipeline: oklch -> OKLab -> linear sRGB -> gamma sRGB -> WCAG relative
 * luminance -> contrast ratio. Alpha compositing is done in linear light, which
 * is what the compositor actually does.
 *
 * Validated against Tailwind v4's published hex values:
 *   slate-800 oklch(27.9% 0.041 260.031) -> #1d293d
 *   slate-400 oklch(70.4% 0.04  256.788) -> #90a1b9
 */

export type Oklch = [l: number, c: number, h: number]; // l in percent (0-100)
export type LinearRgb = [r: number, g: number, b: number];

export function oklchToLinearRgb([lPct, c, h]: Oklch): LinearRgb {
  const L = lPct / 100;
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

const encodeGamma = (channel: number): number => {
  const v = Math.min(1, Math.max(0, channel));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
};

const decodeGamma = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

export function toHex(rgb: LinearRgb): string {
  return (
    "#" +
    rgb
      .map((channel) =>
        Math.round(encodeGamma(channel) * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

export function relativeLuminance(rgb: LinearRgb): number {
  // Clamp through the gamma round-trip so out-of-gamut oklch matches what renders.
  const [r, g, b] = rgb.map((channel) => decodeGamma(encodeGamma(channel)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: LinearRgb, bg: LinearRgb): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite `fg` at `alpha` over `bg`, in linear light. */
export function compositeOver(fg: LinearRgb, bg: LinearRgb, alpha: number): LinearRgb {
  return fg.map((channel, i) => channel * alpha + bg[i] * (1 - alpha)) as LinearRgb;
}

/** Tailwind v4 source values, read from tailwindcss/theme.css. */
export const TAILWIND: Record<string, Oklch> = {
  white: [100, 0, 0],
  "amber-400": [82.8, 0.189, 84.429],
  "amber-500": [76.9, 0.188, 70.08],
  "amber-600": [66.6, 0.179, 58.318],
  "amber-700": [55.5, 0.163, 48.998],
  "blue-400": [70.7, 0.165, 254.624],
  "blue-700": [48.8, 0.243, 264.376],
  "red-400": [70.4, 0.191, 22.216],
  "red-500": [63.7, 0.237, 25.331],
  "slate-400": [70.4, 0.04, 256.788],
  "slate-500": [55.4, 0.046, 257.417],
  "slate-600": [44.6, 0.043, 257.281],
  "slate-700": [37.2, 0.044, 257.287],
  "slate-800": [27.9, 0.041, 260.031],
  "slate-900": [20.8, 0.042, 265.755],
  "slate-950": [12.9, 0.042, 264.695],
};

export const swatch = (name: keyof typeof TAILWIND | string): LinearRgb => {
  const value = TAILWIND[name];
  if (!value) throw new Error(`Unknown swatch: ${name}`);
  return oklchToLinearRgb(value);
};

/** Parse `oklch(L% C H)` / `oklch(L C H)` as authored in index.css. */
export function parseOklch(css: string): Oklch {
  const match = css.match(
    /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)/i
  );
  if (!match) throw new Error(`Not a parseable oklch() value: ${css}`);
  const [, l, pct, c, h] = match;
  // `oklch(0.488 ...)` and `oklch(48.8% ...)` are the same colour.
  const lNum = parseFloat(l);
  return [pct === "%" ? lNum : lNum * 100, parseFloat(c), parseFloat(h)];
}
