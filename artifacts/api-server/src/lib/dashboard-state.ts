import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { db, dashboardCacheTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetDashboardStatusResponse } from "@workspace/api-zod";
import { z } from "zod";

export const resources = fileURLToPath(new URL("./resources/", import.meta.url));
export type DashboardStatus = z.infer<typeof GetDashboardStatusResponse>;
export type FinanceData = {
  cw: string;
  quarter: string;
  baselines: Record<string, unknown>;
  [key: string]: unknown;
};
export interface Snapshot {
  data: FinanceData;
  validation: string;
  files: { name: string; size: number }[];
  warnings?: string[];
}
export const contentVersion = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

export async function readBundledSnapshot(): Promise<Snapshot> {
  return JSON.parse(await readFile(new URL("./resources/snapshot.json", import.meta.url), "utf8"));
}

export async function dashboardState(): Promise<{ data: FinanceData; status: DashboardStatus; fingerprint?: string }> {
  const snapshot = await readBundledSnapshot();
  const [row] = await db.select().from(dashboardCacheTable).where(eq(dashboardCacheTable.id, "current"));
  if (row) {
    const metadata = row.metadata as DashboardStatus & { fingerprint?: string };
    // A new validated upload must supersede an older cached snapshot, including
    // one persisted by a failed SharePoint refresh.
    if (metadata.quarter === snapshot.data.quarter && Date.parse(metadata.snapshotDate) >= Date.parse(snapshot.data.cw)) {
      return { data: row.payload as FinanceData, status: GetDashboardStatusResponse.parse(metadata), fingerprint: metadata.fingerprint };
    }
  }
  return {
    data: snapshot.data,
    status: {
      source: "uploaded_snapshot",
      snapshotDate: snapshot.data.cw,
      quarter: snapshot.data.quarter,
      lastAttempt: null,
      lastSuccess: null,
      error: "SharePoint folder access was denied by Microsoft. An administrator must grant this integration access to the finance site.",
      validation: snapshot.validation,
      warnings: [`This is the uploaded ${snapshot.data.cw} snapshot, not a live SharePoint update.`, ...(snapshot.warnings ?? [])],
      files: snapshot.files,
      version: contentVersion(snapshot.data),
      refreshing: false,
    },
  };
}

export async function storeDashboard(data: FinanceData, status: DashboardStatus, fingerprint?: string) {
  const metadata = { ...GetDashboardStatusResponse.parse(status), fingerprint };
  await db.insert(dashboardCacheTable).values({ id: "current", payload: data, metadata })
    .onConflictDoUpdate({ target: dashboardCacheTable.id, set: { payload: data, metadata, updatedAt: new Date() } });
}
