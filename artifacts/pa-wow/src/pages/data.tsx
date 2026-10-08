import { AlertTriangle, CheckCircle2, FileSpreadsheet, RotateCw } from "lucide-react";
import { getGetDashboardStatusQueryKey, useGetDashboardStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceBadge } from "@/components/status-strip";
import { errMsg, fmtBytes, fmtDate, sourceLabel } from "@/lib/format";

export default function DataPage() {
  const q = useGetDashboardStatus({ query: { queryKey: getGetDashboardStatusQueryKey(), enabled: true } });
  return (
    <div className="ledger-grid min-h-[calc(100dvh-56px)]">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
        <div className="rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">Provenance</div>
            <h1 className="mt-2 font-serif text-4xl">Where these numbers come from</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-reload-status"><RotateCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />Reload</Button>
        </div>
        {q.isLoading && <div className="mt-8 space-y-4"><Skeleton className="h-36 w-full" /><Skeleton className="h-56 w-full" /></div>}
        {q.isError && (
          <div className="mt-8 rounded-lg border border-destructive/30 bg-card p-6">
            <p className="text-sm text-destructive" data-testid="text-data-error">{errMsg(q.error)}</p>
            <Button size="sm" className="mt-4" onClick={() => q.refetch()} data-testid="button-retry-data">Retry</Button>
          </div>
        )}
        {q.data && (() => {
          const s = q.data;
          const ok = !s.error;
          return (
            <div className="mt-8 space-y-6">
              <section className="rise grid grid-cols-1 overflow-hidden rounded-xl border bg-card md:grid-cols-[1fr_1.4fr]">
                <div className="bg-[#10205b] p-6 text-white">
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/60">Source</div>
                  <div className="mt-2 font-serif text-2xl">{sourceLabel(s.source)}</div>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">
                    {s.source === "sharepoint" ? "Pulled from the connected SharePoint library on each refresh." : "A fixed snapshot uploaded by the owner. It does not change until a new file is provided."}
                  </p>
                  <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-white/60">Quarter / snapshot</div>
                  <div className="mt-1 font-mono text-lg">{s.quarter} <span className="text-white/50">/</span> {s.snapshotDate}</div>
                </div>
                <dl className="grid grid-cols-2 gap-px bg-border">
                  {[["Last attempt", fmtDate(s.lastAttempt)], ["Last success", fmtDate(s.lastSuccess)], ["Version", s.version], ["State", s.refreshing ? "Refreshing" : "Idle"]].map(([k, v]) => (
                    <div key={k} className="bg-card p-5">
                      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{k}</dt>
                      <dd className="mt-1.5 break-all font-mono text-sm font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="rise rounded-xl border bg-card p-6" style={{ animationDelay: "80ms" }}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-serif text-xl">Validation</h2><SourceBadge source={s.source} />
                </div>
                <div className={`mt-4 flex gap-3 rounded-lg p-4 text-sm ${ok ? "bg-[#e6f4ec] text-[#1f6b48]" : "bg-destructive/10 text-destructive"}`} data-testid="text-validation">
                  {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <div><div>{s.validation}</div>{s.error && <div className="mt-1 font-mono text-xs">{s.error}</div>}</div>
                </div>
                <h3 className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Warnings ({s.warnings.length})</h3>
                {s.warnings.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">None raised for this version.</p> : (
                  <ul className="mt-2 divide-y rounded-lg border">
                    {s.warnings.map((w, i) => <li key={i} className="flex gap-3 px-4 py-2.5 text-sm" data-testid={`text-warning-${i}`}><span className="font-mono text-xs text-[#b07f00]">{String(i + 1).padStart(2, "0")}</span>{w}</li>)}
                  </ul>
                )}
              </section>
              <section className="rise rounded-xl border bg-card p-6" style={{ animationDelay: "160ms" }}>
                <h2 className="font-serif text-xl">Source files</h2>
                {s.files.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No source files recorded.</p> : (
                  <ul className="mt-4 divide-y">
                    {s.files.map((f, i) => (
                      <li key={f.name} className="flex items-center gap-3 py-3" data-testid={`row-file-${i}`}>
                        <FileSpreadsheet className="h-4 w-4 text-accent" />
                        <span className="min-w-0 flex-1 truncate font-mono text-sm">{f.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{fmtBytes(f.size)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
