import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { ShieldCheck, FileText, ClipboardCheck, AlertTriangle } from "lucide-react";

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
              <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setLocation("/dashboard")}>
                Dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" className="text-slate-300" onClick={() => setLocation("/login")}>
                  Log in
                </Button>
                <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setLocation("/signup")}>
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-24 text-center max-w-3xl">
        <div className="inline-flex items-center gap-2 border border-orange-600 bg-orange-950/30 text-orange-300 text-sm px-4 py-1.5 rounded-full mb-6">
          <AlertTriangle size={14} />
          FTC Safeguards Rule enforcement applies to every auto dealership
        </div>
        <h1 className="text-5xl font-bold text-white mb-6">
          Know exactly where your dealership stands on FTC Safeguards
        </h1>
        <p className="text-xl text-slate-300 mb-10">
          Complete a 9-section assessment built on 16 CFR Part 314, see your compliance gaps ranked by
          enforcement risk, and generate the WISP and board report your examiners and auditors expect.
        </p>
        <div className="flex justify-center gap-4">
          <Button size="lg" className="bg-amber-600 hover:bg-amber-700" onClick={primaryCta}>
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
            <ClipboardCheck className="text-amber-500 mb-4" size={28} />
            <h3 className="text-lg font-bold text-white mb-2">Assess all 9 Safeguards elements</h3>
            <p className="text-slate-300 text-sm">
              Answer plain-language questions covering the Qualified Individual, risk assessment, access
              controls, encryption, vendors, incident response, training, and monitoring. Answers save as
              you go.
            </p>
          </Card>
          <Card className="bg-slate-800 border-slate-700 p-8">
            <AlertTriangle className="text-amber-500 mb-4" size={28} />
            <h3 className="text-lg font-bold text-white mb-2">See gaps ranked by enforcement risk</h3>
            <p className="text-slate-300 text-sm">
              Your dashboard scores every section, flags critical gaps, and tells you what to fix first —
              weighted toward the areas the FTC actually enforces.
            </p>
          </Card>
          <Card className="bg-slate-800 border-slate-700 p-8">
            <FileText className="text-amber-500 mb-4" size={28} />
            <h3 className="text-lg font-bold text-white mb-2">Generate WISP & board reports</h3>
            <p className="text-slate-300 text-sm">
              Turn your answers into a Written Information Security Program and a board-ready annual
              compliance report, built from your actual assessment data.
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
