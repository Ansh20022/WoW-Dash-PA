import type { DashboardStatus } from "@workspace/api-client-react";
import { fmtDate, sourceLabel } from "@/lib/format";

export function SourceBadge({ source }: { source: string }) {
  const sp = source === "sharepoint";
  return (
    <span data-testid="badge-source" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${sp ? "border-[#2bb0a3]/40 bg-[#2bb0a3]/10 text-[#16756c]" : "border-[#e0a800]/40 bg-[#e0a800]/10 text-[#8a6700]"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${sp ? "bg-[#2bb0a3]" : "bg-[#e0a800]"}`} />{sourceLabel(source)}
    </span>
  );
}

export function StatusFacts({ s }: { s: DashboardStatus }) {
  const facts = [
    ["Quarter", s.quarter],
    ["Snapshot", s.snapshotDate],
    ["Last success", fmtDate(s.lastSuccess)],
    ["Version", s.version],
  ];
  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-1">
      {facts.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2">
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{k}</dt>
          <dd className="font-mono text-xs font-medium" data-testid={`text-status-${k.toLowerCase().replace(" ", "-")}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
