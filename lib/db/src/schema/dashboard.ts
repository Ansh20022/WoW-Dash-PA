import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const invitationsTable = pgTable("dashboard_invitations", {
  userId: text("user_id").primaryKey(),
  label: text("label").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const insertInvitationSchema = createInsertSchema(invitationsTable);

// Analytical data, not serialized files: report HTML is generated from a trusted template.
export const dashboardCacheTable = pgTable("dashboard_cache", {
  id: text("id").primaryKey(),
  payload: jsonb("payload").notNull(),
  metadata: jsonb("metadata").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const insertDashboardCacheSchema = createInsertSchema(dashboardCacheTable);
