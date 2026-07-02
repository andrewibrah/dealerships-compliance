import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ProfileForm = {
  name: string;
  address: string;
  city: string;
  state: string;
  dmsVendor: string;
  rooftopCount: string;
  qualifiedIndividual: string;
  qiEmail: string;
};

const emptyForm: ProfileForm = {
  name: "",
  address: "",
  city: "",
  state: "",
  dmsVendor: "",
  rooftopCount: "1",
  qualifiedIndividual: "",
  qiEmail: "",
};

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const dealershipQuery = trpc.dealership.getCurrent.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [form, setForm] = useState<ProfileForm>(emptyForm);

  useEffect(() => {
    if (!dealershipQuery.data) return;
    setForm({
      name: dealershipQuery.data.name || "",
      address: dealershipQuery.data.address || "",
      city: dealershipQuery.data.city || "",
      state: dealershipQuery.data.state || "",
      dmsVendor: dealershipQuery.data.dmsVendor || "",
      rooftopCount: String(dealershipQuery.data.rooftopCount || 1),
      qualifiedIndividual: dealershipQuery.data.qualifiedIndividual || "",
      qiEmail: dealershipQuery.data.qiEmail || "",
    });
  }, [dealershipQuery.data]);

  const onSaved = async () => {
    await utils.dealership.getCurrent.invalidate();
    toast.success("Dealership profile saved");
    setLocation("/dashboard");
  };

  const createProfile = trpc.dealership.create.useMutation({
    onSuccess: onSaved,
    onError: (error) => toast.error(error.message),
  });
  const updateProfile = trpc.dealership.update.useMutation({
    onSuccess: onSaved,
    onError: (error) => toast.error(error.message),
  });

  if (loading || (isAuthenticated && dealershipQuery.isLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-500" size={40} />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const isSaving = createProfile.isPending || updateProfile.isPending;

  const setField = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const name = form.name.trim();
    const qiEmail = form.qiEmail.trim();
    const rooftopCount = Number(form.rooftopCount);

    if (!name) {
      toast.error("Dealership name is required");
      return;
    }
    if (!Number.isInteger(rooftopCount) || rooftopCount < 1) {
      toast.error("Rooftop count must be at least 1");
      return;
    }
    if (qiEmail && !emailPattern.test(qiEmail)) {
      toast.error("Enter a valid Qualified Individual email");
      return;
    }

    const payload = {
      name,
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      dmsVendor: form.dmsVendor.trim(),
      rooftopCount,
      qualifiedIndividual: form.qualifiedIndividual.trim(),
      qiEmail,
    };

    if (dealershipQuery.data) {
      updateProfile.mutate({ id: dealershipQuery.data.id, ...payload });
    } else {
      createProfile.mutate(payload);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white">Dealership Profile</h1>
            <p className="text-slate-400">These details appear in your WISP and board report.</p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <Card className="max-w-3xl bg-slate-800 border-slate-700 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="name" className="text-slate-300">Dealership name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="Smith Family Ford"
                  required
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="address" className="text-slate-300">Street address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(event) => setField("address", event.target.value)}
                  placeholder="123 Main Street"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city" className="text-slate-300">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(event) => setField("city", event.target.value)}
                  placeholder="Dallas"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state" className="text-slate-300">State</Label>
                <Input
                  id="state"
                  value={form.state}
                  onChange={(event) => setField("state", event.target.value.toUpperCase().slice(0, 2))}
                  placeholder="TX"
                  maxLength={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dmsVendor" className="text-slate-300">DMS vendor</Label>
                <Input
                  id="dmsVendor"
                  value={form.dmsVendor}
                  onChange={(event) => setField("dmsVendor", event.target.value)}
                  placeholder="Dealertrack, Reynolds, CDK..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rooftopCount" className="text-slate-300">Rooftop count</Label>
                <Input
                  id="rooftopCount"
                  type="number"
                  min={1}
                  step={1}
                  value={form.rooftopCount}
                  onChange={(event) => setField("rooftopCount", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="qualifiedIndividual" className="text-slate-300">Qualified Individual</Label>
                <Input
                  id="qualifiedIndividual"
                  value={form.qualifiedIndividual}
                  onChange={(event) => setField("qualifiedIndividual", event.target.value)}
                  placeholder="Jane Smith"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="qiEmail" className="text-slate-300">Qualified Individual email</Label>
                <Input
                  id="qiEmail"
                  type="email"
                  value={form.qiEmail}
                  onChange={(event) => setField("qiEmail", event.target.value)}
                  placeholder="jane@dealership.com"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setLocation("/dashboard")}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-amber-600 hover:bg-amber-700">
                {isSaving ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
