"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { STATUSES } from "@/lib/types";

export type Filters = {
  query: string;
  priority: "all" | "hot" | "warm" | "cool";
  status: string;
  segment: string;
  source: string;
};

export const DEFAULT_FILTERS: Filters = {
  query: "",
  priority: "all",
  status: "all",
  segment: "all",
  source: "all",
};

const ALL = "all";

export function LeadFilters({
  filters,
  onChange,
  segments,
  sources,
  counts,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  segments: string[];
  sources: string[];
  counts: Record<Filters["priority"], number>;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const isFiltered =
    filters.query !== "" ||
    filters.priority !== ALL ||
    filters.status !== ALL ||
    filters.segment !== ALL ||
    filters.source !== ALL;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={filters.priority}
        onValueChange={(v) => set("priority", (v ?? ALL) as Filters["priority"])}
      >
        <TabsList>
          {(["all", "hot", "warm", "cool"] as const).map((p) => (
            <TabsTrigger key={p} value={p} className="capitalize">
              {p}
              <span className="text-muted-foreground ml-1.5 tabular-nums">
                {counts[p]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder="Search company, headline, signal…"
          className="pl-8"
        />
      </div>

      <FilterSelect
        label="Status"
        value={filters.status}
        options={[...STATUSES]}
        onChange={(v) => set("status", v)}
      />

      {segments.length > 1 && (
        <FilterSelect
          label="Segment"
          value={filters.segment}
          options={segments}
          capitalize
          onChange={(v) => set("segment", v)}
        />
      )}

      {sources.length > 1 && (
        <FilterSelect
          label="Source"
          value={filters.source}
          options={sources}
          onChange={(v) => set("source", v)}
        />
      )}

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(DEFAULT_FILTERS)}
        >
          <X className="size-4" />
          Clear
        </Button>
      )}
    </div>
  );
}

/**
 * Base UI's SelectValue prints the raw value, so the unfiltered state rendered
 * as a bare "all" on all three dropdowns with no clue what each one filtered.
 * Formatting through the children function keeps the field name visible at
 * rest and shows just the choice once something is selected.
 */
function FilterSelect({
  label,
  value,
  options,
  onChange,
  capitalize,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  capitalize?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? ALL)}>
      <SelectTrigger
        className={cn("w-[168px]", value !== ALL && "border-foreground/25")}
      >
        <SelectValue>
          {(selected: string | null) =>
            !selected || selected === ALL ? (
              <span className="text-muted-foreground">{label}: All</span>
            ) : (
              <span className={cn("truncate", capitalize && "capitalize")}>
                {selected}
              </span>
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}s</SelectItem>
        {options.map((option) => (
          <SelectItem
            key={option}
            value={option}
            className={capitalize ? "capitalize" : undefined}
          >
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
