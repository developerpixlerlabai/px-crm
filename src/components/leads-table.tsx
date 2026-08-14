"use client";

import { ArrowUpDown, ExternalLink } from "lucide-react";

import { PriorityBadge, SegmentBadge, statusClass } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatShortDate, hostOf, splitSignals } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATUSES, priorityOf, type Lead } from "@/lib/types";

export type SortKey = "dateFound" | "score" | "company" | "status";
export type SortDir = "asc" | "desc";

/**
 * TableCell ships with `align-middle whitespace-nowrap`. Both fight this
 * layout: middle alignment floats the one-line cells against the tallest cell
 * in the row, and nowrap inherits down and silently defeats `line-clamp-2`.
 * Every cell overrides both.
 */
const CELL = "py-3 align-top whitespace-normal";

/**
 * A 24px band for the first line of every cell. The priority badge, the
 * company name and the headline are all different intrinsic heights, so
 * without a shared band their first lines sit a few pixels apart.
 */
const FIRST_LINE = "flex min-h-6 items-center";

const COLUMNS: Array<{ key: SortKey | null; label: string; className?: string }> = [
  { key: "score", label: "Priority", className: "w-[110px]" },
  { key: "company", label: "Company", className: "w-[200px]" },
  { key: null, label: "Signal", className: "min-w-[320px]" },
  { key: null, label: "Source", className: "w-[150px]" },
  { key: "dateFound", label: "Found", className: "w-[90px]" },
  { key: "status", label: "Status", className: "w-[160px]" },
];

export function LeadsTable({
  leads,
  sortKey,
  sortDir,
  onSort,
  onSelect,
  onStatusChange,
  pendingKeys,
}: {
  leads: Lead[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onSelect: (lead: Lead) => void;
  onStatusChange: (lead: Lead, status: string) => void;
  pendingKeys: Set<string>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {COLUMNS.map((col) => (
              <TableHead key={col.label} className={col.className}>
                {col.key ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.key as SortKey)}
                    className="hover:text-foreground -mx-1 flex items-center gap-1 rounded px-1 py-0.5"
                  >
                    {col.label}
                    <ArrowUpDown
                      className={cn(
                        "size-3",
                        sortKey === col.key ? "opacity-100" : "opacity-30",
                      )}
                    />
                    {sortKey === col.key && (
                      <span className="sr-only">
                        sorted {sortDir === "asc" ? "ascending" : "descending"}
                      </span>
                    )}
                  </button>
                ) : (
                  col.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {leads.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={COLUMNS.length}
                className="text-muted-foreground h-32 text-center"
              >
                No leads match these filters.
              </TableCell>
            </TableRow>
          )}

          {leads.map((lead) => (
            <LeadRow
              key={lead.key || `${lead.row}`}
              lead={lead}
              pending={pendingKeys.has(lead.key)}
              onSelect={onSelect}
              onStatusChange={onStatusChange}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LeadRow({
  lead,
  pending,
  onSelect,
  onStatusChange,
}: {
  lead: Lead;
  pending: boolean;
  onSelect: (lead: Lead) => void;
  onStatusChange: (lead: Lead, status: string) => void;
}) {
  const signals = splitSignals(lead.matchedSignals).slice(0, 3);

  return (
    <TableRow
      onClick={() => onSelect(lead)}
      className={cn(
        "hover:bg-muted/40 cursor-pointer align-top",
        pending && "opacity-60",
      )}
    >
      <TableCell className={CELL}>
        <div className={FIRST_LINE}>
          <PriorityBadge priority={priorityOf(lead)} score={lead.score} />
        </div>
      </TableCell>

      <TableCell className={CELL}>
        <div className={cn(FIRST_LINE, "font-medium")}>
          <span className="line-clamp-1">{lead.company || "—"}</span>
        </div>
        {lead.domain && (
          <a
            href={
              lead.domain.startsWith("http") ? lead.domain : `https://${lead.domain}`
            }
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground inline-flex max-w-full items-center gap-1 text-xs hover:underline"
          >
            <span className="truncate">
              {lead.domain.replace(/^https?:\/\//, "")}
            </span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
        )}
        {lead.contactName && (
          <div className="text-muted-foreground mt-0.5 text-xs">
            {lead.contactName}
            {lead.titleRole ? ` · ${lead.titleRole}` : ""}
          </div>
        )}
      </TableCell>

      <TableCell className={CELL}>
        <div className={cn(FIRST_LINE, "items-start")}>
          <span className="line-clamp-2 text-sm leading-6">
            {lead.headline || "—"}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <SegmentBadge segment={lead.segment} />
          {signals.map((s) => (
            <Badge key={s} variant="outline" className="font-normal">
              {s}
            </Badge>
          ))}
        </div>
      </TableCell>

      <TableCell className={cn(CELL, "text-muted-foreground text-xs")}>
        <div className={cn(FIRST_LINE, "items-start")}>
          <span className="line-clamp-2 leading-6">{lead.signalSource || "—"}</span>
        </div>
        {lead.sourceUrl && (
          <a
            href={lead.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="hover:text-foreground inline-flex max-w-full items-center gap-1 hover:underline"
          >
            <span className="truncate">{hostOf(lead.sourceUrl)}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
        )}
      </TableCell>

      <TableCell
        className={cn(CELL, "text-muted-foreground text-xs whitespace-nowrap")}
      >
        <div className={cn(FIRST_LINE, "leading-6")}>
          {formatShortDate(lead.dateFound)}
        </div>
      </TableCell>

      {/* Inline status edit — the one action frequent enough to not deserve a
          trip through the detail panel. */}
      <TableCell className={CELL} onClick={(e) => e.stopPropagation()}>
        <Select
          value={lead.status || "New"}
          disabled={pending}
          onValueChange={(value) => onStatusChange(lead, value ?? "New")}
        >
          <SelectTrigger
            size="sm"
            className={cn("w-full border font-medium", statusClass(lead.status || "New"))}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
}

/** Buttonless helper kept next to the table so paging stays visually coupled. */
export function LoadMore({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  if (shown >= total) return null;
  return (
    <div className="flex justify-center py-4">
      <Button variant="outline" onClick={onMore}>
        Show more ({total - shown} remaining)
      </Button>
    </div>
  );
}
