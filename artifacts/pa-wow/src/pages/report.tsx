import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, RotateCw, Timer } from "lucide-react";
import { getGetDashboardStatusQueryKey, useGetDashboardStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourceBadge, StatusFacts } from "@/components/status-strip";
import { useAdminRefresh, useAutoRefresh } from "@/lib/refresh";
import { errMsg } from "@/lib/format";

export default function ReportPage({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [frameKey, setFrameKey] = useState(0);
  const [frameLoading, setFrameLoading] = useState(true);
  const [interval, setIntervalMin] = useState<string>(() => {
    const saved = localStorage.getItem("pa-wow-auto");
    return saved === "5" || saved === "15" ? saved : "off";
  });
  const status = useGetDashboardStatus({ query: { queryKey: getGetDashboardStatusQueryKey(), enabled: true } });
  const reloadFrame = () => { setFrameLoading(true); setFrameKey((k) => k + 1); };
  const refresh = useAdminRefresh(reloadFrame);
  const runRefresh = () => { if (!refresh.isPending) refresh.mutate(); };
  useAutoRefresh(interval === "off" ? 0 : Number(interval), isAdmin, runRefresh);
  const s = status.data;
  const pending = refresh.isPending || !!s?.refreshing;

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col">
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-[1540px] flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            {status.isLoading && <Skeleton className="h-5 w-96 max-w-full" />}
            {status.isError && (
              <span className="flex items-center gap-2 text-xs text-destructive" data-testid="text-status-error">
                <AlertTriangle className="h-3.5 w-3.5" />Status unavailable: {errMsg(status.error)}
                <button className="underline" onClick={() => status.refetch()} data-testid="button-retry-status">Retry</button>
              </span>
            )}
            {s && <><SourceBadge source={s.source} /><StatusFacts s={s} /></>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { qc.invalidateQueries({ queryKey: getGetDashboardStatusQueryKey() }); reloadFrame(); }} data-testid="button-reload-report">
              <RotateCw className="h-3.5 w-3.5" />Reload view
            </Button>
            {isAdmin && (
              <>
                <Select value={interval} onValueChange={(v) => { setIntervalMin(v); localStorage.setItem("pa-wow-auto", v); }}>
                  <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-auto-refresh"><Timer className="h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Auto refresh off</SelectItem>
                    <SelectItem value="5">Every 5 min</SelectItem>
                    <SelectItem value="15">Every 15 min</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={runRefresh} disabled={pending} data-testid="button-refresh-source">
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {pending ? "Refreshing" : "Refresh from source"}
                </Button>
              </>
            )}
          </div>
        </div>
        {pending && (
          <div className="border-t bg-secondary/60 px-4 py-2 text-center text-xs text-secondary-foreground md:px-6" data-testid="status-refresh-pending">
            Pulling the latest source files. This can take up to two minutes; the current report stays available meanwhile.
          </div>
        )}
        {s?.error && !pending && (
          <div className="border-t bg-destructive/8 px-4 py-2 text-center text-xs text-destructive md:px-6" data-testid="text-last-error">
            Last refresh failed: {s.error}. Showing the most recent successful report.
          </div>
        )}
      </div>
      <div className="relative flex-1 bg-[#f4f6fb]">
        {frameLoading && (
          <div className="absolute inset-0 z-10 space-y-3 p-6" data-testid="status-report-loading">
            <Skeleton className="h-16 w-full rounded-lg" />
            <div className="flex gap-2"><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-32" /></div>
            <Skeleton className="h-[420px] w-full rounded-lg" />
          </div>
        )}
        <iframe
          key={frameKey}
          src="/api/dashboard/report"
          title="Private Assets WoW report"
          sandbox="allow-scripts allow-downloads allow-modals"
          onLoad={() => setFrameLoading(false)}
          className="block h-[calc(100dvh-120px)] min-h-[900px] w-full border-0"
          data-testid="iframe-report"
        />
      </div>
    </div>
  );
}
