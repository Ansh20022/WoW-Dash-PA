import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetDashboardStatusQueryKey, useRefreshDashboard, type DashboardStatus } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";

export function useAdminRefresh(onVersionChange: () => void) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const cb = useRef(onVersionChange);
  cb.current = onVersionChange;
  const m = useRefreshDashboard({
    mutation: {
      onSuccess: (next: DashboardStatus) => {
        const prev = qc.getQueryData<DashboardStatus>(getGetDashboardStatusQueryKey());
        if (!prev || prev.version !== next.version) {
          qc.invalidateQueries({ queryKey: getGetDashboardStatusQueryKey() });
          cb.current();
          toast({ title: "Report updated", description: `Now on version ${next.version}.` });
        } else {
          qc.setQueryData(getGetDashboardStatusQueryKey(), next);
          toast({ title: next.error ? "Refresh finished with an error" : "No new data", description: next.error ?? "The report is already current." });
        }
      },
      onError: (e) => toast({ variant: "destructive", title: "Refresh failed", description: `${errMsg(e)} The existing report is still shown.` }),
    },
  });
  return m;
}

export function useAutoRefresh(minutes: number, enabled: boolean, run: () => void) {
  const r = useRef(run);
  r.current = run;
  useEffect(() => {
    if (!enabled || ![5, 15].includes(minutes)) return;
    const t = setInterval(() => r.current(), Math.max(5, minutes) * 60_000);
    return () => clearInterval(t);
  }, [minutes, enabled]);
}
