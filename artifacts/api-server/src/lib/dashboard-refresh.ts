import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pool } from "@workspace/db";
import { dashboardState, storeDashboard, resources, contentVersion, type Snapshot } from "./dashboard-state";
import { sourceFolder, children, download, SourceError, type DriveItem } from "./sharepoint";
import { logger } from "./logger";

const exec = promisify(execFile);
let active: Promise<Awaited<ReturnType<typeof dashboardState>>["status"]> | undefined;
export const isRefreshing = () => !!active;

export function refreshDashboard() {
  if (active) return active;
  active = refresh().finally(() => { active = undefined; });
  return active;
}

async function refresh() {
  // PostgreSQL advisory lock prevents concurrent expensive syncs across app instances.
  const client = await pool.connect();
  let locked = false;
  let directory: string | undefined;
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(82367491) AS acquired");
    locked = lock.rows[0].acquired === true;
    const prior = await dashboardState();
    if (!locked) return { ...prior.status, refreshing: true };
    const attempted = new Date().toISOString();
    // Shared debounce applies even across restarts; failed attempts are recorded too.
    if (prior.status.lastAttempt && Date.now() - new Date(prior.status.lastAttempt).getTime() < 30_000) return prior.status;
    try {
      const { drive, folder } = await sourceFolder();
      const root = await children(drive, folder.id);
      const extractFolder = root.find(f => f.folder && f.name.toLowerCase() === "extracts");
      if (!extractFolder) throw new SourceError("No extracts folder found in WoW Analysis.");
      const listed = await children(drive, extractFolder.id);
      const files = listed.filter(f => !f.folder && /^(RA|PCS)_\d{2}-\d{2}-\d{4}\.csv$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
      if (!files.length) throw new SourceError("No matching RA_DD-MM-YYYY.csv and PCS_DD-MM-YYYY.csv extracts were found.");
      if (files.length > 200 || files.reduce((sum, f) => sum + (f.size ?? 0), 0) > 500_000_000) throw new SourceError("Extracts exceed the supported 200-file / 500 MB refresh limit.");
      const reference = root.find(f => f.name === "refs_edwh.json" && !f.folder);
      const tracked = [...files, ...(reference ? [reference] : [])];
      const fingerprintFor = (items: DriveItem[]) => contentVersion(items.map(f => ({ id: f.id, name: f.name, size: f.size, eTag: f.eTag, modified: f.lastModifiedDateTime })));
      const fingerprint = fingerprintFor(tracked);
      if (prior.status.source === "sharepoint" && prior.fingerprint === fingerprint) {
        const status = { ...prior.status, lastAttempt: attempted, lastSuccess: new Date().toISOString(), error: null, refreshing: false };
        await storeDashboard(prior.data, status, fingerprint);
        return status;
      }
      directory = await mkdtemp(path.join(tmpdir(), "pa-wow-"));
      const extracts = path.join(directory, "extracts");
      await mkdir(extracts);
      for (const file of ["build_wow.py", "_dash_template.html", "_demo_template.html", "run_dashboard.py", "refs_edwh.json", "reporting_config.json"]) {
        await cp(path.join(resources, file), path.join(directory, file));
      }
      for (let i = 0; i < files.length; i += 3) await Promise.all(files.slice(i, i + 3).map(f => download(drive, f, extracts)));
      if (reference) await download(drive, reference, directory);
      const after = (await children(drive, extractFolder.id)).filter(f => !f.folder && /^(RA|PCS)_\d{2}-\d{2}-\d{4}\.csv$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
      const afterRoot = reference ? await children(drive, folder.id) : root;
      const afterReference = afterRoot.find(f => f.name === "refs_edwh.json" && !f.folder);
      if (fingerprintFor([...after, ...(afterReference ? [afterReference] : [])]) !== fingerprint) throw new SourceError("The source files changed during refresh. Last validated data retained; retry when uploads are complete.");
      try {
        await exec("python3", [path.join(directory, "run_dashboard.py")], { timeout: 180_000, maxBuffer: 2_000_000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
      } catch (e) {
        const stderr = (e as { stderr?: string }).stderr ?? "";
        const specific = stderr.split("\n").find(line => /^(Missing EDWH|Incomplete EDWH|Incomplete RA\/PCS|At least two complete|Empty extract:|Missing numeric column|Invalid numeric values|Source reconciliation failed)/.test(line));
        throw new SourceError(specific ?? "Source calculation failed. Verify the CSV columns, numeric values, quarter references and Python runtime. Last validated data retained.");
      }
      const snapshot = JSON.parse(await readFile(path.join(directory, "result.json"), "utf8")) as Snapshot;
      if (!snapshot.data?.cw || !snapshot.data.quarter || !snapshot.validation.includes("OVERALL: ALL CHECKS PASSED")) throw new SourceError("The rebuilt dashboard did not pass validation.");
      if (Date.parse(snapshot.data.cw) < Date.parse(prior.status.snapshotDate)) throw new SourceError("SharePoint contains an older snapshot than the current dashboard. Refusing to replace it with older data.");
      const status = {
        source: "sharepoint" as const,
        snapshotDate: snapshot.data.cw,
        quarter: snapshot.data.quarter,
        lastAttempt: attempted,
        lastSuccess: new Date().toISOString(),
        error: null,
        validation: snapshot.validation,
        warnings: [...(snapshot.warnings ?? []), ...(reference ? [] : ["refs_edwh.json was not found in SharePoint; only reference quarters included in the supplied package are available."])],
        files: snapshot.files,
        version: contentVersion(snapshot.data),
        refreshing: false,
      };
      await storeDashboard(snapshot.data, status, fingerprint);
      logger.info({ fileCount: files.length, version: status.version }, "Dashboard refreshed and validated");
      return status;
    } catch (e) {
      const error = e instanceof SourceError ? e.message : "SharePoint refresh could not complete. The previous validated snapshot has been retained.";
      const status = { ...prior.status, lastAttempt: attempted, error, refreshing: false };
      await storeDashboard(prior.data, status, prior.fingerprint);
      logger.warn({ errorType: e instanceof Error ? e.name : "unknown" }, "Dashboard refresh failed; last valid data retained");
      return status;
    }
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    if (locked) await client.query("SELECT pg_advisory_unlock(82367491)").catch(() => undefined);
    client.release();
  }
}
