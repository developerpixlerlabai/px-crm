"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Columns3, Loader2, RefreshCw, Rows3, Table2 } from "lucide-react";
import { toast } from "sonner";

import { LeadDetailPanel } from "@/components/lead-detail-panel";
import { LeadsBoard } from "@/components/leads-board";
import {
  DEFAULT_FILTERS,
  LeadFilters,
  type Filters,
} from "@/components/lead-filters";
import { LeadsTable, LoadMore, type SortDir, type SortKey } from "@/components/leads-table";
import { StatCards } from "@/components/stat-cards";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatClock } from "@/lib/format";
import {
  STATUSES,
  priorityOf,
  type Lead,
  type LeadUpdates,
  type LeadsResponse,
} from "@/lib/types";

const PAGE_SIZE = 50;

type View = "list" | "board";

export function Dashboard({ initial }: { initial: LeadsResponse }) {
  const [leads, setLeads] = useState<Lead[]>(initial.leads);
  const [fetchedAt, setFetchedAt] = useState(initial.meta.fetchedAt);

  const [view, setView] = useState<View>("list");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("dateFound");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [refreshing, startRefresh] = useTransition();

  // Keep the panel bound to the key, not the object, so it re-renders with the
  // updated lead after a save instead of showing a stale snapshot.
  const selected = useMemo(
    () => leads.find((l) => l.key === selectedKey) ?? null,
    [leads, selectedKey],
  );

  const segments = useMemo(() => uniq(leads.map((l) => l.segment)), [leads]);
  const sources = useMemo(() => uniq(leads.map((l) => l.signalSource)), [leads]);

  const searched = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (filters.status !== "all" && (lead.status || "New") !== filters.status)
        return false;
      if (filters.segment !== "all" && lead.segment !== filters.segment) return false;
      if (filters.source !== "all" && lead.signalSource !== filters.source)
        return false;
      if (!q) return true;
      return [
        lead.company,
        lead.headline,
        lead.snippet,
        lead.matchedSignals,
        lead.domain,
        lead.contactName,
        lead.email,
        lead.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [leads, filters]);

  // Priority counts reflect every other active filter, so the tab numbers match
  // what clicking the tab would actually show.
  const counts = useMemo(() => {
    const c = { all: searched.length, hot: 0, warm: 0, cool: 0 };
    for (const lead of searched) c[priorityOf(lead)] += 1;
    return c;
  }, [searched]);

  const filtered = useMemo(() => {
    const rows =
      filters.priority === "all"
        ? searched
        : searched.filter((l) => priorityOf(l) === filters.priority);

    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => dir * compare(a, b, sortKey));
  }, [searched, filters.priority, sortKey, sortDir]);

  const page = filtered.slice(0, visible);

  const onSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "company" ? "asc" : "desc");
      }
    },
    [sortKey],
  );

  const onFiltersChange = useCallback((next: Filters) => {
    setFilters(next);
    setVisible(PAGE_SIZE);
  }, []);

  /**
   * Optimistic write: the row changes immediately, then reverts if the sheet
   * rejects it. Anything else feels broken, because the Apps Script round-trip
   * is 1-2 seconds.
   */
  const saveLead = useCallback(
    async (lead: Lead, updates: LeadUpdates) => {
      const snapshot = { ...lead };

      setLeads((prev) =>
        prev.map((l) => (l.key === lead.key ? { ...l, ...updates } : l)),
      );
      setPendingKeys((prev) => new Set(prev).add(lead.key));

      try {
        const res = await fetch("/api/leads", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ row: lead.row, key: lead.key, updates }),
        });

        const body = (await res.json()) as {
          error?: string;
          results?: Array<{ ok: boolean; error?: string; lead?: Lead }>;
        };

        if (!res.ok && !body.results) {
          throw new Error(body.error ?? `Save failed (HTTP ${res.status}).`);
        }

        const result = body.results?.[0];
        if (!result?.ok) {
          throw new Error(result?.error ?? "The sheet rejected this update.");
        }

        // Adopt the server's version of the row — it carries the authoritative
        // row number if the lead had moved in the sheet.
        if (result.lead) {
          setLeads((prev) =>
            prev.map((l) => (l.key === lead.key ? { ...l, ...result.lead } : l)),
          );
        }

        toast.success(`Saved ${lead.company || "lead"} to the sheet`);
      } catch (err) {
        setLeads((prev) => prev.map((l) => (l.key === lead.key ? snapshot : l)));
        toast.error("Could not save", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(lead.key);
          return next;
        });
      }
    },
    [],
  );

  const onStatusChange = useCallback(
    (lead: Lead, status: string) => {
      void saveLead(lead, { status });
    },
    [saveLead],
  );

  const refresh = useCallback(() => {
    startRefresh(async () => {
      try {
        const res = await fetch("/api/leads?fresh=1", { cache: "no-store" });
        const body = (await res.json()) as LeadsResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

        setLeads(body.leads);
        setFetchedAt(body.meta.fetchedAt);
        toast.success(`Synced ${body.leads.length} leads`);
      } catch (err) {
        toast.error("Refresh failed", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Intent leads</h1>
          <p className="text-muted-foreground text-sm">
            {leads.length} leads scraped by the Apps Script pipeline · synced{" "}
            {formatClock(fetchedAt)} UTC
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView((v ?? "list") as View)}>
            <TabsList>
              <TabsTrigger value="list">
                <Rows3 className="size-4" />
                List
              </TabsTrigger>
              <TabsTrigger value="board">
                <Columns3 className="size-4" />
                Board
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {process.env.NEXT_PUBLIC_SHEET_URL && (
            <Button
              variant="outline"
              // Rendering as an anchor, so Base UI must not expect a native
              // <button> underneath.
              nativeButton={false}
              render={
                <a
                  href={process.env.NEXT_PUBLIC_SHEET_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                />
              }
            >
              <Table2 className="size-4" />
              Open sheet
            </Button>
          )}
          <Button onClick={refresh} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      <StatCards leads={leads} />

      <LeadFilters
        filters={filters}
        onChange={onFiltersChange}
        segments={segments}
        sources={sources}
        counts={counts}
      />

      {view === "list" ? (
        <div>
          <LeadsTable
            leads={page}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            onSelect={(lead) => setSelectedKey(lead.key)}
            onStatusChange={onStatusChange}
            pendingKeys={pendingKeys}
          />
          <LoadMore
            shown={page.length}
            total={filtered.length}
            onMore={() => setVisible((v) => v + PAGE_SIZE)}
          />
        </div>
      ) : (
        // No paging here: a column that silently stopped at 50 would read as
        // "this is everything in Outreach Sent" when it isn't.
        <LeadsBoard
          leads={filtered}
          onSelect={(lead) => setSelectedKey(lead.key)}
          onStatusChange={onStatusChange}
          pendingKeys={pendingKeys}
        />
      )}

      <LeadDetailPanel
        lead={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedKey(null)}
        onSave={saveLead}
        saving={selected ? pendingKeys.has(selected.key) : false}
      />
    </div>
  );
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function compare(a: Lead, b: Lead, key: SortKey): number {
  switch (key) {
    case "score":
      return a.score - b.score;
    case "company":
      return a.company.localeCompare(b.company);
    case "status":
      // Sort by funnel position rather than alphabetically, so "New" and
      // "Closed Won" end up at opposite ends where you expect them.
      return (
        STATUSES.indexOf((a.status || "New") as (typeof STATUSES)[number]) -
        STATUSES.indexOf((b.status || "New") as (typeof STATUSES)[number])
      );
    case "dateFound":
    default: {
      const ta = Date.parse(a.dateFound) || 0;
      const tb = Date.parse(b.dateFound) || 0;
      return ta - tb;
    }
  }
}
