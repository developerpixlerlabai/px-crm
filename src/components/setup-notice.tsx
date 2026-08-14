import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";

/**
 * Shown instead of the dashboard when the Apps Script credentials are missing
 * or the call to Google failed — a blank table with no explanation is the
 * worst possible first-run experience.
 */
export function SetupNotice({ error }: { error?: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <Card className="gap-4 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div>
            <h1 className="text-lg font-semibold">Connect your Google Sheet</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {error ??
                "SHEETS_API_URL and SHEETS_API_TOKEN are not set yet."}
            </p>
          </div>
        </div>

        <ol className="ml-4 list-decimal space-y-3 text-sm leading-relaxed">
          <li>
            Open your leads spreadsheet, then{" "}
            <strong>Extensions &rarr; Apps Script</strong>. Add a second script
            file named <code className="bg-muted rounded px-1">Api</code> and
            paste in <code className="bg-muted rounded px-1">AS/Api.gs</code>.
          </li>
          <li>
            Run <code className="bg-muted rounded px-1">setupApi()</code> from the
            Run dropdown, then open <strong>View &rarr; Logs</strong> and copy the
            token it prints.
          </li>
          <li>
            <strong>Deploy &rarr; New deployment &rarr; Web app</strong>, with
            &ldquo;Execute as: Me&rdquo; and &ldquo;Who has access:
            Anyone&rdquo;. Copy the <code className="bg-muted rounded px-1">/exec</code>{" "}
            URL.
          </li>
          <li>
            Create <code className="bg-muted rounded px-1">.env.local</code> in
            this project:
            <pre className="bg-muted mt-2 overflow-x-auto rounded p-3 text-xs">
              {`SHEETS_API_URL=https://script.google.com/macros/s/.../exec
SHEETS_API_TOKEN=<token from step 2>`}
            </pre>
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
