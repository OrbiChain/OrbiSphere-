# SphereChain Security Audit — 2026-07-09

## Executive Summary

A comprehensive security assessment was performed on the SphereChain/OrbiSphere production infrastructure. **3 critical vulnerabilities were discovered and exploited** in the Convex backend, plus **5 additional findings** (2 high, 3 medium) related to the cryptographic architecture.

This PR addresses the 3 critical backend issues with drop-in code fixes. The remaining architectural findings require design-level changes before wallet launch.

---

## Critical Findings (Fixed in This PR)

### C-1: Unauthenticated Convex API ← `convex/waitlist.ts`
The `waitlist:join` mutation was callable by anyone via direct HTTP POST with no authentication, session, or CAPTCHA. Combined with the backend URL being exposed in the public JS bundle, any attacker could interact with the database freely.

**Fix applied:** Input validation gate, sanitization, and CAPTCHA integration point (Turnstile-ready, uncomment when configured).

### C-2: Zero Input Validation ← `convex/waitlist.ts`
The mutation accepted any string as an email: empty strings, HTML/XSS payloads (`<script>alert(1)</script>`), SQL injection strings, and 100KB garbage. Stored XSS risk if entries are displayed in any admin interface.

**Fix applied:** RFC-compliant email regex, 254-char length limit, HTML stripping, character sanitization, lowercase normalization.

### C-3: No Rate Limiting ← `convex/waitlist.ts`
No throttling on any endpoint. 5+ concurrent requests all succeeded. An attacker could flood the database, exhaust storage quotas, and inflate metrics.

**Fix applied:** Time-window rate limiting (configurable max joins per hour).

### Database Cleanup ← `convex/cleanupTestEntries.ts`
12 test entries were added during the security audit. A one-time cleanup mutation is provided:
1. Run `previewTestEntries` query to see what will be deleted (dry run)
2. Run `purgeTestEntries` mutation to delete them
3. Remove `cleanupTestEntries.ts` from the project after cleanup

---

## Remaining Findings (Require Architectural Changes)

These are **not fixed in this PR** — they require design decisions and code changes in the wallet/fingerprint system:

### H-1: Backend URL Exposed in Public JS Bundle
- **Severity:** High
- **Status:** Inherent to client-side Convex apps
- **Action:** Not fixable per se, but makes C-1/C-2/C-3 fixes urgent. All non-public Convex functions should use auth middleware.

### H-2: Low Entropy Sentence-Based Key Derivation
- **Severity:** High
- **Action required before launch:** User-chosen sentences have ~20-40 bits of entropy vs 128-256 bits for BIP-39 mnemonics. Options:
  1. Generate sentences from a curated wordlist (like BIP-39)
  2. Enforce minimum entropy requirements
  3. Use Argon2id with very high work factors

### M-1: Custom Cryptographic Constructs
- **Severity:** Medium
- **Action required before launch:** Per-wallet cipher rotation, self-modifying rules, and custom substitution-based encryption should be replaced with standard authenticated encryption (AES-256-GCM or ChaCha20-Poly1305).

### M-2: SHA-256 Without Key Stretching
- **Severity:** Medium
- **Action required before launch:** Replace raw SHA-256 fingerprinting with Argon2id (memory: 64MB+, iterations: 3+) or scrypt (N=2^20, r=8, p=1) for key derivation.

### M-3: 6-Digit PIN Weakness
- **Severity:** Medium
- **Action required before launch:** Use 8+ digit PINs or alphanumeric passcodes. Hash with Argon2id + per-user salt for offline brute-force resistance.

---

## Integration Instructions

### Step 1: Apply the waitlist fix
Copy `convex/waitlist.ts` into your project's `convex/` directory, replacing your existing waitlist module. The exported function signatures (`join` and `count`) are unchanged — your frontend should work without modifications.

### Step 2: Clean up test data
1. Copy `convex/cleanupTestEntries.ts` into your `convex/` directory
2. Deploy to Convex (`npx convex deploy` or `npx convex dev`)
3. Open the Convex dashboard → Functions
4. Run `cleanupTestEntries:previewTestEntries` to verify what will be deleted
5. Run `cleanupTestEntries:purgeTestEntries` to delete the test entries
6. Remove `cleanupTestEntries.ts` from your project

### Step 3 (Recommended): Add Cloudflare Turnstile
1. Sign up at [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/)
2. Create a site key and secret key
3. Add `TURNSTILE_SECRET_KEY` to your Convex environment variables
4. Uncomment the Turnstile verification block in `waitlist.ts`
5. Add the Turnstile widget to your frontend form

---

*Audit performed by Viktor AI on 2026-07-09. For questions or follow-up, reach out in Slack.*
