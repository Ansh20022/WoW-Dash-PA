import { ReplitConnectors } from "@replit/connectors-sdk";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export type DriveItem = {
  id: string; name: string; size?: number; eTag?: string;
  lastModifiedDateTime?: string; folder?: object;
  parentReference?: { driveId?: string };
};
export class SourceError extends Error {}
const graphOrigin = "https://graph.microsoft.com";

export async function graph<T>(route: string): Promise<T> {
  if (!route.startsWith("/v1.0/")) throw new SourceError("Invalid SharePoint resource path.");
  const response = await new ReplitConnectors().proxy("sharepoint", route, { method: "GET" });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new SourceError("Microsoft denied access to the WoW Analysis folder. Your Microsoft 365 administrator must grant the integration access to this SharePoint site.");
    if (response.status === 404) throw new SourceError("The configured SharePoint folder or source file was not found.");
    if (response.status === 429) throw new SourceError("SharePoint is limiting requests. Please wait before refreshing again.");
    throw new SourceError(`SharePoint returned HTTP ${response.status}. The previous dashboard has been retained.`);
  }
  return response.json() as Promise<T>;
}

export async function sourceFolder(): Promise<{ drive: string; folder: DriveItem }> {
  const configured = process.env.SHAREPOINT_FOLDER_URL;
  if (!configured) throw new SourceError("SharePoint folder has not been configured.");
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.hostname !== "onemsci.sharepoint.com") throw new SourceError("The source must be on the configured MSCI SharePoint tenant.");
  const folder = await graph<DriveItem>(`/v1.0/shares/u!${Buffer.from(configured).toString("base64url")}/driveItem`);
  const drive = folder.parentReference?.driveId;
  if (!drive || !folder.folder) throw new SourceError("The SharePoint link did not resolve to a document folder.");
  return { drive, folder };
}

export async function children(drive: string, item: string): Promise<DriveItem[]> {
  const all: DriveItem[] = [];
  let route: string | undefined = `/v1.0/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(item)}/children?$select=id,name,size,folder,eTag,lastModifiedDateTime&$top=200`;
  for (let page = 0; route && page < 10; page++) {
    const result: { value: DriveItem[]; "@odata.nextLink"?: string } = await graph(route);
    if (!Array.isArray(result.value)) throw new SourceError("Unexpected SharePoint folder listing.");
    all.push(...result.value);
    const next = result["@odata.nextLink"];
    if (next) {
      const nextUrl = new URL(next);
      if (nextUrl.origin !== graphOrigin) throw new SourceError("Invalid SharePoint pagination link.");
      route = nextUrl.pathname + nextUrl.search;
    } else route = undefined;
  }
  if (route) throw new SourceError("Source folder is too large. Keep only weekly extracts in the extracts folder.");
  return all;
}

export async function download(drive: string, item: DriveItem, directory: string): Promise<void> {
  if (!/^(?:(?:RA|PCS)_\d{2}-\d{2}-\d{4}\.csv|refs_edwh\.json)$/.test(item.name)) throw new SourceError("Unexpected source filename.");
  const limit = item.name.endsWith(".json") ? 1_000_000 : 25_000_000;
  if (!item.size || item.size > limit) throw new SourceError(`Source file is empty or too large: ${item.name}`);
  const metadata = await graph<{ "@microsoft.graph.downloadUrl"?: string }>(`/v1.0/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(item.id)}?$select=id,@microsoft.graph.downloadUrl`);
  const signed = metadata["@microsoft.graph.downloadUrl"];
  if (!signed) throw new SourceError("SharePoint did not provide a download URL.");
  const url = new URL(signed);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".sharepoint.com")) throw new SourceError("Unexpected SharePoint download host.");
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "error" });
  if (!response.ok || !response.body) throw new SourceError(`Could not download ${item.name}. Please retry.`);
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > limit) throw new SourceError(`Source file exceeds size limit: ${item.name}`);
    parts.push(chunk);
  }
  if (total !== item.size) throw new SourceError(`Source file changed during download: ${item.name}. Please retry when the upload has finished.`);
  await writeFile(path.join(directory, item.name), Buffer.concat(parts));
}
