import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ListChecks, Loader2, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

// Remediation task board (PRD #24/#40). Lists the dealer's tasks with inline status / owner /
// due-date edits, and a "Generate tasks from gaps" action that runs the deterministic,
// idempotent tasks.deriveFromControls on the server. No LLM, no client-side derivation.

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

/** A Date (or null) from the server rendered for an <input type="date"> (yyyy-mm-dd). */
function toDateInputValue(due: Date | string | null): string {
  if (!due) return "";
  return new Date(due).toISOString().slice(0, 10);
}

export default function Tasks() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();

  const tasksQuery = trpc.tasks.list.useQuery(undefined, { enabled: isAuthenticated });

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

  if (!user) {
    setLocation("/login");
    return null;
  }

  const tasks = tasksQuery.data ?? [];
  const openCount = tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Remediation Tasks</h1>
            <p className="text-slate-400">
              {openCount} open · {tasks.length} total — the work to close your Safeguards Rule gaps
            </p>
          </div>
          <div className="flex gap-3">
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
                <h2 className="text-xl font-bold text-white mb-1">No tasks yet</h2>
                <p className="text-slate-300 max-w-md">
                  Answer the assessment so we can see your gaps, then generate a remediation task
                  for every open control — prioritized by how much each gap weighs.
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
                  {tasks.map((task) => (
                    <tr key={task.id} className="border-b border-slate-700/60 last:border-b-0 align-top">
                      <td className="px-4 py-4 max-w-md">
                        <p className="font-medium text-slate-100">{task.title}</p>
                        {task.description && (
                          <p className="mt-1 text-sm text-slate-400">{task.description}</p>
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
        )}
      </div>
    </div>
  );
}
