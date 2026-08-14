"use client";

import { useState } from "react";
import { ExternalLink, MoreHorizontal } from "lucide-react";

import { PriorityBadge, SegmentBadge, statusClass } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatShortDate, splitSignals } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATUSES, priorityOf, type Lead } from "@/lib/types";

/**
 * Kanban board over the same filtered leads the table shows, with Status as the
 * column axis.
 *
 * Drag-and-drop is the native HTML5 API rather than a library: the sheet has no
 * ordering column, so cards can only ever move BETWEEN columns — there is no
 * within-column sort to persist, which is the only thing a drag library would
 * really buy here. Native DnD is mouse-only, so every card also carries a
 * keyboard-reachable "Move to" menu.
 */
export function LeadsBoard({
  leads,
  onSelect,
  onStatusChange,
  pendingKeys,
}: {
  leads: Lead[];
  onSelect: (lead: Lead) => void;
  onStatusChange: (lead: Lead, status: string) => void;
  pendingKeys: Set<string>;
}) {
  // The dragged lead is held in state rather than read from dataTransfer:
  // getData() is blocked during dragover, so the drop target could not
  // otherwise know whether the card even belongs somewhere else.
  const [dragging, setDragging] = useState<Lead | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);

  const byStatus = new Map<string, Lead[]>(STATUSES.map((s) => [s, []]));
  for (const lead of leads) {
    const status = (lead.status || "New") as string;
    (byStatus.get(status) ?? byStatus.get("New")!).push(lead);
  }

  function drop(status: string) {
    const lead = dragging;
    setDragging(null);
    setOverStatus(null);
    if (lead && (lead.status || "New") !== status) onStatusChange(lead, status);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STATUSES.map((status) => {
        const column = byStatus.get(status) ?? [];
        const isTarget =
          overStatus === status && dragging && (dragging.status || "New") !== status;

        return (
          <section
            key={status}
            onDragOver={(e) => {
              // Without preventDefault the browser refuses the drop outright.
              e.preventDefault();
              setOverStatus(status);
            }}
            onDragLeave={(e) => {
              // Ignore bubbling from children, or the column flickers as the
              // pointer crosses each card.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverStatus((s) => (s === status ? null : s));
              }
            }}
            onDrop={() => drop(status)}
            className={cn(
              "bg-muted/40 flex max-h-[calc(100vh-19rem)] w-[290px] shrink-0 flex-col rounded-lg border transition-colors",
              isTarget && "border-primary/50 bg-primary/5",
            )}
          >
            <header className="flex items-center gap-2 px-3 py-2.5">
              <Badge
                variant="outline"
                className={cn("font-medium", statusClass(status))}
              >
                {status}
              </Badge>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {column.length}
              </span>
            </header>

            <div className="flex flex-col gap-2 overflow-y-auto px-2 pb-2">
              {column.length === 0 && (
                <p
                  className={cn(
                    "text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs",
                    isTarget && "border-primary/50 text-foreground",
                  )}
                >
                  {isTarget ? "Drop to move here" : "Nothing here"}
                </p>
              )}

              {column.map((lead) => (
                <BoardCard
                  key={lead.key || String(lead.row)}
                  lead={lead}
                  pending={pendingKeys.has(lead.key)}
                  isDragging={dragging?.key === lead.key}
                  onDragStart={() => setDragging(lead)}
                  onDragEnd={() => {
                    setDragging(null);
                    setOverStatus(null);
                  }}
                  onSelect={onSelect}
                  onStatusChange={onStatusChange}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({
  lead,
  pending,
  isDragging,
  onDragStart,
  onDragEnd,
  onSelect,
  onStatusChange,
}: {
  lead: Lead;
  pending: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onSelect: (lead: Lead) => void;
  onStatusChange: (lead: Lead, status: string) => void;
}) {
  const signals = splitSignals(lead.matchedSignals).slice(0, 2);
  const current = lead.status || "New";

  return (
    <article
      draggable={!pending}
      onDragStart={(e) => {
        // Firefox will not start a drag unless some data is set.
        e.dataTransfer.setData("text/plain", lead.key);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(lead)}
      className={cn(
        "bg-card hover:border-foreground/20 group cursor-pointer rounded-md border p-2.5 shadow-xs transition-all",
        isDragging && "opacity-40",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <PriorityBadge priority={priorityOf(lead)} score={lead.score} />
        <span className="text-muted-foreground ml-auto text-[11px] whitespace-nowrap tabular-nums">
          {formatShortDate(lead.dateFound)}
        </span>
        <MoveMenu lead={lead} current={current} onStatusChange={onStatusChange} />
      </div>

      <h4 className="mt-2 line-clamp-1 text-sm font-medium">
        {lead.company || "—"}
      </h4>
      <p className="text-muted-foreground mt-1 line-clamp-3 text-xs leading-relaxed">
        {lead.headline || "—"}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <SegmentBadge segment={lead.segment} />
        {signals.map((s) => (
          <Badge key={s} variant="outline" className="text-[11px] font-normal">
            {s}
          </Badge>
        ))}
      </div>

      {lead.domain && (
        <a
          href={lead.domain.startsWith("http") ? lead.domain : `https://${lead.domain}`}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground mt-2 inline-flex max-w-full items-center gap-1 text-[11px] hover:underline"
        >
          <span className="truncate">
            {lead.domain.replace(/^https?:\/\//, "")}
          </span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      )}
    </article>
  );
}

/** The keyboard path for what dragging does with a mouse. */
function MoveMenu({
  lead,
  current,
  onStatusChange,
}: {
  lead: Lead;
  current: string;
  onStatusChange: (lead: Lead, status: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Move ${lead.company || "lead"} to another status`}
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground -mt-0.5 -mr-1 shrink-0"
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {STATUSES.map((status) => (
          <DropdownMenuItem
            key={status}
            disabled={status === current}
            onClick={() => onStatusChange(lead, status)}
          >
            {status}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
