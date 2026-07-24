import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Send,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  nextStatuses,
  POLICY_STATUS_LABELS,
  type PolicyStatus,
} from "@shared/policy-lifecycle";

// Policy approval workflow + document viewer (PRD #26/#41). Lists the dealer's written policies
// with their status, version, and adoption date, and drives each policy through the lifecycle by
// calling policies.transition. The allowed actions per policy come from the SAME shared state
// machine the server enforces (nextStatuses), so the UI can only ever offer a valid move — the
// server is still the authority and rejects anything invalid.

const STATUS_BADGE: Record<PolicyStatus, string> = {
  draft: "bg-slate-700 border-slate-600 text-slate-200",
  in_review: "bg-amber-950/40 border-amber-700 text-amber-300",
  approved: "bg-emerald-950/40 border-emerald-700 text-emerald-300",
  adopted: "bg-emerald-800/40 border-emerald-400 text-emerald-100",
  archived: "bg-slate-800 border-slate-700 text-slate-400",
};

const ACTION: Record<PolicyStatus, { label: string; Icon: typeof Send }> = {
  draft: { label: "Return to draft", Icon: Undo2 },
  in_review: { label: "Submit for review", Icon: Send },
  approved: { label: "Approve", Icon: CheckCircle2 },
  adopted: { label: "Adopt", Icon: ShieldCheck },
  archived: { label: "Archive", Icon: Archive },
};

function formatDate(value: Date | string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function humanizeType(policyType: string): string {
  return policyType.replace(/_/g, " ");
}

export default function Policies() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();

  const policiesQuery = trpc.policies.list.useQuery(undefined, { enabled: isAuthenticated });

  const transition = trpc.policies.transition.useMutation({
    onSuccess: (policy) => {
      utils.policies.list.invalidate();
      toast.success(`Policy moved to ${POLICY_STATUS_LABELS[policy.status as PolicyStatus]}`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (loading || (isAuthenticated && policiesQuery.isLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-amber-500 mx-auto mb-4" size={40} aria-hidden="true" />
          <p className="text-slate-300">Loading your policies...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const policies = policiesQuery.data ?? [];
  const adoptedCount = policies.filter((p) => p.status === "adopted").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Policy Approvals</h1>
            <p className="text-slate-400">
              {adoptedCount} adopted · {policies.length} total — move each written policy from draft
              to formally adopted
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setLocation("/documents")}>
              <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
              Documents
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {policies.length === 0 ? (
          <Card className="bg-slate-800 border-slate-700 p-10">
            <div className="flex flex-col items-center text-center gap-4">
              <FileText className="text-amber-500" size={40} aria-hidden="true" />
              <div>
                <h2 className="text-xl font-bold text-white mb-1">No policies yet</h2>
                <p className="text-slate-300 max-w-md">
                  Generate a written policy from the Document Vault. It is saved here as a draft you
                  can review, approve, and formally adopt.
                </p>
              </div>
              <Button
                onClick={() => setLocation("/documents")}
                className="bg-amber-600 hover:bg-amber-500 text-slate-950"
              >
                Go to Document Vault
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {policies.map((policy) => {
              const status = policy.status as PolicyStatus;
              const actions = nextStatuses(status);
              return (
                <Card key={policy.id} className="bg-slate-800 border-slate-700 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-lg font-semibold text-slate-100">{policy.title}</h2>
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[status]}`}
                        >
                          {POLICY_STATUS_LABELS[status]}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 capitalize">{humanizeType(policy.policyType)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Version {policy.version} · Adopted {formatDate(policy.adoptedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {actions.length === 0 ? (
                        <span className="text-xs text-slate-500 self-center">
                          {status === "adopted" ? "Adopted — locked" : "Archived"}
                        </span>
                      ) : (
                        actions.map((target) => {
                          const { label, Icon } = ACTION[target];
                          return (
                            <Button
                              key={target}
                              size="sm"
                              onClick={() => transition.mutate({ id: policy.id, toStatus: target })}
                              disabled={transition.isPending}
                              className="bg-amber-600 hover:bg-amber-500 text-slate-950"
                            >
                              <Icon size={15} className="mr-2" aria-hidden="true" />
                              {label}
                            </Button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
