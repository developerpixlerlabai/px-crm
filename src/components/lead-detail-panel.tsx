"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import { PriorityBadge, SegmentBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatFullDate, hostOf, splitSignals } from "@/lib/format";
import {
  EDITABLE_FIELDS,
  STATUSES,
  priorityOf,
  type EditableField,
  type Lead,
  type LeadUpdates,
} from "@/lib/types";

type Draft = Record<EditableField, string>;

function draftFrom(lead: Lead): Draft {
  return {
    contactName: lead.contactName ?? "",
    titleRole: lead.titleRole ?? "",
    email: lead.email ?? "",
    status: lead.status || "New",
    notes: lead.notes ?? "",
    outreachSent: lead.outreachSent ?? "",
  };
}

export function LeadDetailPanel({
  lead,
  open,
  onOpenChange,
  onSave,
  saving,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (lead: Lead, updates: LeadUpdates) => Promise<void>;
  saving: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* The width has to be set on the same data-[side] variant the component
          ships (data-[side=right]:sm:max-w-sm) — a plain sm:max-w-* loses to
          it on specificity and the panel silently stays 384px wide. */}
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-3xl">
        {lead && (
          // Keyed on the lead so opening a different one remounts the form with
          // a fresh draft, instead of syncing state in an effect.
          <LeadForm
            key={lead.key}
            lead={lead}
            onOpenChange={onOpenChange}
            onSave={onSave}
            saving={saving}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function LeadForm({
  lead,
  onOpenChange,
  onSave,
  saving,
}: {
  lead: Lead;
  onOpenChange: (open: boolean) => void;
  onSave: (lead: Lead, updates: LeadUpdates) => Promise<void>;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(lead));

  // Compared against the live lead, so a successful save (which updates the
  // lead in place) flips this back to "no changes" on its own.
  const dirty = useMemo<LeadUpdates>(() => {
    const original = draftFrom(lead);
    const changes: LeadUpdates = {};
    for (const field of EDITABLE_FIELDS) {
      if (draft[field] !== original[field]) changes[field] = draft[field];
    }
    return changes;
  }, [lead, draft]);

  const hasChanges = Object.keys(dirty).length > 0;
  const signals = splitSignals(lead.matchedSignals);
  const signal = signalText(lead);

  const set = (field: EditableField, value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));

  async function handleSave() {
    if (!hasChanges) return;
    await onSave(lead, dirty);
  }

  return (
    <>
      <SheetHeader className="gap-2 px-6 pt-6">
        <div className="flex min-h-6 flex-wrap items-center gap-2">
          <PriorityBadge priority={priorityOf(lead)} score={lead.score} />
          <SegmentBadge segment={lead.segment} />
          <span className="text-muted-foreground text-xs">
            found {formatFullDate(lead.dateFound)}
          </span>
        </div>
        <SheetTitle className="text-2xl leading-tight">
          {lead.company || "Unnamed company"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Lead details and editable CRM fields
        </SheetDescription>
        {lead.domain && (
          <a
            href={
              lead.domain.startsWith("http")
                ? lead.domain
                : `https://${lead.domain}`
            }
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
          >
            {lead.domain.replace(/^https?:\/\//, "")}
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </SheetHeader>

      {/* Breakpoints here are container queries, keyed to the PANEL's width
          rather than the viewport's — a viewport breakpoint reflows the fields
          based on the window even though the panel is a fixed 768px. */}
      <div className="@container space-y-6 px-6 pb-6">
        <Section title="Why this lead surfaced">
          <p className="text-sm leading-relaxed font-medium">
            {signal.primary}
          </p>
          {signal.secondary && (
            <p className="text-muted-foreground text-sm leading-relaxed">
              {signal.secondary}
            </p>
          )}
          {signals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {signals.map((s) => (
                <Badge key={s} variant="outline" className="font-normal">
                  {s}
                </Badge>
              ))}
            </div>
          )}

          {/* Fixed label column so the values form a single vertical edge
              instead of stepping in and out with the label lengths. */}
          <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-t pt-4 text-sm">
            <Meta label="Signal source" value={lead.signalSource} />
            <Meta label="Intent" value={lead.intent} />
            <Meta label="Score" value={String(lead.score)} />
            <Meta label="Sheet row" value={String(lead.row)} />
          </dl>

          {lead.sourceUrl && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit max-w-full"
              // Rendering as an anchor, so Base UI must not expect a native
              // <button> underneath.
              nativeButton={false}
              render={
                <a
                  href={lead.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                />
              }
            >
              Open source
              <span className="text-muted-foreground truncate">
                {hostOf(lead.sourceUrl)}
              </span>
              <ExternalLink className="size-3.5 shrink-0" />
            </Button>
          )}
        </Section>

        <Separator />

        {/* One row per section rather than one field per row — at 768px a
            full-width input for "Status" is mostly empty space. */}
        <Section title="Pipeline">
          <div className="grid gap-4 @lg:grid-cols-2">
            <Field label="Status">
              <Select
                value={draft.status}
                onValueChange={(v) => set("status", v ?? "New")}
              >
                <SelectTrigger className="w-full">
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
            </Field>

            <Field label="Outreach sent">
              <div className="flex items-center gap-2">
                <Input
                  value={draft.outreachSent}
                  onChange={(e) => set("outreachSent", e.target.value)}
                  placeholder="e.g. 8 Aug"
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() =>
                    set(
                      "outreachSent",
                      new Intl.DateTimeFormat("en-GB", {
                        day: "numeric",
                        month: "short",
                      }).format(new Date()),
                    )
                  }
                >
                  Today
                </Button>
              </div>
            </Field>
          </div>
        </Section>

        <Separator />

        <Section title="Contact">
          <div className="grid gap-4 @lg:grid-cols-2 @2xl:grid-cols-3">
            <Field label="Name">
              <Input
                value={draft.contactName}
                onChange={(e) => set("contactName", e.target.value)}
                placeholder="Jane Doe"
              />
            </Field>
            <Field label="Title / role">
              <Input
                value={draft.titleRole}
                onChange={(e) => set("titleRole", e.target.value)}
                placeholder="Head of Engineering"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="jane@company.com"
              />
            </Field>
          </div>
        </Section>

        <Separator />

        <Section title="Notes">
          <Textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Research, call notes, next step…"
            rows={5}
          />
        </Section>
      </div>

      <SheetFooter className="bg-background sticky bottom-0 flex-row justify-end gap-2 border-t px-6">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {hasChanges ? "Save to sheet" : "Saved"}
        </Button>
      </SheetFooter>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Label pinned to the top of the cell, control pinned to the bottom.
 *
 * Fields sitting side by side in a grid otherwise line up on whichever
 * intrinsic height their control happens to have — a Select renders extra
 * elements a plain Input does not, which was pushing the neighbouring label
 * and input a few pixels down the row.
 */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-muted-foreground h-4 text-xs leading-4">
        {label}
      </Label>
      <div className="mt-auto min-w-0">{children}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground whitespace-nowrap">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  );
}

/**
 * Picks what to show for the signal.
 *
 * For HN postings Code.gs derives the headline from the start of the posting
 * body, so Headline and Snippet are near-duplicates — but the snippet is the
 * longer of the two (300 chars vs a truncated headline). Printing both reads
 * as a stutter; dropping the snippet loses the tail. So when they overlap,
 * keep whichever carries more text and drop the other.
 */
function signalText(lead: Lead): { primary: string; secondary: string } {
  const headline = lead.headline?.trim() ?? "";
  const snippet = lead.snippet?.trim() ?? "";

  if (!snippet) return { primary: headline || "—", secondary: "" };
  if (!headline) return { primary: snippet, secondary: "" };

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const h = norm(headline);
  const s = norm(snippet);

  const overlaps = h.includes(s.slice(0, 60)) || s.includes(h.slice(0, 60));
  if (!overlaps) return { primary: headline, secondary: snippet };

  return s.length > h.length
    ? { primary: snippet, secondary: "" }
    : { primary: headline, secondary: "" };
}
