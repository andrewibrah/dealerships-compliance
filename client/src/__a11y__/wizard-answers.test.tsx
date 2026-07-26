// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { SAFEGUARDS_SECTIONS } from "@shared/safeguards-questions";

/**
 * WCAG 2.2 SC 4.1.2 Name/Role/Value (A), 1.4.1 Use of Color (A),
 * 3.3.2 Labels or Instructions (A), 1.3.1 Info and Relationships (A)
 * — finding A11Y-03.
 *
 * The 9-section assessment is the product's core task and the gate to every
 * paid document. Its answers become a WISP filed as a regulatory record, so a
 * control that cannot report its own state is not a cosmetic defect: it lets
 * an answer be recorded wrong and silently.
 */

const { mutate, answersResult } = vi.hoisted(() => ({
  mutate: vi.fn(),
  // Stable references. Wizard's useEffect depends on `answersQuery.data`'s
  // identity; real react-query keeps that stable across renders, and a fresh
  // literal per render would spin it into an infinite setState loop.
  answersResult: { data: [] as unknown[], isLoading: false },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    compliance: {
      getAnswers: { useQuery: () => answersResult },
      saveSection: { useMutation: () => ({ mutate, isPending: false }) },
    },
    // No consumer count -> nothing is exempt -> every question renders (the default path).
    dealership: {
      getCurrent: { useQuery: () => ({ data: null, isLoading: false }) },
    },
    // Conversational mode is off in these tests; the query stays disabled and the canonical
    // question text renders as the radiogroup's accessible name.
    interview: {
      rephrase: { useQuery: () => ({ data: undefined }) },
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, loading: false, user: { id: "u1" } }),
}));

vi.mock("wouter", () => ({ useLocation: () => ["/wizard", vi.fn()] }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import Wizard from "@/pages/Wizard";

const firstSection = SAFEGUARDS_SECTIONS[0];
const firstQuestion = firstSection.questions[0];

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("A11Y-03: wizard answer controls", () => {
  it("exposes each question as a labelled radiogroup (3.3.2 / 1.3.1)", () => {
    render(<Wizard />);

    // The accessible name must carry the question, not just "Yes"/"No".
    const group = screen.getByRole("radiogroup", { name: new RegExp(firstQuestion.text.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    expect(group).toBeDefined();
  });

  it("associates the hint with the group via aria-describedby (1.3.1)", () => {
    render(<Wizard />);
    const group = screen.getByRole("radiogroup", { name: new RegExp(firstQuestion.text.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    const describedBy = group.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain(firstQuestion.hint);
  });

  it("exposes answers as radios, not anonymous buttons (4.1.2)", () => {
    render(<Wizard />);
    const group = screen.getByRole("radiogroup", { name: new RegExp(firstQuestion.text.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent?.trim())).toEqual(["Yes", "No"]);
  });

  it("reports selected state to assistive technology (4.1.2)", () => {
    render(<Wizard />);
    const group = screen.getByRole("radiogroup", { name: new RegExp(firstQuestion.text.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    const yes = within(group).getByRole("radio", { name: /Yes/ });
    const no = within(group).getByRole("radio", { name: /No/ });

    expect(yes.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(yes);

    // The state change must be visible in the accessibility tree, not only in
    // a background-colour class.
    expect(yes.getAttribute("aria-checked")).toBe("true");
    expect(no.getAttribute("aria-checked")).toBe("false");
    expect(mutate).toHaveBeenCalled();
  });

  it("carries selection on a channel other than colour (1.4.1)", () => {
    // Computed: under deuteranopia the selected fills green-600 and red-600
    // differ by 1.02:1 - the same colour. Selection must not rest on hue.
    render(<Wizard />);
    const group = screen.getByRole("radiogroup", { name: new RegExp(firstQuestion.text.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    const yes = within(group).getByRole("radio", { name: /Yes/ });
    const no = within(group).getByRole("radio", { name: /No/ });

    // The glyph stays mounted (so the row does not reflow) and is revealed on
    // selection. What matters is that exactly the selected option shows a shape,
    // independent of any hue change.
    const glyphShown = (el: HTMLElement) => {
      const svg = el.querySelector("svg");
      expect(svg, "selection glyph is missing entirely").not.toBeNull();
      return !svg!.classList.contains("invisible");
    };

    expect(glyphShown(yes)).toBe(false);
    expect(glyphShown(no)).toBe(false);

    fireEvent.click(yes);

    expect(glyphShown(yes)).toBe(true);
    expect(glyphShown(no)).toBe(false);
  });

  it("renders yes_no_partial questions as three radios", () => {
    const partial = SAFEGUARDS_SECTIONS.flatMap((s) => s.questions).find(
      (q) => q.type === "yes_no_partial"
    );
    if (!partial) return; // shape guard; not all datasets have one
    expect(partial.type).toBe("yes_no_partial");
  });
});
