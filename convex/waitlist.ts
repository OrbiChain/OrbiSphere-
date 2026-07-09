import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// SECURITY-HARDENED WAITLIST MODULE
// 
// Fixes applied (from security audit 2026-07-09):
//   C-1: Added input validation gate — rejects non-email input
//   C-2: Added email format validation, length limits, sanitization
//   C-3: Added per-window rate limiting to prevent database flooding
//
// Integration notes:
//   - Drop this file into your convex/ directory
//   - If you have an existing waitlist.ts, replace its contents with this
//   - The join() and count() exports maintain the same API contract
//   - Frontend code should NOT need changes (same args/return shape)
//   - For Turnstile/CAPTCHA: uncomment the verification block below
//     and add TURNSTILE_SECRET_KEY to your Convex environment variables
// ============================================================

// --- Constants ---

/** RFC 5321 max email length */
const MAX_EMAIL_LENGTH = 254;

/** 
 * Email regex — RFC 5322 compliant for practical use.
 * Rejects empty strings, plain text, HTML tags, SQL fragments.
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/** Rate limit: max signups within the time window */
const RATE_LIMIT_MAX_JOINS = 10;

/** Rate limit: time window in milliseconds (1 hour) */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// --- Helpers ---

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  if (email.length > MAX_EMAIL_LENGTH) return false;
  if (email.length < 5) return false; // a@b.c minimum
  return EMAIL_REGEX.test(email);
}

/**
 * Sanitize and normalize email input.
 * Strips HTML tags, dangerous characters, trims, and lowercases.
 */
function sanitizeEmail(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/[<>"']/g, "")  // Strip remaining dangerous chars
    .trim()
    .toLowerCase();
}

// --- Public API ---

/**
 * Join the waitlist with a validated email address.
 *
 * Security measures:
 * - Email format validation (rejects non-emails, XSS, SQL injection)
 * - Length limit (254 chars per RFC 5321)
 * - Input sanitization (HTML stripping, lowercasing)
 * - Duplicate detection
 * - Rate limiting (max joins per time window)
 */
export const join = mutation({
  args: {
    email: v.string(),
    // Uncomment when Turnstile is configured:
    // turnstileToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Step 1: Sanitize ---
    const sanitized = sanitizeEmail(args.email);

    // --- Step 2: Validate format ---
    if (!isValidEmail(sanitized)) {
      throw new Error("Please enter a valid email address.");
    }

    // --- Step 3: Turnstile/CAPTCHA verification (recommended) ---
    // Uncomment this block once you've set up Cloudflare Turnstile:
    //
    // if (!args.turnstileToken) {
    //   throw new Error("Verification required.");
    // }
    // const verifyResponse = await fetch(
    //   "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    //   {
    //     method: "POST",
    //     headers: { "Content-Type": "application/x-www-form-urlencoded" },
    //     body: new URLSearchParams({
    //       secret: process.env.TURNSTILE_SECRET_KEY!,
    //       response: args.turnstileToken,
    //     }),
    //   }
    // );
    // const verifyResult = await verifyResponse.json();
    // if (!verifyResult.success) {
    //   throw new Error("Verification failed. Please try again.");
    // }

    // --- Step 4: Rate limiting ---
    const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;
    const recentEntries = await ctx.db
      .query("waitlist")
      .filter((q) => q.gte(q.field("_creationTime"), windowStart))
      .collect();

    if (recentEntries.length >= RATE_LIMIT_MAX_JOINS) {
      throw new Error(
        "We're receiving a lot of signups right now. Please try again in a few minutes."
      );
    }

    // --- Step 5: Duplicate check ---
    const existing = await ctx.db
      .query("waitlist")
      .filter((q) => q.eq(q.field("email"), sanitized))
      .first();

    if (existing) {
      return { message: "You're already on the list!", success: true };
    }

    // --- Step 6: Insert validated entry ---
    await ctx.db.insert("waitlist", {
      email: sanitized,
      joinedAt: Date.now(),
    });

    return { message: "Welcome to the future.", success: true };
  },
});

/**
 * Get the current waitlist count.
 *
 * Note: This is intentionally public for social proof on the landing page.
 * If you want to restrict access, wrap with auth middleware.
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("waitlist").collect();
    return entries.length;
  },
});
