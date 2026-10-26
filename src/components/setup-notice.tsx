import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";

/**
 * Shown instead of the dashboard when Supabase is not configured or the leads
 * query failed — a blank table with no explanation is the worst possible
 * first-run experience.
 */
export function SetupNotice({ error }: { error?: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <Card className="gap-4 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div>
            <h1 className="text-lg font-semibold">Connect Supabase</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {error ??
                "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are not set yet."}
            </p>
          </div>
        </div>

        <ol className="ml-4 list-decimal space-y-3 text-sm leading-relaxed">
          <li>
            In the Supabase SQL editor, run every file in{" "}
            <code className="bg-muted rounded px-1">supabase/migrations/</code>{" "}
            in order. <code className="bg-muted rounded px-1">0003_leads.sql</code>{" "}
            creates the leads table.
          </li>
          <li>
            Create <code className="bg-muted rounded px-1">.env.local</code> in
            this project with the values from{" "}
            <strong>Project Settings &rarr; API</strong>:
            <pre className="bg-muted mt-2 overflow-x-auto rounded p-3 text-xs">
              {`NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...`}
            </pre>
          </li>
          <li>
            To bring existing leads over from the Google Sheet, run{" "}
            <code className="bg-muted rounded px-1">
              npm run import:sheet
            </code>
            .
          </li>
          <li>
            Restart <code className="bg-muted rounded px-1">npm run dev</code> and
            reload this page.
          </li>
        </ol>
      </Card>
    </div>
  );
}
