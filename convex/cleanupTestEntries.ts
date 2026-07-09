import { mutation, query } from "./_generated/server";

// ============================================================
// ONE-TIME CLEANUP — Remove entries from security audit testing
//
// During the security audit on 2026-07-09, 12 test entries were
// added to the production waitlist database to demonstrate the
// lack of input validation and rate limiting.
//
// Usage:
//   1. Deploy this file to Convex
//   2. Run `previewTestEntries` from the Convex dashboard to see
//      what will be deleted (dry run)
//   3. Run `purgeTestEntries` to delete them
//   4. Remove this file from your project after cleanup
// ============================================================

/** Known test email addresses used during security probing */
const TEST_EMAILS = [
  "test@probe.security",
  "racetest0@probe.security",
  "racetest1@probe.security",
  "racetest2@probe.security",
  "racetest3@probe.security",
  "racetest4@probe.security",
  "not-an-email",
  "<script>alert(1)</script>",
  "'; drop table waitlist; --",
];

/**
 * Detect whether a waitlist entry is a test/junk entry.
 */
function isTestEntry(email: unknown): boolean {
  if (typeof email !== "string") return true;

  // Empty strings
  if (email.trim() === "") return true;

  // Absurdly long payloads (the 100KB test string)
  if (email.length > 500) return true;

  // Known test patterns
  if (TEST_EMAILS.includes(email.toLowerCase())) return true;

  // Catch-all for probe domain
  if (email.endsWith("@probe.security")) return true;

  // HTML/script payloads
  if (email.includes("<script>") || email.includes("</script>")) return true;

  // SQL injection patterns
  if (email.includes("DROP TABLE") || email.includes("drop table")) return true;

  return false;
}

/**
 * Dry run — preview which entries would be deleted.
 * Run this first from the Convex dashboard to verify.
 */
export const previewTestEntries = query({
  args: {},
  handler: async (ctx) => {
    const allEntries = await ctx.db.query("waitlist").collect();
    const testEntries = allEntries.filter((entry) =>
      isTestEntry(entry.email)
    );

    return {
      totalEntries: allEntries.length,
      testEntriesFound: testEntries.length,
      legitimateEntries: allEntries.length - testEntries.length,
      entriesToDelete: testEntries.map((e) => ({
        id: e._id,
        email:
          typeof e.email === "string"
            ? e.email.substring(0, 80) + (e.email.length > 80 ? "..." : "")
            : "[non-string]",
        createdAt: new Date(e._creationTime).toISOString(),
      })),
    };
  },
});

/**
 * Delete all test/junk entries from the waitlist.
 * Run `previewTestEntries` first to verify what will be deleted.
 */
export const purgeTestEntries = mutation({
  args: {},
  handler: async (ctx) => {
    const allEntries = await ctx.db.query("waitlist").collect();
    let deleted = 0;

    for (const entry of allEntries) {
      if (isTestEntry(entry.email)) {
        await ctx.db.delete(entry._id);
        deleted++;
      }
    }

    return {
      message: `Cleanup complete. Deleted ${deleted} test entries.`,
      deletedCount: deleted,
      remainingCount: allEntries.length - deleted,
    };
  },
});
