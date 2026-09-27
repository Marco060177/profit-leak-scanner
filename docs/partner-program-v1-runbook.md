# Partner Program v1 operations runbook

Partner attribution belongs permanently to the canonical `Account`, not to a Shopify shop or channel connection. Referral codes are public identifiers, never credentials. Run administrative commands only in a trusted production shell with the production `DATABASE_URL`; never expose them as web routes.

## Partner setup and access

Create an active Partner and retain the returned Partner ID:

```text
npm run partner:register -- "Display Name" REFERRAL_CODE
```

Codes normalize to uppercase and must be 3–64 URL-safe letters, digits, `_`, or `-`. The Partner-facing URL is `https://marginlab.net/r/<URL_ENCODED_CODE>`.

Issue a one-time dashboard invitation:

```text
npm run partner:issue-access -- <PARTNER_ID>
```

The raw invitation is printed once, is not stored, expires, and is single-use. Do not put it in logs or tickets.

## Branded redirect contract

`marginlab.net` is external WordPress infrastructure. Configure exactly one server-side 302 redirect:

```text
SOURCE:      /r/<CODE>
DESTINATION: https://profit-leak-scanner.onrender.com/r/<URL_ENCODED_CODE>
STATUS:      302 Found
QUERY:       discard all query parameters
```

Use the canonical application origin from the current Shopify app configuration when it changes; do not duplicate validation or set cookies in WordPress. Preserve only the single path segment, URL-encode it, reject additional path segments/control characters, and never accept a destination from the request. A temporary 302 avoids permanently caching infrastructure choices. The app route validates the code, preserves an existing first touch, sets signed `HttpOnly; SameSite=Lax; Secure` evidence in production, and redirects to the fixed Shopify App Store listing.

For the standard WordPress **Redirection** plugin, create a URL-only redirect with **Regex** enabled: source `^/r/([A-Za-z0-9_-]{3,64})/?$`, target `https://profit-leak-scanner.onrender.com/r/$1`, HTTP code `302`, and query handling set to ignore/discard. The allowed code alphabet is already URL-safe. Test one active, one nonexistent, and one malformed code in a private browser before publishing the rule. Do not add a reverse app-to-WordPress rule.

## Qualification and rewards

`npm run partner:p3:sync` imports trusted Shopify app-subscription transactions. Two distinct positive successful payments occurring on or after attribution qualify the referral. Replays, pre-attribution payments, zero amounts, and failures do not count.

Rewards are cumulative totals: 1 → $25, 3 → $75, 5 → $150, 10 → $400, 25 → $1,000, 50 → $2,500, 100 → $5,000, and 250 → $10,000. Do not add tier totals together.

## Manual payout workflow

```text
npm run partner:payout:reconcile -- <PARTNER_ID>
npm run partner:payout:list
npm run partner:payout:history -- <PARTNER_ID>
npm run partner:payout:approve -- <PAYOUT_ID>
npm run partner:payout:paid -- <PAYOUT_ID> --reference <EXTERNAL_REFERENCE>
npm run partner:payout:cancel -- <PAYOUT_ID> --note <REASON>
```

Reconciliation calculates missing entitlement; administrators never enter an amount. Approval does not send money. Mark paid only after an external manual payment actually succeeds. A paid payout cannot be cancelled, edited, or deleted. Cancelling an unpaid obligation preserves history and allows reconciliation to recreate the legitimate missing range.

## Safety and diagnosis

Use scoped database reads and command results to check, in order: Partner status/code, referral capture and Account attribution, P3 sync diagnostics, `PartnerReferral` qualification/evidence, `PartnerRewardMilestone`, payout history, and Partner access token/session state. Do not log cookies, raw invitations/sessions, claim tokens, merchant identity, billing payloads, or payment details.

Never manually insert/update/delete referrals, qualification evidence, milestones, payouts, access hashes, or sessions. Never reassign an Account, fabricate billing events, mark qualification manually, edit payout amounts/ranges, or mark paid before payment. Use the services and commands above; investigate errors before retrying destructive work.
