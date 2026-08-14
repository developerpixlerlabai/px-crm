import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, type Priority } from "@/lib/types";

const PRIORITY_STYLES: Record<Priority, string> = {
  hot: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-200",
  warm: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-200",
  cool: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/15 dark:text-slate-300",
};

const PRIORITY_DOT: Record<Priority, string> = {
  hot: "bg-orange-500",
  warm: "bg-blue-500",
  cool: "bg-slate-400",
};

export function PriorityBadge({
  priority,
  score,
  className,
}: {
  priority: Priority;
  score?: number;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", PRIORITY_STYLES[priority], className)}
    >
      <span className={cn("size-1.5 rounded-full", PRIORITY_DOT[priority])} />
      {PRIORITY_LABEL[priority]}
      {score !== undefined && (
        <span className="tabular-nums opacity-70">{score}</span>
      )}
    </Badge>
  );
}

/**
 * Status colours read as a funnel: grey while untouched, amber once we've
 * reached out, green once they answer, red when it's dead.
 */
const STATUS_STYLES: Record<string, string> = {
  New: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Researching:
    "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200",
  "Outreach Sent":
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
  Replied:
    "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/15 dark:text-cyan-200",
  "Meeting Booked":
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
  "Not a Fit":
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200",
  "Closed Won":
    "border-green-400 bg-green-100 text-green-900 dark:border-green-500/50 dark:bg-green-500/20 dark:text-green-100",
};

export function statusClass(status: string): string {
  return STATUS_STYLES[status] ?? STATUS_STYLES.New;
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", statusClass(status || "New"), className)}
    >
      {status || "New"}
    </Badge>
  );
}

export function SegmentBadge({ segment }: { segment: string }) {
  if (!segment) return null;
  return (
    <Badge variant="secondary" className="font-normal capitalize">
      {segment}
    </Badge>
  );
}
