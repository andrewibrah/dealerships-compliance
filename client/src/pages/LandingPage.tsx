import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";
import { BarChart3, FileText, Shield, ChevronDown } from "lucide-react";
import { useState } from "react";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-slate-700 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="text-2xl font-bold text-amber-500">AAND</div>
          <div className="flex gap-4">
            <Button variant="ghost" onClick={() => setLocation("/pricing")}>
              Pricing
            </Button>
            <Button variant="ghost" onClick={() => setLocation("/login")}>
              Login
            </Button>
            <Button onClick={() => setLocation("/signup")} className="bg-amber-600 hover:bg-amber-700">
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
          FTC Safeguards Compliance Made Simple
        </h1>
        <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
          Guide your dealership through all 9 FTC Safeguards Rule elements, generate compliance documents, and track
          your progress with real-time scoring.
        </p>
        <div className="flex gap-4 justify-center">
          <Button
            size="lg"
            className="bg-amber-600 hover:bg-amber-700"
            onClick={() => setLocation("/signup")}
          >
            Start Free Assessment
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => setLocation("/pricing")}
          >
            View Pricing
          </Button>
        </div>
      </section>

      {/* FTC Urgency Banner */}
      <section className="bg-orange-950/30 border-y border-orange-600 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-orange-300 font-semibold mb-2">⚠️ Regulatory Deadline Alert</p>
          <p className="text-slate-300">
            FTC Safeguards Rule (16 CFR Part 314) requires all auto dealerships to maintain a Written Information
            Security Program. Non-compliance can result in significant penalties.
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-white text-center mb-16">Why Choose AAND?</h2>

        <div className="grid gap-8 md:grid-cols-3">
          <Card className="bg-slate-800 border-slate-700 p-8">
            <BarChart3 className="text-amber-500 mb-4" size={32} />
            <h3 className="text-xl font-bold text-white mb-3">9-Section Wizard</h3>
            <p className="text-slate-300">
              Complete all FTC Safeguards Rule elements with our interactive wizard. Get real-time scoring and identify
              compliance gaps.
            </p>
          </Card>

          <Card className="bg-slate-800 border-slate-700 p-8">
            <FileText className="text-blue-500 mb-4" size={32} />
            <h3 className="text-xl font-bold text-white mb-3">Auto-Generated Documents</h3>
            <p className="text-slate-300">
              Generate WISP and board-level compliance reports populated with your dealership data. Download as PDF.
            </p>
          </Card>

          <Card className="bg-slate-800 border-slate-700 p-8">
            <Shield className="text-green-500 mb-4" size={32} />
            <h3 className="text-xl font-bold text-white mb-3">Compliance Scoring</h3>
            <p className="text-slate-300">
              Track your compliance progress with section-level and overall scores. Identify critical gaps and
              prioritize improvements.
            </p>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-slate-800/50 py-20 border-y border-slate-700">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-white text-center mb-16">How It Works</h2>

          <div className="grid gap-8 md:grid-cols-4">
            <div className="text-center">
              <div className="bg-amber-600 text-white rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4 font-bold text-lg">
                1
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Create Account</h3>
              <p className="text-slate-400">Sign up and add your dealership information</p>
            </div>

            <div className="text-center">
              <div className="bg-amber-600 text-white rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4 font-bold text-lg">
                2
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Complete Wizard</h3>
              <p className="text-slate-400">Answer questions across all 9 compliance sections</p>
            </div>

            <div className="text-center">
              <div className="bg-amber-600 text-white rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4 font-bold text-lg">
                3
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Get Score</h3>
              <p className="text-slate-400">View your compliance score and gap analysis</p>
            </div>

            <div className="text-center">
              <div className="bg-amber-600 text-white rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4 font-bold text-lg">
                4
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Generate Docs</h3>
              <p className="text-slate-400">Create WISP and board reports (Core plan)</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-white text-center mb-16">Trusted by Auto Dealerships</h2>

        <div className="grid gap-8 md:grid-cols-3 mb-12">
          <Card className="bg-slate-800 border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-amber-500">★</span>
              ))}
            </div>
            <p className="text-slate-300 mb-4">
              "AAND made compliance simple. We went from confused about the FTC requirements to having a complete WISP
              in just a few hours."
            </p>
            <p className="font-semibold text-white">John Smith</p>
            <p className="text-sm text-slate-400">Owner, Smith Auto Group</p>
          </Card>

          <Card className="bg-slate-800 border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-amber-500">★</span>
              ))}
            </div>
            <p className="text-slate-300 mb-4">
              "The scoring system helped us identify exactly where we needed to improve. Our board loved the annual
              report."
            </p>
            <p className="font-semibold text-white">Sarah Johnson</p>
            <p className="text-sm text-slate-400">Compliance Manager, Premier Motors</p>
          </Card>

          <Card className="bg-slate-800 border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-amber-500">★</span>
              ))}
            </div>
            <p className="text-slate-300 mb-4">
              "Great tool for staying on top of regulatory requirements. The reminders keep us from falling behind on
              compliance."
            </p>
            <p className="font-semibold text-white">Mike Chen</p>
            <p className="text-sm text-slate-400">IT Director, Midwest Auto Group</p>
          </Card>
        </div>

        <div className="grid gap-8 md:grid-cols-3 text-center">
          <div>
            <div className="text-4xl font-bold text-amber-500 mb-2">500+</div>
            <p className="text-slate-300">Dealerships Assessed</p>
          </div>
          <div>
            <div className="text-4xl font-bold text-amber-500 mb-2">98%</div>
            <p className="text-slate-300">Customer Satisfaction</p>
          </div>
          <div>
            <div className="text-4xl font-bold text-amber-500 mb-2">$0</div>
            <p className="text-slate-300">Setup Fee</p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-slate-800/50 py-20 border-y border-slate-700">
        <div className="container mx-auto px-4 max-w-2xl">
          <h2 className="text-4xl font-bold text-white text-center mb-16">Frequently Asked Questions</h2>

          <div className="space-y-4">
            {[
              {
                question: "What is the FTC Safeguards Rule?",
                answer:
                  "The FTC Safeguards Rule (16 CFR Part 314) requires auto dealerships to establish and maintain a Written Information Security Program (WISP) to protect customer information.",
              },
              {
                question: "Do I need to pay to get started?",
                answer:
                  "No! Our Free plan includes the 9-section compliance wizard and scoring. Upgrade to Core ($199/month) to generate PDF documents.",
              },
              {
                question: "How long does the assessment take?",
                answer:
                  "Most dealerships complete the 9-section wizard in 2-3 hours. You can save your progress and return anytime.",
              },
              {
                question: "Can I update my answers later?",
                answer:
                  "Yes! Your answers are saved automatically. You can update them anytime and regenerate your documents.",
              },
              {
                question: "What if I don't comply with the FTC Safeguards Rule?",
                answer:
                  "Non-compliance can result in significant FTC penalties, reputational damage, and legal liability. AAND helps you achieve and maintain compliance.",
              },
            ].map((faq, index) => (
              <Card
                key={index}
                className="bg-slate-800 border-slate-700 p-6 cursor-pointer hover:border-amber-600 transition-colors"
                onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">{faq.question}</h3>
                  <ChevronDown
                    className={`text-amber-500 transition-transform ${expandedFaq === index ? "rotate-180" : ""}`}
                    size={20}
                  />
                </div>
                {expandedFaq === index && (
                  <p className="text-slate-300 mt-4">{faq.answer}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-white text-center mb-16">Simple, Transparent Pricing</h2>

        <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
          {/* Free Plan */}
          <Card className="bg-slate-800 border-slate-700 p-8 flex flex-col">
            <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
            <p className="text-slate-400 mb-6">Get started with compliance assessment</p>

            <div className="mb-8">
              <div className="text-4xl font-bold text-white mb-2">$0</div>
              <p className="text-slate-400">Forever free</p>
            </div>

            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-center gap-3">
                <span className="text-green-500">✓</span>
                <span className="text-slate-300">9-section compliance wizard</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-green-500">✓</span>
                <span className="text-slate-300">Real-time compliance scoring</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-green-500">✓</span>
                <span className="text-slate-300">Gap analysis and recommendations</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-green-500">✓</span>
                <span className="text-slate-300">Dashboard and progress tracking</span>
              </li>
            </ul>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/signup")}
            >
              Get Started Free
            </Button>
          </Card>

          {/* Core Plan */}
          <Card className="bg-slate-800 border-2 border-amber-600 p-8 flex flex-col">
            <div className="bg-amber-600 text-white px-3 py-1 rounded-full w-fit mb-4 text-sm font-semibold">
              Most Popular
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Core</h3>
            <p className="text-slate-400 mb-6">Full compliance suite for dealerships</p>

            <div className="mb-8">
              <div className="text-4xl font-bold text-amber-500 mb-2">
                $199<span className="text-lg text-slate-400">/month</span>
              </div>
              <p className="text-slate-400">Billed monthly, cancel anytime</p>
            </div>

            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-center gap-3">
                <span className="text-green-500">✓</span>
                <span className="text-slate-300">Everything in Free, plus:</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-green-500">✓</span>
                <span className="text-slate-300">WISP PDF generation</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-green-500">✓</span>
                <span className="text-slate-300">Board-level compliance reports</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-green-500">✓</span>
                <span className="text-slate-300">Email compliance reminders</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-green-500">✓</span>
                <span className="text-slate-300">Priority support</span>
              </li>
            </ul>

            <Button
              className="w-full bg-amber-600 hover:bg-amber-700"
              onClick={() => setLocation("/pricing")}
            >
              Upgrade to Core
            </Button>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-4xl font-bold text-white mb-6">Ready to Get Compliant?</h2>
        <p className="text-xl text-slate-300 mb-8">
          Start your free FTC Safeguards assessment today. No credit card required.
        </p>
        <Button
          size="lg"
          className="bg-amber-600 hover:bg-amber-700"
          onClick={() => setLocation("/signup")}
        >
          Start Free Assessment
        </Button>
      </section>



      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900/50 py-8">
        <div className="container mx-auto px-4 text-center text-slate-400">
          <p>&copy; 2026 AAND Compliance Engine. All rights reserved.</p>
          <p className="text-sm mt-2">
            Not affiliated with the FTC. AAND helps dealerships understand and comply with FTC Safeguards Rule
            requirements.
          </p>
        </div>
      </footer>
    </div>
  );
}
