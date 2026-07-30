import { Button } from "@/components/ui/button";
import { SessionDataError } from "@/components/SessionDataError";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Clock, ListChecks, Loader2, Sparkles, UserCheck } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  EFFORT_LABEL,
  HORIZON_LABEL,
  OWNER_LABEL,
  getCoordination,
  horizonFor,
  type Coordination,
  type Horizon,
} from "@shared/coordination";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

// Remediation task board (PRD #24/#40). Lists the dealer's tasks with inline status / owner /
// due-date edits, and a "Generate tasks from gaps" action that runs the deterministic,
// idempotent tasks.deriveFromControls on the server. No LLM, no client-side derivation.
//
// The board is sequenced, not just listed: open work is grouped into 30/60/90-day horizons by
// shared/coordination.ts, and each row names the accountable role. A gap list that does not say
// who acts and by when is the thing dealerships never execute.

type TaskRow = inferRouterOutputs<AppRouter>["tasks"]["list"][number];
type TaskStatus = TaskRow["status"];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_BADGE: Record<TaskRow["priority"], string> = {
  critical: "bg-red-950/50 border-red-700 text-red-300",
  high: "bg-orange-950/50 border-orange-700 text-orange-300",
  medium: "bg-yellow-950/40 border-yellow-700 text-yellow-300",
  low: "bg-slate-700 border-slate-600 text-slate-300",
};

const OPEN_STATUSES: TaskStatus[] = ["open", "in_progress", "blocked"];

const HORIZONS: Horizon[] = [30, 60, 90];

/** A Date (or null) from the server rendered for an <input type="date"> (yyyy-mm-dd). */
function toDateInputValue(due: Date | string | null): string {
  if (!due) return "";
  return new Date(due).toISOString().slice(0, 10);
}

/** A task plus the coordination facts for its requirement (null when the task is free-form or
 *  its requirement is not in the catalog — never fabricate an owner). */
type PlannedTask = TaskRow & { coordination: Coordination | null };

export default function Tasks() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading, refetchUser } = useAuth();
  const utils = trpc.useUtils();

  const tasksQuery = trpc.tasks.list.useQuery(undefined, { enabled: isAuthenticated });
  // The GLOBAL catalog — used only to resolve requirementId -> code so each task can show who
  // owns it. Read-only, never a source of status.
  const requirementsQuery = trpc.requirements.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const derive = trpc.tasks.deriveFromControls.useMutation({
    onSuccess: (created) => {
      utils.tasks.list.invalidate();
      toast.success(
        created.length === 0
          ? "No new tasks — every open gap already has one."
          : `Generated ${created.length} task${created.length === 1 ? "" : "s"} from your gaps.`
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const update = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  if (loading || (isAuthenticated && tasksQuery.isLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-amber-500 mx-auto mb-4" size={40} aria-hidden="true" />
          <p className="text-slate-300">Loading your remediation tasks...</p>
        </div>
      </div>
    );
  }

  // A missing session means signed out -> /login. A session that IS present but whose
  // account failed to load is a DATA failure, not an auth failure: never redirect on it.
  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  if (!user) {
    return <SessionDataError onRetry={() => { void refetchUser(); }} />;
  }

  const tasks = tasksQuery.data ?? [];
  const openCount = tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length;

  // requirementId -> catalog code, so coordination can be looked up per task.
  const codeByRequirementId = new Map<number, string>(
    (requirementsQuery.data ?? []).map((r) => [r.id, r.code])
  );
  const planned: PlannedTask[] = tasks.map((task) => {
    const code = task.requirementId === null ? undefined : codeByRequirementId.get(task.requirementId);
    return { ...task, coordination: code ? getCoordination(code) : null };
  });

  const openTasks = planned.filter((t) => OPEN_STATUSES.includes(t.status));
  const closedTasks = planned.filter((t) => !OPEN_STATUSES.includes(t.status));

  // Sequence open work into 30/60/90. A task with no coordination (free-form, or a requirement
  // outside the catalog) is planned on priority alone via the 'moderate' default.
  const byHorizon = new Map<Horizon, PlannedTask[]>(HORIZONS.map((h) => [h, []]));
  for (const task of openTasks) {
    const horizon = horizonFor(task.priority, task.coordination?.effort ?? "moderate");
    byHorizon.get(horizon)!.push(task);
  }
  const next30Count = byHorizon.get(30)!.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Remediation Plan</h1>
            <p className="text-slate-400">
              {next30Count} in the next 30 days · {openCount} open · {tasks.length} total — who
              does what, and by when
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setLocation("/dashboard")}>
              <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
              Dashboard
            </Button>
            <Button
              onClick={() => derive.mutate()}
              disabled={derive.isPending}
              className="bg-amber-600 hover:bg-amber-500 text-slate-950"
            >
              {derive.isPending ? (
                <Loader2 size={16} className="mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles size={16} className="mr-2" aria-hidden="true" />
              )}
              Generate tasks from gaps
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {tasks.length === 0 ? (
          <Card className="bg-slate-800 border-slate-700 p-10">
            <div className="flex flex-col items-center text-center gap-4">
              <ListChecks className="text-amber-500" size={40} aria-hidden="true" />
              <div>
                <h2 className="text-xl font-bold text-white mb-1">No plan yet</h2>
                <p className="text-slate-300 max-w-md">
                  Answer the assessment so we can see your gaps, then turn every open control into
                  a task with a named owner, the outside party who has to participate, and the
                  artifact that proves it is closed — sequenced across the next 90 days.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" onClick={() => setLocation("/wizard")}>
                  Go to assessment
                </Button>
                <Button
                  onClick={() => derive.mutate()}
                  disabled={derive.isPending}
                  className="bg-amber-600 hover:bg-amber-500 text-slate-950"
                >
                  Generate tasks from gaps
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-10">
            {HORIZONS.map((horizon) => {
              const rows = byHorizon.get(horizon)!;
              if (rows.length === 0) return null;
              return (
                <section key={horizon} aria-labelledby={`horizon-${horizon}`}>
                  <div className="mb-4 flex flex-wrap items-baseline gap-3">
                    <h2 id={`horizon-${horizon}`} className="text-xl font-bold text-white">
                      {HORIZON_LABEL[horizon]}
                    </h2>
                    <span className="text-sm text-slate-400">
                      {rows.length} item{rows.length === 1 ? "" : "s"}
                      {horizon === 30 && " — start here"}
                    </span>
                  </div>
                  {renderTaskTable(rows)}
                </section>
              );
            })}

            {closedTasks.length > 0 && (
              <section aria-labelledby="horizon-closed">
                <div className="mb-4 flex flex-wrap items-baseline gap-3">
                  <h2 id="horizon-closed" className="text-xl font-bold text-white">
                    Closed
                  </h2>
                  <span className="text-sm text-slate-400">
                    {closedTasks.length} resolved — your evidence that the program moved
                  </span>
                </div>
                {renderTaskTable(closedTasks)}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );

  /** One horizon's worth of tasks. Declared after the return so the JSX above reads as the
   *  page structure; it closes over the `update` mutation. */
  function renderTaskTable(rows: PlannedTask[]) {
    return (
      <Card className="bg-slate-800 border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
                <th scope="col" className="px-4 py-3 font-semibold">Task</th>
                <th scope="col" className="px-4 py-3 font-semibold">Priority</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Owner</th>
                <th scope="col" className="px-4 py-3 font-semibold">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => (
                <tr key={task.id} className="border-b border-slate-700/60 last:border-b-0 align-top">
                  <td className="px-4 py-4 max-w-md">
                    <p className="font-medium text-slate-100">{task.title}</p>
                    {task.coordination && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded border border-slate-600 bg-slate-900/60 px-2 py-0.5 text-slate-300">
                          <Clock size={12} aria-hidden="true" />
                          {EFFORT_LABEL[task.coordination.effort]}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded border border-slate-600 bg-slate-900/60 px-2 py-0.5 text-slate-300">
                          <UserCheck size={12} aria-hidden="true" />
                          {OWNER_LABEL[task.coordination.owner]}
                        </span>
                      </div>
                    )}
                    {task.description && (
                      <p className="mt-2 whitespace-pre-line text-sm text-slate-400">
                        {task.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold capitalize ${PRIORITY_BADGE[task.priority]}`}
                    >
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <Select
                      value={task.status}
                      onValueChange={(value) =>
                        update.mutate({ id: task.id, status: value as TaskStatus })
                      }
                    >
                      <SelectTrigger
                        className="w-36"
                        aria-label={`Status for ${task.title}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-4">
                    <Input
                      defaultValue={task.owner}
                      placeholder="Unassigned"
                      aria-label={`Owner for ${task.title}`}
                      className="w-40"
                      onBlur={(e) => {
                        const owner = e.target.value.trim();
                        if (owner !== task.owner) update.mutate({ id: task.id, owner });
                      }}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <Input
                      type="date"
                      defaultValue={toDateInputValue(task.dueDate)}
                      aria-label={`Due date for ${task.title}`}
                      className="w-40"
                      onChange={(e) =>
                        update.mutate({
                          id: task.id,
                          dueDate: e.target.value ? new Date(e.target.value) : null,
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }
}
