import { Router, type IRouter, type RequestHandler } from "express";
import { db, invitationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateInvitationBody, CreateInvitationResponse, ListInvitationsResponse,
  RevokeInvitationParams, GetDashboardStatusResponse, GetDashboardAccessResponse,
} from "@workspace/api-zod";
import { dashboardState } from "../lib/dashboard-state";
import { refreshDashboard, isRefreshing } from "../lib/dashboard-refresh";
import { renderReport } from "../lib/dashboard-report";

const router: IRouter = Router();
const adminId = () => process.env.DASHBOARD_ADMIN_USER_ID?.trim() ?? "";
const isAdmin = (id?: string) => !!adminId() && id === adminId();

async function permitted(id?: string): Promise<boolean> {
  if (!id) return false;
  if (isAdmin(id)) return true;
  const [invitation] = await db.select({ userId: invitationsTable.userId }).from(invitationsTable).where(eq(invitationsTable.userId, id));
  return !!invitation;
}

const requireAccess: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Please log in." }); return; }
  if (!await permitted(req.user.id)) { res.status(403).json({ error: "An invitation is required." }); return; }
  next();
};
const requireAdmin: RequestHandler = (req, res, next) => {
  if (!isAdmin(req.user?.id)) { res.status(403).json({ error: "Only the dashboard owner can perform this action." }); return; }
  next();
};
const sameOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host") || req.get("host");
  let matches = false;
  try { matches = !!origin && new URL(origin).host === host; } catch { /* fail closed */ }
  if (!matches) { res.status(403).json({ error: "A same-origin request is required." }); return; }
  next();
};

router.get("/dashboard/access", async (req, res): Promise<void> => {
  res.json(GetDashboardAccessResponse.parse({
    authorized: await permitted(req.user?.id),
    isAdmin: isAdmin(req.user?.id),
    adminConfigured: !!adminId(),
  }));
});

router.get("/dashboard/status", requireAccess, async (_req, res): Promise<void> => {
  const { status } = await dashboardState();
  // A recent successful sync is not the same as recent business data.
  const warnings = [...status.warnings];
  if (Date.now() - Date.parse(status.snapshotDate) > 14 * 86_400_000) {
    warnings.push("The latest available business snapshot is more than 14 days old.");
  }
  res.json(GetDashboardStatusResponse.parse({ ...status, warnings, refreshing: isRefreshing() }));
});
router.post("/dashboard/refresh", requireAccess, requireAdmin, sameOrigin, async (_req, res): Promise<void> => {
  res.json(GetDashboardStatusResponse.parse(await refreshDashboard()));
});
router.get("/dashboard/report", requireAccess, async (_req, res): Promise<void> => {
  const { data } = await dashboardState();
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self' https://replit.com https://*.replit.com; sandbox allow-scripts allow-downloads allow-modals");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.type("html").send(await renderReport(data));
});
router.get("/dashboard/invitations", requireAccess, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(invitationsTable).orderBy(desc(invitationsTable.createdAt));
  res.json(ListInvitationsResponse.parse(rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }))));
});
router.post("/dashboard/invitations", requireAccess, requireAdmin, sameOrigin, async (req, res): Promise<void> => {
  const result = CreateInvitationBody.safeParse(req.body);
  if (!result.success || !result.data?.userId.trim() || !result.data.label.trim()) { res.status(400).json({ error: "Account ID and label are required." }); return; }
  const userId = result.data.userId.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) { res.status(400).json({ error: "Enter the exact account ID shown after your colleague logs in." }); return; }
  if (isAdmin(userId)) { res.status(400).json({ error: "The owner already has access." }); return; }
  const [invitation] = await db.insert(invitationsTable).values({
    userId, label: result.data.label.trim(), createdBy: req.user!.id,
  }).onConflictDoUpdate({ target: invitationsTable.userId, set: { label: result.data.label.trim() } }).returning();
  res.status(201).json(CreateInvitationResponse.parse({ ...invitation, createdAt: invitation!.createdAt.toISOString() }));
});
router.delete("/dashboard/invitations/:userId", requireAccess, requireAdmin, sameOrigin, async (req, res): Promise<void> => {
  const result = RevokeInvitationParams.safeParse(req.params);
  if (!result.success) { res.status(400).json({ error: "Invalid account ID." }); return; }
  if (isAdmin(result.data.userId)) { res.status(400).json({ error: "The owner's access cannot be revoked here." }); return; }
  await db.delete(invitationsTable).where(eq(invitationsTable.userId, result.data.userId));
  res.sendStatus(204);
});
export default router;
