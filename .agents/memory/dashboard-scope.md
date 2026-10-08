---
name: Dashboard scope and access
description: User requirements for the live Private Assets WoW dashboard
---
The user wants the supplied PA_WoW_Dashboard HTML package converted into a live, link-shareable dashboard using the WoW Analysis SharePoint folder and its extracts as the source.

**Why:** The user asked for a live dashboard rather than a static HTML file.

**How to apply:** Preserve supplied calculations and dashboard behavior; clearly distinguish uploaded snapshots from successful SharePoint refreshes.

Access must be restricted to invited colleagues.

**Why:** The user explicitly selected “Only invited colleagues” when asked who should have access.

**How to apply:** Protect all finance data and report endpoints with authentication and authorization. Signing in alone must not grant access.

Always use the latest complete RA/PCS extract pair. The 5 October 2026 snapshot must still report Q3-26, not Q4-26.

**Why:** The user explicitly corrected the calendar-quarter assumption: “the date is 5 oct but fical qtr will still be q3 26 only.”

**How to apply:** Treat snapshot date and reporting quarter independently. Keep Q3-26 selected until the user requests a quarter change; choose quarter-start baselines and EDWH references from the selected reporting quarter.
