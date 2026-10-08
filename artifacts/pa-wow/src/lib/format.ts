export function fmtDate(v: string | null | undefined): string {
  if (!v) return "Never";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
export function sourceLabel(s: string): string {
  return s === "sharepoint" ? "SharePoint sync" : "Uploaded snapshot";
}
export function errMsg(e: unknown): string {
  if (!e) return "Unknown error";
  const anyE = e as { data?: { error?: string; message?: string }; message?: string };
  return anyE.data?.error || anyE.data?.message || anyE.message || "Request failed";
}
export function appUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}/`;
}
export function isPreviewHost(): boolean {
  return window.location.hostname.endsWith(".replit.dev");
}
