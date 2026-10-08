import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogIn, LogOut, RotateCw, ShieldAlert } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { getGetDashboardAccessQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandMark } from "@/components/brand";
import { CopyButton } from "@/components/copy-button";

function GateFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] bg-[#10205b] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative mx-auto grid min-h-[100dvh] max-w-6xl grid-cols-1 gap-10 px-6 py-10 md:grid-cols-[1.1fr_1fr] md:items-center md:px-10">
        <div className="rise">
          <BrandMark />
          <h1 className="mt-12 font-serif text-4xl leading-[1.05] md:text-6xl">
            Your weekly view of<br /><span className="italic text-[#e0a800]">Private Assets</span> sales.
          </h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-white/70">
            Sales, cancellations and pipeline changes, reconciled week on week. Access is by invitation from the report owner.
          </p>
          <div className="mt-10 flex gap-6 font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
            <span>Invitation only</span><span>Read-only report</span><span>Validated calculations</span>
          </div>
        </div>
        <div className="rise rounded-xl bg-[hsl(var(--card))] p-7 text-[hsl(var(--foreground))] shadow-[0_30px_60px_-20px_rgba(4,10,40,.6)] md:p-9" style={{ animationDelay: "120ms" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function GateLoading() {
  return (
    <GateFrame>
      <div className="space-y-4" data-testid="status-gate-loading">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-40" />
      </div>
    </GateFrame>
  );
}

export function LoginGate() {
  const { login } = useAuth();
  return (
    <GateFrame>
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--accent))]">Sign in required</div>
      <h2 className="mt-3 font-serif text-3xl">Welcome back.</h2>
      <p className="mt-3 text-sm text-muted-foreground">Sign in with your account. If you have not been invited yet, signing in will show you an account ID to send to the report owner.</p>
      <Button size="lg" className="mt-8 w-full" onClick={login} data-testid="button-login"><LogIn className="h-4 w-4" />Log in</Button>
      <p className="mt-5 text-xs text-muted-foreground">No financial data is shown until your account has been granted access.</p>
    </GateFrame>
  );
}

export function AccessErrorGate({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { logout } = useAuth();
  return (
    <GateFrame>
      <ShieldAlert className="h-6 w-6 text-destructive" />
      <h2 className="mt-3 font-serif text-2xl">Could not check your access</h2>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="text-access-error">{message}</p>
      <div className="mt-6 flex gap-2">
        <Button onClick={onRetry} data-testid="button-retry-access"><RotateCw className="h-4 w-4" />Try again</Button>
        <Button variant="outline" onClick={logout} data-testid="button-logout"><LogOut className="h-4 w-4" />Log out</Button>
      </div>
    </GateFrame>
  );
}

export function UnauthorizedGate({ adminConfigured }: { adminConfigured: boolean }) {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const id = user?.id ?? "";
  return (
    <GateFrame>
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#b07f00]"><KeyRound className="h-3.5 w-3.5" />Awaiting access</div>
      <h2 className="mt-3 font-serif text-3xl">You're signed in, but not on the list yet.</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        {adminConfigured
          ? "Copy your account ID below and send it to the report owner. Once they add it, reload this page."
          : "This report has not finished setup. If you are the owner, copy your account ID below and send it to the project agent so it can register you as administrator. Access cannot be granted from this screen."}
      </p>
      <div className="mt-6 rounded-lg border bg-muted/60 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Your account ID</div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <code className="break-all font-mono text-base font-medium" data-testid="text-account-id">{id || "Unavailable"}</code>
          {id && <CopyButton value={id} testId="button-copy-account-id" />}
        </div>
        {user?.email && <div className="mt-2 text-xs text-muted-foreground">Signed in as {user.email}</div>}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => qc.invalidateQueries({ queryKey: getGetDashboardAccessQueryKey() })} data-testid="button-check-again"><RotateCw className="h-4 w-4" />Check again</Button>
        <Button variant="ghost" onClick={logout} data-testid="button-logout"><LogOut className="h-4 w-4" />Log out</Button>
      </div>
    </GateFrame>
  );
}
