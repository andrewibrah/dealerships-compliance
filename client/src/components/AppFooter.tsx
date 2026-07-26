import { APP_DISCLAIMER } from "@shared/security-architecture";

/**
 * Persistent app-wide disclaimer (PRD #4). Rendered once below the router in App.tsx so it appears
 * on every page. A real <footer> landmark; slate-300 on slate-900 clears WCAG AA for body text.
 */
export default function AppFooter() {
  return (
    <footer className="border-t border-slate-700 bg-slate-900">
      <div className="container mx-auto px-4 py-4">
        <p className="text-xs leading-relaxed text-slate-300">{APP_DISCLAIMER}</p>
      </div>
    </footer>
  );
}
