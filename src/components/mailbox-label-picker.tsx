"use client";

import { useCallback, useState } from "react";
import { Loader2, Plus, Tag } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  canManageLabels,
  needsSyncScopeConsent,
  type GmailLabel,
  type Mailbox,
} from "@/lib/google/types";

/**
 * Only user-created labels are offered.
 *
 * System labels are deliberately excluded: syncing `INBOX` would mean reading the
 * entire mailbox, which is exactly what label scoping exists to prevent. A person
 * choosing a label they made is making a deliberate, narrow decision; ticking
 * INBOX is not.
 *
 * The one exception is a system label that is ALREADY selected — it stays visible
 * so it can be unticked, rather than being stuck on with no way to reach it.
 */

/**
 * Chooses which Gmail labels a mailbox may read.
 *
 * `labels` is passed in rather than fetched here: the parent loads them when the
 * row is expanded, which keeps this component effect-free and means no request
 * fires for a mailbox nobody opened. `null` means still loading.
 *
 * Selecting works on a read-only grant — only *creating* a label needs the
 * `gmail.labels` scope, hence a capability check rather than hiding the control.
 */
export function MailboxLabelPicker({
  mailbox,
  labels,
  onCreated,
  onSaved,
}: {
  mailbox: Mailbox;
  labels: GmailLabel[] | null;
  onCreated: (label: GmailLabel) => void;
  onSaved: (mailbox: Mailbox) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(mailbox.syncedLabelIds ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const canCreate = canManageLabels(mailbox);
  const loading = labels === null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;

    setCreating(true);
    try {
      const res = await fetch(`/api/mailboxes/${mailbox.id}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json()) as { label?: GmailLabel; error?: string };
      if (!res.ok || !body.label) throw new Error(body.error ?? `HTTP ${res.status}`);

      // Select it straight away — creating a label is only ever a step towards
      // syncing it.
      onCreated(body.label);
      setSelected((prev) => new Set(prev).add(body.label!.id));
      setNewName("");
      toast.success(`Created "${body.label.name}" in Gmail`);
    } catch (err) {
      toast.error("Could not create the label", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCreating(false);
    }
  }, [mailbox.id, newName, onCreated]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/mailboxes/${mailbox.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncedLabelIds: [...selected] }),
      });
      const body = (await res.json()) as {
        mailbox?: Mailbox;
        threadsInScope?: number | null;
        error?: string;
      };
      if (!res.ok || !body.mailbox) throw new Error(body.error ?? `HTTP ${res.status}`);

      onSaved(body.mailbox);

      // Report the count so the save visibly did something.
      toast.success(
        selected.size === 0
          ? "This mailbox will now sync nothing"
          : typeof body.threadsInScope === "number"
            ? `${body.threadsInScope} thread${body.threadsInScope === 1 ? "" : "s"} in scope`
            : "Label selection saved",
      );
    } catch (err) {
      toast.error("Could not save the selection", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [mailbox.id, onSaved, selected]);

  const visible = (labels ?? []).filter(
    (l) => l.type === "user" || selected.has(l.id),
  );
  const gated = needsSyncScopeConsent(mailbox);
  const dirty =
    selected.size !== (mailbox.syncedLabelIds?.length ?? 0) ||
    [...selected].some((id) => !mailbox.syncedLabelIds?.includes(id));

  return (
    <div className="mt-2 w-full space-y-3 rounded-lg border bg-muted/30 p-2.5">
      <div className="flex items-center gap-2">
        <Tag className="text-muted-foreground size-3.5" />
        <p className="text-xs font-medium">
          {gated ? "Choose what this mailbox syncs" : "Synced labels"}
        </p>
        {loading && <Loader2 className="text-muted-foreground size-3.5 animate-spin" />}
      </div>

      {gated && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Nothing is read from this account until you pick a label. Only mail
          carrying it is ever fetched.
        </p>
      )}

      {!loading && visible.length === 0 && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          No labels in this account yet. Create one below, then apply it to
          conversations in Gmail.
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {visible.map((label) => (
          <Label
            key={label.id}
            className="flex cursor-pointer items-center gap-2 text-xs font-normal"
          >
            <Checkbox
              checked={selected.has(label.id)}
              onCheckedChange={() => toggle(label.id)}
            />
            <span className={cn(label.type === "system" && "text-muted-foreground")}>
              {label.name}
            </span>
            {/* Only ever appears for a system label that was selected before we
                stopped offering them — a way out, not a way in. */}
            {label.type === "system" && (
              <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
                system · untick to stop
              </Badge>
            )}
          </Label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-2.5">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (canCreate) void create();
            }
          }}
          placeholder={canCreate ? "New label name…" : "Reconnect to create labels"}
          disabled={!canCreate || creating}
          className="h-7 min-w-0 flex-1 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!canCreate || creating || !newName.trim()}
          onClick={() => void create()}
        >
          {creating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Create in Gmail
        </Button>

        <Button
          size="sm"
          disabled={saving || (!dirty && !gated)}
          onClick={() => void save()}
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Save
        </Button>
      </div>

      {!canCreate && (
        <p className="text-muted-foreground text-xs">
          This mailbox was connected before label permission was requested.
          Reconnect it to create labels from here — selecting existing ones works
          either way.
        </p>
      )}
    </div>
  );
}
