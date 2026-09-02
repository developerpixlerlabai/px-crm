"use client";

import { useActionState } from "react";
import { Loader2, Lock } from "lucide-react";

import { login, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: LoginState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, INITIAL);

  return (
    <Card className="w-full max-w-sm gap-5 p-6">
      <div className="flex items-start gap-3">
        <Lock className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <div>
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            This dashboard is private. Use the shared team credentials.
          </p>
        </div>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoFocus
            required
            disabled={pending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
          />
        </div>

        {/* aria-live so a screen reader announces the failure, which a plain
            re-render of the form would not do. */}
        <p aria-live="polite" className="text-destructive min-h-4 text-sm">
          {state.error}
        </p>

        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}
