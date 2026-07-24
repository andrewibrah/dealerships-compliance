import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Link2,
  Loader2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { deriveEvidenceChecklist, type EvidenceRequest } from "@shared/evidence-checklist";
import { getApplicability, applicableRequirements } from "@shared/applicability";

// Evidence repository (PRD #31 upload, #32 control linking, #25 evidence-request checklist).
// Upload flow: file picker -> evidence.getUploadUrl (server-derived, tenant-scoped key) -> PUT the
// bytes to the signed URL -> evidence.create records the metadata. The checklist is the
// deterministic, applicability-aware view of every open control that still needs substantiating
// evidence (deriveEvidenceChecklist — no LLM). Linking is per-control via evidence.linkControl.

/** One checklist row: the open control's citation + requested evidence, whether evidence is linked,
 *  and a picker to link an existing evidence item. Its own listForControl query keeps the linked
 *  set live without an N-query loop in the parent (one hook per rendered row). */
function ChecklistRow({
  request,
  evidenceOptions,
  onLink,
  isLinking,
}: {
  request: EvidenceRequest;
  evidenceOptions: { id: number; title: string; fileName: string }[];
  onLink: (controlId: number, evidenceId: number) => void;
  isLinking: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const linkedQuery = trpc.evidence.listForControl.useQuery(
    { controlId: request.controlId },
    { enabled: isAuthenticated }
  );
  const linked = linkedQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string>("");
  const selectId = `link-evidence-${request.controlId}`;

  return (
    <li className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="font-medium text-slate-100">{request.title}</span>
        <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-mono text-slate-200">
          {request.citation}
        </span>
        <span className="text-xs text-slate-400">{request.sectionName}</span>
        {linked.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded bg-green-950/50 border border-green-700 px-2 py-0.5 text-xs font-semibold text-green-300">
            <CheckCircle2 size={12} aria-hidden="true" />
            {linked.length} linked
          </span>
        ) : (
          <span className="rounded bg-amber-950/40 border border-amber-700 px-2 py-0.5 text-xs font-semibold text-amber-300">
            Evidence needed
          </span>
        )}
      </div>
      <p className="text-sm text-slate-300 mb-3">{request.requestedEvidence}</p>

      {linked.length > 0 && (
        <ul className="mb-3 space-y-1">
          {linked.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-xs text-slate-400">
              <FileText size={12} aria-hidden="true" />
              <span className="text-slate-300">{e.title}</span>
              {e.fileName && <span className="text-slate-500">({e.fileName})</span>}
            </li>
          ))}
        </ul>
      )}

      {evidenceOptions.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label htmlFor={selectId} className="text-xs text-slate-400 mb-1">
              Link an uploaded file
            </label>
            <select
              id={selectId}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              <option value="">Select evidence…</option>
              {evidenceOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                  {e.fileName ? ` — ${e.fileName}` : ""}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedId || isLinking}
            onClick={() => {
              if (!selectedId) return;
              onLink(request.controlId, Number(selectedId));
              setSelectedId("");
            }}
          >
            <Link2 size={14} className="mr-2" aria-hidden="true" />
            Link
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Upload a file above, then link it here.</p>
      )}
    </li>
  );
}

export default function Evidence() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  const evidenceQuery = trpc.evidence.list.useQuery(undefined, { enabled: isAuthenticated });
  const controlsQuery = trpc.controls.list.useQuery(undefined, { enabled: isAuthenticated });
  const requirementsQuery = trpc.requirements.list.useQuery(undefined, { enabled: isAuthenticated });
  const dealershipQuery = trpc.dealership.getCurrent.useQuery(undefined, { enabled: isAuthenticated });

  const getUploadUrl = trpc.evidence.getUploadUrl.useMutation();
  const createEvidence = trpc.evidence.create.useMutation();
  const linkControl = trpc.evidence.linkControl.useMutation({
    onSuccess: (_data, variables) => {
      utils.evidence.listForControl.invalidate({ controlId: variables.controlId });
      toast.success("Evidence linked to control");
    },
    onError: (err) => toast.error(err.message),
  });

  const isLoading =
    isAuthenticated &&
    (evidenceQuery.isLoading ||
      controlsQuery.isLoading ||
      requirementsQuery.isLoading ||
      dealershipQuery.isLoading);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-amber-500 mx-auto mb-4" size={40} aria-hidden="true" />
          <p className="text-slate-300">Loading your evidence repository...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  // Scope-aware (PRD #7): the checklist only asks for evidence on in-scope, open controls. Default
  // (no consumer count) keeps the full catalog, identical to today.
  const applicability = getApplicability({
    consumerCount: dealershipQuery.data?.consumerCount ?? null,
  });
  const requirements = applicableRequirements(requirementsQuery.data ?? [], applicability);
  const controls = controlsQuery.data ?? [];
  const checklist = deriveEvidenceChecklist({ controls, requirements });
  const evidenceItems = evidenceQuery.data ?? [];
  const evidenceOptions = evidenceItems.map((e) => ({
    id: e.id,
    title: e.title,
    fileName: e.fileName,
  }));

  async function handleFileSelected(file: File) {
    const contentType = file.type || "application/octet-stream";
    setUploading(true);
    try {
      // 1) Server derives the tenant-scoped key + a signed upload URL (never trusts a client path).
      const { key, uploadUrl } = await getUploadUrl.mutateAsync({ fileName: file.name, contentType });
      // 2) Browser PUTs the raw bytes straight to Supabase Storage (token embedded in the URL).
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": contentType, "x-upsert": "false" },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status}). Is the evidence bucket set up?`);
      // 3) Record the metadata against the SERVER-derived key.
      await createEvidence.mutateAsync({
        title: title.trim() || file.name,
        storagePath: key,
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
      });
      utils.evidence.list.invalidate();
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Evidence uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(id: number) {
    try {
      const res = await utils.evidence.getUrl.fetch({ id });
      if (res?.url) window.open(res.url, "_blank");
      else toast.error("Download unavailable");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open file");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Evidence Repository</h1>
            <p className="text-slate-400">
              Upload the artifacts that substantiate your controls and link them to each Safeguards
              requirement
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
            Dashboard
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-5xl space-y-12">
        {/* Upload */}
        <Card className="bg-slate-800 border-slate-700 p-8">
          <div className="flex items-center gap-3 mb-4">
            <Upload className="text-amber-500" size={24} aria-hidden="true" />
            <h2 className="text-2xl font-bold text-white">Upload Evidence</h2>
          </div>
          <p className="text-slate-300 mb-6">
            Stored privately in your encrypted evidence bucket. Files are scoped to your dealership —
            only your team can retrieve them.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col">
              <label htmlFor="evidenceTitle" className="text-sm text-slate-300 mb-2">
                Title (optional)
              </label>
              <Input
                id="evidenceTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. MFA enforcement screenshot"
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="evidenceFile" className="text-sm text-slate-300 mb-2">
                File
              </label>
              <input
                ref={fileInputRef}
                id="evidenceFile"
                type="file"
                aria-label="Choose an evidence file to upload"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                }}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-slate-100 hover:file:bg-slate-600"
              />
            </div>
          </div>
          {uploading && (
            <p className="mt-4 flex items-center gap-2 text-sm text-amber-300">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Uploading…
            </p>
          )}
        </Card>

        {/* Evidence-request checklist (PRD #25) */}
        <Card className="bg-slate-800 border-slate-700 p-8">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="text-amber-500" size={24} aria-hidden="true" />
            <h2 className="text-2xl font-bold text-white">Evidence Requests</h2>
          </div>
          <p className="text-slate-300 mb-6">
            Every open control needs an artifact to prove it. Each item cites the §314.4 subsection it
            satisfies and the evidence an examiner would expect.
          </p>
          {checklist.length === 0 ? (
            <div className="flex items-center gap-3 text-green-400">
              <CheckCircle2 size={20} aria-hidden="true" />
              <p>
                No open controls need evidence right now. Answer more of the assessment, or keep this
                current as your posture changes.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {checklist.map((request) => (
                <ChecklistRow
                  key={request.controlId}
                  request={request}
                  evidenceOptions={evidenceOptions}
                  onLink={(controlId, evidenceId) => linkControl.mutate({ controlId, evidenceId })}
                  isLinking={linkControl.isPending}
                />
              ))}
            </ul>
          )}
        </Card>

        {/* Uploaded evidence */}
        <Card className="bg-slate-800 border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Uploaded Evidence</h2>
          {evidenceItems.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="mx-auto text-slate-500 mb-4" size={48} aria-hidden="true" />
              <p className="text-slate-400 mb-2">No evidence uploaded yet</p>
              <p className="text-sm text-slate-500">
                Upload your first artifact above to start substantiating your controls.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...evidenceItems]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border border-slate-700 rounded-lg px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="text-slate-400 flex-shrink-0" size={20} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">{item.title}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {item.fileName || "file"} · uploaded{" "}
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(item.id)}
                      aria-label={`Download ${item.title}`}
                    >
                      <Download size={16} className="mr-2" aria-hidden="true" />
                      Download
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
