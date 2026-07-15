# Accessibility Audit — dealerships-compliance

**Standard:** WCAG 2.2 Level AA
**Method:** Static source audit + computed colorimetry. No runtime/AT testing performed (see §6).
**Commit audited:** `8bd2012` (branch `main`)
**Scope:** `client/` React SPA (Home, Signup, Login, Wizard, Dashboard, Documents, Pricing, Profile, NotFound), `client/index.html`, `client/src/index.css`, `shared/pdf-generator.ts` (generated WISP / board-report PDFs).
**Date:** 2026-07-14 (findings) / 2026-07-15 (Phase 1 remediation + corrections)

## Remediation status

| ID | Finding | Severity | Status |
|---|---|---|---|
| A11Y-01 | Focus indicator invisible (1.4.11) | BLOCKER | **Fixed** 2026-07-15 — ring now 5.56:1 / 6.77:1 |
| A11Y-02 | Auth errors unannounced; no `autocomplete` (3.3.1 / 4.1.3 / 1.3.5 / 3.3.8) | BLOCKER | **Fixed** 2026-07-15 |
| A11Y-03 | Wizard answers not a radio group (4.1.2 / 1.4.1 / 3.3.2) | BLOCKER | **Fixed** 2026-07-15 |
| A11Y-04 | Amber CTA contrast (1.4.3) | MAJOR | **Fixed** 2026-07-15 — 6.32:1 rest / 9.40:1 hover |
| — | Everything else below | — | **Open** |

Each fix carries a regression test under `client/src/__a11y__/`. Conformance is
still **not** claimed for any flow: the remaining findings are open, and nothing
here has been validated against a real screen reader (§6).

> **Scope note:** the audit request's SCOPE block was left as an unfilled placeholder. This audit covers the repository it was run in. It does **not** cover the deployed GitHub Pages instance, Supabase-hosted auth screens (Supabase's own email templates and any hosted auth UI are third-party surfaces), or Stripe Checkout — **Stripe Checkout is inside the core conversion flow and is unaudited.** See §6.

---

## 1. Findings

Severity: **BLOCKER** = a disabled user cannot complete a core task at all. **MAJOR** = substantial barrier, workaround may exist. **MINOR** = defect, task still completable.

All contrast ratios below are **computed**, not estimated: Tailwind v4 oklch source values were read from `node_modules/.pnpm/tailwindcss@4.1.14/.../theme.css`, converted oklch→sRGB, alpha-composited in linear light where applicable, and evaluated per the WCAG relative-luminance formula. Conversion was validated against Tailwind's published hex values (slate-800 → `#1d293d`, slate-400 → `#90a1b9`). CVD simulation uses the Viénot/Brettel LMS matrices applied in linear RGB.

### BLOCKER

| WCAG SC # | Level | File:line | What fails | User impact | Fix (exact code) |
|---|---|---|---|---|---|
| **4.1.2 Name, Role, Value** | A | `client/src/pages/Wizard.tsx:220-288` | The Yes / Partial / No answer controls are plain `<Button>`s. No `role="radiogroup"`, no `aria-pressed`, no `aria-checked`. Selected state is expressed **only** as a background-colour class (`bg-green-600` / `bg-yellow-600` / `bg-red-600`) plus a shadcn `variant` swap. Nothing in the accessibility tree changes when an answer is selected. | A screen-reader user can press the buttons but **cannot perceive which answer is currently recorded**, cannot review answers, and cannot resume a partially-completed assessment. The 9-section assessment is the product's core task and the gate to every paid document. Not completable. | Convert each question to a real radio group. See §2.1 for the full replacement component. |
| **1.4.1 Use of Color** | A | `client/src/pages/Wizard.tsx:222-288` | Selected answer is distinguished from unselected **only** by fill hue. Computed CVD collapse of the selected fills: **deuteranopia — `green-600` vs `red-600` = 1.02:1**; protanopia — `green-600` vs `yellow-600` = 1.02:1; achromatopsia — `green-600` vs `yellow-600` = 1.10:1. | A deuteranopic user (~6% of males) **literally cannot tell a selected "Yes" from a selected "No"** on the compliance assessment. Wrong answers here propagate into a WISP filed as a regulatory record. Not completable, and silently wrong rather than merely blocked. | Add a non-colour channel: check icon + `aria-checked` + border-weight change. §2.1. |
| **3.3.2 Labels or Instructions** / **1.3.1** | A | `client/src/pages/Wizard.tsx:200-206` | `<label className="text-white font-medium block mb-2">{question.text}</label>` — no `htmlFor`, and its control is a `<div>` of buttons that can't be labelled by `for` anyway. `question.hint` (`:204`) is never associated via `aria-describedby`. | Screen reader announces only "Yes, button" / "No, button" with **no question text**. 9 sections × N questions of unlabelled binary buttons. Not completable. | §2.1 — `<fieldset>` + `<legend>` + `aria-describedby` on the group. |
| **1.4.11 Non-text Contrast** | AA | `client/src/index.css:102` (`.dark { --ring: oklch(0.488 0.243 264.376) }`), consumed by `client/src/components/ui/button.tsx:8` (`focus-visible:ring-ring/50`) | The focus ring is blue-700 at 50% alpha. Composited over the app's dark surfaces the ring measures **1.57:1 on `slate-800`** and **1.81:1 on `slate-900`**. Required: 3:1. | The focus indicator exists in the DOM but is **not perceivable**. A keyboard-only user cannot tell where focus is on any page — every flow, not just one. Not completable without sighted guessing. | `client/src/index.css:102` → `--ring: oklch(70.7% 0.165 254.624);` (blue-400, `#51a2ff`) → **5.56:1** on slate-800, **6.77:1** on slate-900. Then in `button.tsx:8` change `focus-visible:ring-ring/50` → `focus-visible:ring-ring`. Alpha is what kills it; keep the ring opaque. |

### MAJOR

| WCAG SC # | Level | File:line | What fails | User impact | Fix (exact code) |
|---|---|---|---|---|---|
| **1.4.3 Contrast (Minimum)** | AA | `client/src/pages/Home.tsx:58`, `Login.tsx:90`, `Signup.tsx:123`, `Dashboard.tsx:115,134,185`, `Wizard.tsx:144,363`, `Documents.tsx:117` | **[CORRECTED 2026-07-15 — see note]** 14 `bg-amber-600` call sites, two distinct failures, both under the required 4.5:1 (label is 14px `font-bold` — below the 18.66px bold large-text threshold, so 3:1 does **not** apply): 3 sites set `text-white` explicitly → **3.19:1**; the other 11 set no foreground, so the shadcn Button default `text-primary-foreground` applies, which this theme maps to **blue-50 → 2.93:1**. | The single most-clicked control on every page — "Start free assessment", "Sign In", "Create Account", "Continue Assessment", "Generate Documents" — fails. Affects the entire conversion flow. | Keep brand amber, flip the label **and lighten the hover**: `bg-amber-600 hover:bg-amber-500 text-slate-950` → **6.32:1** at rest, **9.40:1** on hover — §3. |
| **1.4.3 Contrast (Minimum)** | AA | `Login.tsx:68,81,115`; `Signup.tsx:87,100,114,170`; `Home.tsx:100`; `Wizard.tsx:292` | `placeholder:text-slate-500` and `text-slate-500` on `bg-slate-900` = **3.74:1**. Required 4.5:1. Affects both auth-form placeholders, the Terms/Privacy microcopy, and the Home footer. | Low-vision users cannot read input placeholders on the login and signup forms, or the ToS notice they are legally deemed to accept. | `slate-500` → `slate-400` (`#90a1b9`) = **6.79:1** on slate-900. |
| **1.4.3 Contrast (Minimum)** | AA | `Wizard.tsx:113,342`; `Dashboard.tsx:82,208,271` | `text-red-500` on `bg-slate-800` = **3.84:1** where used for **small bold** text (the per-section score `%`, `Wizard.tsx:336-346`). Required 4.5:1. (The same colour on the 3xl/5xl risk headline is large text → 3.84:1 **passes** 3:1 there.) | The worst-scoring sections — the ones the user most needs to read — are the least readable. | `text-red-500` → `text-red-400` (`#ff6467`) = **5.07:1**. Large headline may keep red-500. |
| **1.4.11 Non-text Contrast** | AA | `Login.tsx:68,81`; `Signup.tsx:87,100,114`; `Wizard.tsx:292` (`border-slate-600`); `Home.tsx:16,70`, `Dashboard.tsx:103,200`, `Wizard.tsx:191` (`border-slate-700`) | Input borders `slate-600` on `slate-900` = **2.36:1**; on `slate-800` = **1.94:1**. Card borders `slate-700` on `slate-800` = **1.42:1**; dividers on `slate-900` = **1.73:1**. Required 3:1. | Users with low vision cannot see where the email/password fields *are* — the input boundary is the only affordance. Blocks form perception at the top of the funnel. | Input borders → `border-slate-500` (3.74:1 on slate-900 / 3.07:1 on slate-800). Note: **decorative** card borders/dividers are exempt from 1.4.11 (they convey no state); fixing inputs is the compliance-relevant part. Recommend `slate-500` on inputs only. |
| **1.3.5 Identify Input Purpose** | AA | `Login.tsx:61-69,74-83`; `Signup.tsx:81-88,93-101,106-115`; `Profile.tsx:151-231` | No `autocomplete` attribute on **any** input, including email, password, name, address, city, state. Verified: zero occurrences of `autoComplete` in `client/src/pages`. | Users with motor and cognitive disabilities lose autofill on every field of the signup, login, and 8-field profile forms. | `Login`: `autoComplete="email"` / `autoComplete="current-password"`. `Signup`: `autoComplete="name"` / `"email"` / `"new-password"`. `Profile`: `"organization"`, `"street-address"`, `"address-level2"`, `"address-level1"`. |
| **3.3.8 Accessible Authentication** | AA | `Login.tsx:74-83`, `Signup.tsx:106-115` | No cognitive-function test is imposed (good — no CAPTCHA, no puzzle), **but** the missing `autocomplete="current-password"` / `"new-password"` actively degrades password-manager support, which is the mechanism 3.3.8 exists to protect. | Users who rely on a password manager to avoid memorising credentials get inconsistent autofill. Borderline failure; fixing 1.3.5 above resolves it. | Same fix as 1.3.5. |
| **3.3.1 Error Identification** / **4.1.3 Status Messages** | A / AA | `Login.tsx:85`, `Signup.tsx:118` | `{error && <p className="text-red-400 text-sm">{error}</p>}` — the error is rendered as loose text: not `aria-live`, not `role="alert"`, not linked to the field via `aria-describedby`, `aria-invalid` never set, and focus is not moved. Verified: zero `aria-live` / `role="alert"` in `client/src/pages`. | A screen-reader user submits a bad password and **hears nothing at all**. They are stuck on the login screen with no indication of failure. Gate to the entire product. | §2.2. |
| **4.1.3 Status Messages** | AA | `Wizard.tsx:96-102`, `Wizard.tsx:176-178` | The wizard autosaves on every answer click and recomputes the overall score. Neither the save result nor the score change is announced. Only *errors* surface, via `toast.error` (`:44`). Sonner does render its own live region, so the **error** path is covered; the **success** path and the live score are silent. | A screen-reader user gets no confirmation their compliance answer was persisted — on a form whose output is a regulatory filing. They cannot know if their work saved. | §2.3 — add a polite live region for save state and score. |
| **2.4.1 Bypass Blocks** | A | `client/src/App.tsx:18-35`, all pages | No skip link and **no `<main>` element anywhere in the app** (verified: zero `<main>` in `client/src/pages` and `App.tsx`). `Home.tsx` uses `<header>`/`<section>`/`<footer>`, but no page exposes a main landmark. | Keyboard and screen-reader users tab through the full nav on every route with no way to jump to content. | §2.4. |
| **1.4.4 Resize Text** | AA | `client/index.html:8` | `content="width=device-width, initial-scale=1.0, maximum-scale=1"` — pinch-zoom is capped at 1×. | Low-vision users cannot magnify on mobile. **Honest caveat for the record:** iOS Safari has ignored `maximum-scale` since iOS 10, and Android Chrome overrides it when "Force enable zoom" is set — so real-world impact is narrower than the raw SC failure implies. It remains a plainly-stated failure, is trivially cited in demand letters, and has zero legitimate justification here. | `client/index.html:8` → `content="width=device-width, initial-scale=1"`. Delete `maximum-scale=1`. |
| **1.4.1 Use of Color** | A | `Wizard.tsx:336-346` | Per-section scores in the sidebar are colour-coded green/yellow/red with **no icon and no text status** — unlike `Dashboard.tsx:206-208`, which does pair each score with an icon. Computed: `yellow-500` vs `green-500` = **1.16:1** normal vision, **1.05:1** protanopia. The two colours are effectively the same swatch. | A colourblind user reading the wizard sidebar cannot distinguish a passing section from a failing one — the sidebar's entire purpose. | Add a text or icon channel per row; mirror the Dashboard pattern. §3.2. |
| **1.3.1 Info and Relationships** | A | `shared/pdf-generator.ts:82,95,111` | The generated WISP and board report are **untagged PDFs**. No structure tree, no `setTitle`, no document language, no reading order — only `drawText` at absolute coordinates. `pdf-lib` cannot emit tagged PDFs at all. | The product's paid deliverable — the document a dealership files as its regulatory record — is **unreadable to a screen reader**. A blind Qualified Individual cannot read their own WISP. Arguably the sharpest exposure here: it is the artifact the customer pays for. | No small fix. `pdf-lib` has no tagging support — this needs an accessible-PDF pipeline (e.g. server-side HTML→tagged-PDF), or ship an accessible HTML/DOCX alternative of the same content alongside the PDF. Treat as a roadmap item with a dated commitment (§4). At minimum add `doc.setTitle(...)` + `doc.setLanguage('en-US')` today. |
| **2.4.11 Focus Not Obscured (Minimum)** | AA | `Wizard.tsx:168` | Header is `sticky top-0 z-40` and ~100px tall over a scrolling question list. An element focused by keyboard just below the fold can be scrolled under the sticky header. | Keyboard users may lose sight of the focused control mid-assessment. **Not statically confirmable — requires runtime check (§6).** | Preventative: add `scroll-margin-top: 8rem` to focusable elements in the question list, or `scroll-padding-top: 8rem` on the scroll container. |

### MINOR

| WCAG SC # | Level | File:line | What fails | User impact | Fix (exact code) |
|---|---|---|---|---|---|
| **1.1.1 Non-text Content** | A | `Home.tsx:19,47,71,80,89`; `Dashboard.tsx:69,126,144,206-208,268`; `Wizard.tsx:158,311-314`; every lucide icon | `lucide-react@0.453.0` does **not** set `aria-hidden` by default (verified in its `defaultAttributes`). Every icon renders as a bare `<svg>` with no `aria-hidden` and no accessible name. Purely decorative ones (`ShieldCheck`, `ClipboardCheck`, `FileText`, `TrendingUp`) add tree noise; the **status** icons at `Dashboard.tsx:206-208` and `Wizard.tsx:311-314` convey meaning with no text alternative. | Decorative: minor verbosity. Status icons: meaning lost — but they are currently redundant with an adjacent numeric score, which is why this is MINOR not MAJOR. | Decorative: add `aria-hidden="true"`. Meaningful: `<AlertTriangle aria-hidden="true" />` + adjacent `<span className="sr-only">Critical</span>`. |
| **1.3.1 Info and Relationships** | A | `Pricing.tsx:39→51`, `Documents.tsx:97→109` | Heading hierarchy skips `h1` → `h3` with no intervening `h2`. | Screen-reader users navigating by heading get a broken outline. | `Pricing.tsx:51,95` → `h2`. `Documents.tsx:109,132` → `h2`. |
| **1.4.1 Use of Color** / **4.1.2** | A | `Login.tsx:107-112`, `Signup.tsx:140-145` | "Sign up here" / "Login here" are `<button>` elements inside a `<p>`, styled `text-amber-500` with **no underline** — colour is the sole in-text link signal. They are also semantically buttons, not links: no `href`, cannot be opened in a new tab, not in the links list. | Colourblind users may not identify them as interactive. Screen-reader users don't find them under "links". | Add `underline underline-offset-4`. Better: render as a real anchor — `<a href="/signup">` via wouter's `<Link>`. |
| **2.5.8 Target Size (Minimum)** | AA | — | **PASS (verified).** shadcn `Button` sizes: default `h-9` (36px), `sm` `h-8` (32px), `icon-sm` `size-8` (32px). All ≥ 24×24. | — | No action. |
| **3.1.1 Language of Page** | A | `client/index.html:2` | **PASS.** `<html lang="en">` present and correct. | — | No action. |
| **2.1.1 / 2.1.2 Keyboard** | A | — | **PASS on static evidence.** Zero `onClick` on `<div>`/`<span>`/`<li>`, zero positive `tabIndex`, zero `outline: none` without a `focus-visible` replacement. All interactive elements are real `<button>`s or Radix primitives. *(Note: the focus ring is present but invisible — that's 1.4.11 above, not a keyboard-operability failure.)* Traps cannot be ruled out statically (§6). | — | No action; verify at runtime. |
| **1.2.2 / 1.2.5 / 2.5.7 / 3.3.7** | A/AA | — | **N/A.** No prerecorded media (zero `<video>`/`<audio>`), no `<img>` elements at all, no drag interactions, no redundant re-entry of previously-supplied data across the wizard. | — | No action. |

---

## 2. Exact code for the BLOCKER fixes

### 2.1 Wizard answer controls → real radio group

Replaces `Wizard.tsx:196-301`. Fixes 4.1.2, 1.4.1, 3.3.2, 1.3.1 together.

```tsx
{section.questions.map((question) => {
  const selected = answers[sectionNumber]?.[question.id];
  const opts =
    question.type === "yes_no"
      ? [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }]
      : [{ v: "yes", label: "Yes" }, { v: "partial", label: "Partial" }, { v: "no", label: "No" }];

  return (
    <div key={question.id} className="border-b border-slate-700 pb-8 last:border-0">
      {question.type === "text" ? (
        <>
          <label htmlFor={`q-${question.id}`} className="text-white font-medium block mb-2">
            {question.text}
          </label>
          {question.hint && (
            <p id={`hint-${question.id}`} className="text-sm text-slate-400 mb-4">{question.hint}</p>
          )}
          <textarea
            id={`q-${question.id}`}
            aria-describedby={question.hint ? `hint-${question.id}` : undefined}
            className="w-full bg-slate-900 border border-slate-500 rounded px-3 py-2 text-white placeholder:text-slate-400"
            placeholder="Enter your response..."
            value={selected || ""}
            onChange={(e) => handleAnswer(question.id, e.target.value)}
            rows={3}
            disabled={isSaving}
          />
        </>
      ) : (
        <fieldset
          role="radiogroup"
          aria-describedby={question.hint ? `hint-${question.id}` : undefined}
          disabled={isSaving}
        >
          <legend className="text-white font-medium mb-2">
            {question.text}
            <span className="sr-only"> — {question.weight} priority</span>
          </legend>
          {question.hint && (
            <p id={`hint-${question.id}`} className="text-sm text-slate-400 mb-4">{question.hint}</p>
          )}
          <div className="flex gap-4">
            {opts.map(({ v, label }) => {
              const isOn = selected === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={isOn}
                  onClick={() => handleAnswer(question.id, v)}
                  disabled={isSaving}
                  className={`inline-flex items-center gap-2 rounded-md border-2 px-4 h-9 text-sm font-medium
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400
                    ${isOn
                      ? "border-white bg-slate-700 text-white"
                      : "border-slate-500 bg-transparent text-slate-300"}`}
                >
                  {/* non-colour channel: a check mark, not just a hue */}
                  <Check aria-hidden="true" className={isOn ? "size-4" : "size-4 invisible"} />
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
})}
```

Three independent channels now carry "selected": `aria-checked` (assistive tech), the check glyph (shape), and border+fill weight (luminance, not hue). Import `Check` from `lucide-react`. Note the weight badge (`Wizard.tsx:207-217`) already carries its own text — it passes contrast (8.23:1 / 8.45:1 / 12.55:1, all verified) and needs no change beyond the `sr-only` association above.

Roving-tabindex arrow-key navigation is the ideal radiogroup behaviour but is **not** required by 2.1.1 — each option is independently tabbable here, which is operable and conformant. If you want the full pattern, use Radix `RadioGroup` (already a dependency: `@radix-ui/react-radio-group`).

### 2.2 Auth error identification + announcement

`Login.tsx` — same shape for `Signup.tsx`:

```tsx
<Input
  id="password"
  type="password"
  autoComplete="current-password"
  aria-invalid={!!error}
  aria-describedby={error ? "login-error" : undefined}
  /* ...rest unchanged... */
/>

{error && (
  <p id="login-error" role="alert" className="text-red-400 text-sm">
    {error}
  </p>
)}
```

`role="alert"` carries an implicit `aria-live="assertive"`. Because the node is conditionally mounted, the alert fires on mount — correct here. Do not also move focus; the alert announcement is sufficient and less disruptive.

### 2.3 Wizard save + score live region

```tsx
// derive from the existing mutation state — no new state needed
<div aria-live="polite" className="sr-only">
  {isSaving ? "Saving answer" : saveSection.isSuccess ? "Answer saved" : ""}
</div>

// announce the score, not just paint it (Wizard.tsx:176-178)
<div className={`text-3xl font-bold ${getRiskColor()}`} aria-live="polite">
  {overallScore.toFixed(0)}%<span className="sr-only"> overall compliance — {riskLevel} risk</span>
</div>
```

The `sr-only` suffix also fixes 1.4.1 on the headline score, which currently conveys risk level through hue alone.

### 2.4 Skip link + main landmark

`App.tsx`:

```tsx
<TooltipProvider>
  <Toaster />
  <a
    href="#main"
    className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4
               focus:rounded-md focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white
               focus:outline-2 focus:outline-blue-400"
  >
    Skip to main content
  </a>
  <AppRouter />
</TooltipProvider>
```

Then on **every** page, the top-level content wrapper becomes `<main id="main" tabIndex={-1}>`. In `Home.tsx` the `<header>` stays outside it. `tabIndex={-1}` is required or the skip target won't take focus in Safari.

---

## 3. Corrected palette

Brand identity here is **amber on slate**. Both survive. Every value below is computed against the actual surfaces in use.

### 3.1 Token changes

| Token / class | Current | Ratio | Replace with | New ratio |
|---|---|---|---|---|
| Primary CTA (label) | `bg-amber-600 text-white` | 3.19:1 ❌ | `bg-amber-600 text-slate-950` | **6.32:1** ✅ |
| Primary CTA (no explicit fg — 11 of 14 sites) | `bg-amber-600` + inherited `text-primary-foreground` (blue-50) | 2.93:1 ❌ | `bg-amber-600 text-slate-950` | **6.32:1** ✅ |
| Primary CTA (hover) | `hover:bg-amber-700` + `text-slate-950` | 3.99:1 ❌ | `hover:bg-amber-500` | **9.40:1** ✅ |
| Focus ring (`index.css:102`) | `oklch(0.488 0.243 264.376)` @ 50% | 1.57:1 ❌ | `oklch(70.7% 0.165 254.624)` (blue-400) **at full opacity** | **5.56:1** ✅ |
| Muted text / placeholders | `slate-500` `#62748e` | 3.74:1 ❌ | `slate-400` `#90a1b9` | **6.79:1** ✅ |
| Input borders | `slate-600` `#45556c` | 2.36:1 ❌ | `slate-500` `#62748e` | **3.74:1** ✅ |
| Small bold score text (red) | `red-500` `#fb2c36` | 3.84:1 ❌ | `red-400` `#ff6467` | **5.07:1** ✅ |

The amber CTA fix is the important one for brand: **keep `amber-600` as the fill** and darken the label. That preserves the exact brand hue on the most visible element while going from a fail to a comfortable pass.

> **Correction, 2026-07-15.** Two errors in the original draft of this audit, both of which understated the problem — recorded here rather than silently overwritten, since this document is meant to be discoverable by opposing counsel and its revision history matters:
>
> 1. The CTA finding reported **3.19:1**, derived from `text-white`. Only 3 of the 14 `bg-amber-600` call sites actually set `text-white`. The other 11 inherit the Button default `text-primary-foreground`, which this theme maps to blue-50 — **2.93:1**, worse than reported.
> 2. The recommended fix kept `hover:bg-amber-700`. With `text-slate-950` that computes to **3.99:1** — it would have passed at rest and failed on hover, since hover is a state the label is read in. The corrected fix lightens the hover to `amber-500`.
>
> Both were caught by the regression test (`client/src/__a11y__/amber-cta.test.tsx`) during remediation, which is the argument for computing ratios in CI rather than transcribing them into a document.

### 3.2 Status colours — hue alone cannot carry these

Computed collapse pairs on the current palette (this is why "just fix the ratios" is insufficient):

| Vision | Collapsing pair | Ratio between them |
|---|---|---|
| Normal | yellow-500 / green-500 | 1.16:1 |
| Protanopia | yellow-500 / green-500 | 1.05:1 |
| **Deuteranopia** | **red-500 / green-500** | **1.13:1** |
| Deuteranopia | orange-500 / green-500 | 1.12:1 |
| Deuteranopia | red-500 / orange-500 | 1.27:1 |
| Tritanopia | yellow-500 / green-500 | 1.17:1 |
| Achromatopsia | yellow-500 / green-500 | 1.16:1 |

Under deuteranopia, red-500 → `#9c9c1b` and green-500 → `#a6a658`. **They are the same colour.** No hue substitution fixes a 4-step scale for deuteranopia — the red/green axis simply isn't available. So:

**Rule: every status must carry a redundant non-hue channel.** Use a luminance-ordered ramp *plus* a shape and a text label:

| Status | Colour (text on slate-800) | Ratio | Icon | Text |
|---|---|---|---|---|
| Critical | `red-400` `#ff6467` | 5.07:1 | `AlertTriangle` (▲) | "Critical" |
| High | `orange-300` `#ffb86a` | 8.61:1 | `AlertCircle` (●!) | "High" |
| Medium | `yellow-300` `#ffdf20` | 11.08:1 | `AlertCircle` (●) | "Medium" |
| Low | `green-400` `#05df72` | 8.26:1 | `CheckCircle2` (✓) | "Low" |

The icons are distinct **shapes**, so they survive achromatopsia. `Dashboard.tsx:165-168` already does the right thing with its emoji + word ("🔴 Critical") — that pattern should be applied to `Wizard.tsx:336-346` and `Dashboard.tsx:214`, which are currently hue-only.

---

## 4. Remediation order (optimised for legal exposure)

Core conversion flow for this product: **Home → Signup → Wizard (9-section assessment) → Dashboard → Pricing → Stripe Checkout → Documents**. A demand letter will cite the flow that blocked the plaintiff, so fix in flow order, weighted by whether the barrier is total.

**Phase 1 — total blockers on the money path (do first, days not sprints)**
1. **Focus ring** (`index.css:102`, one line). Blocks keyboard users on *every* screen including checkout. Cheapest fix, widest blast radius. Do it today.
2. **Auth errors + autocomplete** (`Login.tsx`, `Signup.tsx`). Silent failure at the funnel entrance. A plaintiff who cannot sign up never reaches anything else — this is the most likely cited barrier.
3. **Wizard radio group** (§2.1). The largest single fix, and it clears four SCs at once. This is the core task and the gate to the paid product.
4. **Primary CTA contrast** (one class, ~9 call sites). Every conversion action.

**Phase 2 — perceivability across the flow**
5. Skip link + `<main>` landmarks.
6. `maximum-scale` removal (one line).
7. Muted text + input border ratios (palette-level).
8. Wizard live regions for save/score.

**Phase 3 — deliverable and polish**
9. **PDF tagging.** Highest *severity* on the list but deliberately not first: it needs a pipeline change, not a patch, and it sits *after* payment — a plaintiff blocked at signup never reaches it. Don't let its size stall Phase 1. Start the spike now, ship in the statement (§5) with a real date.
10. Status-colour redundancy in the Wizard sidebar.
11. Icon `aria-hidden`, heading order, link underlines.

**Unscheduled but urgent: audit Stripe Checkout.** It is inside the core flow and outside this audit. If Checkout has a barrier, everything above is moot for a paying plaintiff.

---

## 5. Draft Accessibility Statement

> Do not publish this until Phase 1 is actually done and the dates below are real. A statement claiming conformance you don't have is worse than no statement — it becomes an admission. Fill the bracketed fields.

---

### Accessibility Statement for [Product Name]

**Last reviewed:** [DATE]

**Our commitment.** We want every dealership professional, including those with disabilities, to be able to assess their FTC Safeguards compliance and obtain their documentation.

**Standard.** We are working toward conformance with the **Web Content Accessibility Guidelines (WCAG) 2.2, Level AA**.

**Current conformance status: non-conformant.** Conformance is assessed per page and per flow; the barriers below mean we do not currently claim conformance for any flow. As of [DATE], based on an internal audit conducted [DATE]:

| Flow | Status |
|---|---|
| Marketing / home | Partially conformant — known issues below |
| Account signup and login | Partially conformant — known issues below |
| Compliance assessment (wizard) | **Non-conformant** — see Known Exception 1 |
| Compliance dashboard | Partially conformant |
| Payment (processed by Stripe) | Not yet assessed — see Known Exception 3 |
| Generated WISP / board report PDFs | **Non-conformant** — see Known Exception 2 |

**Known exceptions and remediation dates:**

1. **Compliance assessment answer controls** (WCAG 4.1.2, 1.4.1, 3.3.2). Assessment answer buttons do not expose their selected state to assistive technology, and selection is indicated by colour alone. Users of screen readers, and users with red-green colour blindness, cannot reliably determine which answers are recorded. *Target remediation: [DATE].*
2. **Generated PDF documents** (WCAG 1.3.1). The WISP and board report are produced as untagged PDFs and are not readable by screen readers. *Interim measure:* contact us at the address below and we will supply an accessible version of your documents in an alternative format within [N] business days at no charge. *Target remediation: [DATE].*
3. **Payment pages.** Checkout is provided by Stripe, a third party. We have not independently assessed it and do not control its code. If you encounter a barrier during payment, contact us and we will complete your purchase by an alternative method.
4. **Focus visibility and form errors.** Keyboard focus indicators and sign-in error messages did not meet contrast and announcement requirements. *Status: [remediated on DATE / target DATE].*

**Assessment method.** Internal audit of source code and computed colour contrast, [DATE]. This audit was **not** validated by screen-reader testing with disabled users. We intend to commission an independent third-party audit including assistive-technology testing by [DATE].

**Feedback.** We welcome reports of barriers.

- Email: **[accessibility@yourdomain.com]** — a monitored inbox, not an alias to a general queue.
- Phone / relay: [NUMBER]
- We aim to acknowledge within **2 business days** and to respond substantively within **10 business days**.

If you are dissatisfied with our response, [escalation contact].

---

## 6. What this audit CANNOT tell you

Automated and static analysis detects roughly a third of real barriers. This audit was **static only** — no browser was opened, no screen reader was run. The findings above are code-level facts; the following are not established either way, and **absence from the findings table is not evidence of conformance**:

**Not verifiable statically — must be manually tested:**

| SC | What must be tested | How |
|---|---|---|
| 1.4.10 Reflow | Whether any page 2-D scrolls at 320px. The `md:grid-cols-3` / `lg:grid-cols-3` grids (`Dashboard.tsx:159,196`, `Wizard.tsx:188`, `Home.tsx:69`) collapse to one column, which is promising, but `Dashboard.tsx:104,124` use `flex justify-between` with no wrap — likely overflow at 320px. **Check first.** | Browser at 320×256, look for horizontal scrollbar |
| 1.4.12 Text spacing | Whether text clips when line-height 1.5 / letter-spacing 0.12em / word-spacing 0.16em / paragraph-spacing 2em are forced. `whitespace-nowrap` on the wizard weight badge (`Wizard.tsx:208`) is a clipping candidate. | Text-spacing bookmarklet |
| 2.4.3 Focus order | Whether DOM order matches visual order. Suspect: `Wizard.tsx:188` — the question column is `lg:col-span-2` and the sidebar (which holds **Previous/Next**) follows it in the DOM. Verify the nav buttons come at a sensible point in the tab sequence. | Tab through, watch the ring |
| 2.4.11 Focus not obscured | Whether the sticky header (`Wizard.tsx:168`) covers focused elements on scroll. | Tab down past the fold |
| 2.1.2 Keyboard trap | Cannot be proven absent from source. | Tab through every page, both directions |
| 1.4.3 over gradients | Every page sits on `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900`. I computed against both endpoints, but text over the *transition band* was not sampled pixel-by-pixel. | Screenshot + pixel-sample the actual rendered gradient |
| 3.2.2 On input | `Dashboard.tsx:76-79` calls `setLocation("/login")` **during render** — this is a React correctness bug (side effect in render) and may cause an unannounced context change. Worth fixing regardless of WCAG. | Runtime |
| 4.1.2 Radix internals | The shadcn/Radix primitives (`dialog`, `select`, `dropdown-menu`, `popover`, `carousel`) are largely unused by the audited pages. Radix generally implements focus trap / restore / Escape / `aria-modal` correctly, but **I did not verify them at runtime, and I did not audit the 60+ unused `components/ui/*` files.** If any get wired into a flow, re-audit. | Runtime |

**Modals / menus / carousels:** the audit request asked for each to be audited separately for focus trap, focus restore, Escape, `aria-modal`, and background inert. **The audited pages contain none of these patterns in active use** — the primitives exist in `components/ui/` but aren't rendered by any page in the core flow. There is nothing to report, which is different from reporting a pass.

**Required manual test matrix before any conformance claim:**
- **NVDA + Firefox** (Windows) — the most common combination in litigation testing
- **VoiceOver + Safari** (macOS and iOS)
- **JAWS + Chrome** — if enterprise dealership customers are in scope
- **Keyboard only**, no mouse, every flow end to end
- **200% and 400% browser zoom**; 320px viewport
- **Testing by actual disabled users**, not simulation. My CVD figures are matrix simulations — they're sound arithmetic and good for finding collapses, but they are not a substitute for a colourblind person using the product.

**Explicitly out of scope and unaudited:** the deployed GitHub Pages build, Supabase's hosted auth UI and transactional emails, **Stripe Checkout** (inside the core flow — audit this), and Resend email templates.

---

## 7. Regression guard

None of the tooling below is currently installed. Install:

```bash
pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-jsx-a11y \
  @playwright/test @axe-core/playwright axe-core
```

### 7.1 Pre-commit lint — `eslint.config.js`

Catches the *structural* classes of finding above (label association, aria misuse, non-interactive handlers) at authoring time.

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      // errors, not warnings — these are the ones that actually bit us
      "jsx-a11y/label-has-associated-control": ["error", { assert: "either" }],
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/tabindex-no-positive": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/no-autofocus": "error",
    },
  },
  { ignores: ["client/src/components/ui/**", "dist/**", "node_modules/**"] }
);
```

`components/ui/**` is ignored because vendored shadcn code will fight the linter — but that means **anything you wire in from there is unguarded**. Re-audit on use.

Pre-commit via husky + lint-staged:

```json
{
  "lint-staged": {
    "client/src/**/*.{ts,tsx}": ["eslint --max-warnings=0"]
  }
}
```

### 7.2 axe + Playwright — `e2e/a11y.spec.ts`

Lint can't catch contrast or live regions. This can.

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const FLOWS = [
  { name: "home", path: "/" },
  { name: "signup", path: "/signup" },
  { name: "login", path: "/login" },
  { name: "pricing", path: "/pricing" },
  { name: "dashboard", path: "/dashboard", auth: true },
  { name: "wizard", path: "/wizard", auth: true },
  { name: "documents", path: "/documents", auth: true },
  { name: "profile", path: "/profile", auth: true },
];

for (const flow of FLOWS) {
  test(`${flow.name} has no WCAG 2.2 AA violations`, async ({ page }) => {
    if (flow.auth) await loginAsTestUser(page); // implement against a seeded test account
    await page.goto(flow.path);
    await page.waitForLoadState("networkidle"); // scores render after the tRPC query

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

// Regression locks — each pins a specific finding from the audit so it cannot silently return.
test("wizard answer controls expose selected state", async ({ page }) => {
  await loginAsTestUser(page);
  await page.goto("/wizard");
  const yes = page.getByRole("radio", { name: "Yes" }).first();
  await yes.click();
  await expect(yes).toHaveAttribute("aria-checked", "true");
});

test("login error is announced", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("viewport does not block zoom", async ({ page }) => {
  await page.goto("/");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toContain("maximum-scale");
});

test("skip link is reachable and targets main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to main/i });
  await expect(skip).toBeFocused();
  await skip.click();
  await expect(page.locator("main#main")).toBeFocused();
});

test("no horizontal scroll at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const flow of FLOWS.filter((f) => !f.auth)) {
    await page.goto(flow.path);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflows, `${flow.path} scrolls horizontally at 320px`).toBe(false);
  }
});
```

### 7.3 CI — add to `.github/workflows/`

```yaml
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec eslint client/src --max-warnings=0
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test e2e/a11y.spec.ts
```

Make this a **required status check** on `main`, otherwise it's decoration.

**What the guard does not do.** axe-core catches ~30–40% of WCAG issues. It would have caught the contrast failures, the missing `<main>`, and the missing form-label associations. It would **not** have caught: the colour-only answer selection (axe can't know hue is the sole state channel), the untagged PDFs, the unannounced autosave, or focus obscured by the sticky header. CI green ≠ accessible. The manual matrix in §6 is not optional.
