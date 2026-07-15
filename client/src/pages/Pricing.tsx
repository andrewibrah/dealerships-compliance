import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Pricing() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const createCheckout = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: ({ url }) => {
      if (url) {
        window.location.href = url;
      } else {
        toast.error("Checkout could not be started. Please try again.");
      }
    },
    onError: (error) => {
      toast.error("Checkout unavailable: " + error.message);
    },
  });

  const handleUpgrade = (plan: "core" | "managed") => {
    if (!isAuthenticated) {
      setLocation("/signup");
      return;
    }
    createCheckout.mutate({ plan });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h1>
          <p className="text-xl text-slate-300">
            Choose the plan that fits your dealership's compliance needs
          </p>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="container mx-auto px-4 py-16">
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
                <CheckCircle2 className="text-green-500" size={20} />
                <span className="text-slate-300">9-section compliance wizard</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-green-500" size={20} />
                <span className="text-slate-300">Real-time scoring</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-green-500" size={20} />
                <span className="text-slate-300">Gap analysis</span>
              </li>
              <li className="flex items-center gap-3">
                <AlertCircle className="text-slate-500" size={20} />
                <span className="text-slate-400">No PDF documents</span>
              </li>
              <li className="flex items-center gap-3">
                <AlertCircle className="text-slate-500" size={20} />
                <span className="text-slate-400">No email reminders</span>
              </li>
            </ul>

            <Button variant="outline" className="w-full" onClick={() => setLocation("/signup")}>
              Get Started
            </Button>
          </Card>

          {/* Core Plan */}
          <Card className="bg-amber-950/30 border-2 border-amber-600 p-8 flex flex-col ring-2 ring-amber-600/20">
            <div className="mb-4 inline-block">
              <span className="bg-amber-600 text-slate-950 px-3 py-1 rounded-full text-sm font-semibold">
                Most Popular
              </span>
            </div>

            <h3 className="text-2xl font-bold text-white mb-2">Core</h3>
            <p className="text-slate-300 mb-6">Full compliance toolkit for dealerships</p>

            <div className="mb-8">
              <div className="text-4xl font-bold text-amber-500 mb-2">$199</div>
              <p className="text-slate-400">per month, billed monthly</p>
            </div>

            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-green-500" size={20} />
                <span className="text-slate-300">Everything in Free</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-green-500" size={20} />
                <span className="text-slate-300">WISP PDF generation</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-green-500" size={20} />
                <span className="text-slate-300">Board-level compliance report</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-green-500" size={20} />
                <span className="text-slate-300">Document vault</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-green-500" size={20} />
                <span className="text-slate-300">Email reminders</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-green-500" size={20} />
                <span className="text-slate-300">Priority support</span>
              </li>
            </ul>

            <Button
              className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950"
              onClick={() => handleUpgrade("core")}
              disabled={createCheckout.isPending}
            >
              {createCheckout.isPending ? "Redirecting to checkout..." : "Upgrade to Core"}
            </Button>
          </Card>
        </div>

        {/* FAQ Section */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-12 text-center">Frequently Asked Questions</h2>

          <div className="space-y-6">
            <Card className="bg-slate-800 border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Can I cancel anytime?</h3>
              <p className="text-slate-300">
                Yes, you can cancel your subscription at any time. No long-term contracts required.
              </p>
            </Card>

            <Card className="bg-slate-800 border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">What payment methods do you accept?</h3>
              <p className="text-slate-300">
                We accept all major credit cards (Visa, Mastercard, American Express) via Stripe.
              </p>
            </Card>

            <Card className="bg-slate-800 border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Do you offer annual billing?</h3>
              <p className="text-slate-300">
                Contact us for annual billing options and potential discounts for multi-location dealerships.
              </p>
            </Card>

            <Card className="bg-slate-800 border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Is there a free trial?</h3>
              <p className="text-slate-300">
                Yes! Start with our Free plan to assess your compliance gaps. Upgrade anytime to access PDF documents.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
