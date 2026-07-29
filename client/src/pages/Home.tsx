import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { ShieldCheck, FileText, ClipboardCheck, Users } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const primaryCta = () => setLocation(isAuthenticated ? "/dashboard" : "/signup");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Nav */}
      <header className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-amber-500" size={24} />
            <span className="font-bold text-white">Safeguards Compliance Engine</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="text-slate-300" onClick={() => setLocation("/pricing")}>
              Pricing
            </Button>
            {isAuthenticated ? (
              <Button className="bg-amber-600 hover:bg-amber-500 text-slate-950" onClick={() => setLocation("/dashboard")}>
                Dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" className="text-slate-300" onClick={() => setLocation("/login")}>
                  Log in
                </Button>
                <Button className="bg-amber-600 hover:bg-amber-500 text-slate-950" onClick={() => setLocation("/signup")}>
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero. Positioned on the buyer's actual problem — nobody can tell them where they stand —
          rather than on penalties. Fear converts once; legibility is what earns the second
          engagement, and dealership operators have heard the fear pitch from every vendor. */}
      <section className="container mx-auto px-4 py-24 text-center max-w-3xl">
        <div className="inline-flex items-center gap-2 border border-slate-600 bg-slate-800/60 text-slate-300 text-sm px-4 py-1.5 rounded-full mb-6">
          <ShieldCheck size={14} aria-hidden="true" />
          Built only for franchised auto dealerships · 16 CFR Part 314
        </div>
        <h1 className="text-5xl font-bold text-white mb-6">
          Stop guessing whether your dealership is actually covered
        </h1>
        <p className="text-xl text-slate-300 mb-10">
          Most stores cannot answer three questions: which controls are really working, which gaps
          are ours versus the DMS vendor's, and what has to happen in the next 30 days. Answer a
          9-section assessment and get a plan with a named owner, the outside party who has to
          participate, and the artifact that proves each item is closed.
        </p>
        <div className="flex justify-center gap-4">
          <Button size="lg" className="bg-amber-600 hover:bg-amber-500 text-slate-950" onClick={primaryCta}>
            {isAuthenticated ? "Go to your dashboard" : "Start free assessment"}
          </Button>
          <Button size="lg" variant="outline" onClick={() => setLocation("/pricing")}>
            View pricing
          </Button>
        </div>
      </section>

      {/* Value props */}
      <section className="container mx-auto px-4 pb-24">
        <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
          <Card className="bg-slate-800 border-slate-700 p-8">
            <ClipboardCheck className="text-amber-500 mb-4" size={28} aria-hidden="true" />
            <h3 className="text-lg font-bold text-white mb-2">Findings you can check, not take on faith</h3>
            <p className="text-slate-300 text-sm">
              Every gap cites the §314.4 subsection it comes from and the answer that triggered it.
              Nothing is inferred by a model, and an unanswered question is reported as unknown —
              never as a failure. The tool will tell you when a control is already adequate.
            </p>
          </Card>
          <Card className="bg-slate-800 border-slate-700 p-8">
            <Users className="text-amber-500 mb-4" size={28} aria-hidden="true" />
            <h3 className="text-lg font-bold text-white mb-2">A plan with owners, not a 70-page report</h3>
            <p className="text-slate-300 text-sm">
              Each open item names the accountable role — you, the GM, your IT provider, HR — flags
              when the DMS vendor has to be in the room, and states the artifact that proves it is
              closed. Sequenced across 30, 60, and 90 days.
            </p>
          </Card>
          <Card className="bg-slate-800 border-slate-700 p-8">
            <FileText className="text-amber-500 mb-4" size={28} aria-hidden="true" />
            <h3 className="text-lg font-bold text-white mb-2">Proof that the program moved</h3>
            <p className="text-slate-300 text-sm">
              Generate your WISP, written risk assessment, incident response plan, policies, and a
              board report from your real answers — then reassess and show ownership, your insurer,
              and an examiner what changed since last quarter.
            </p>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700">
        <div className="container mx-auto px-4 py-8 text-center text-sm text-slate-500">
          Built for automotive dealerships subject to the FTC Safeguards Rule (16 CFR Part 314).
        </div>
      </footer>
    </div>
  );
}
