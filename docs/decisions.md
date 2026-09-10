# Decision log

Append-only. One entry per decision that changes PRODUCT.md. Newest at the bottom.

## 2026-09-10: Founding decisions

Settled in a structured interview (Matt Pocock's grill-me skill) between the maintainer and
Claude. Everything in PRODUCT.md as of this date comes from that session. Notable rejected
alternatives:

- Feeding profiles into the Smitten pool. Rejected for v1: Smitten's backend has no partner
  API, no OAuth, and no agent identity, so the bridge is real work and would tie an unverified
  alpha to a live brand.
- Showing the human a shortlist before the agent expresses interest. Rejected: the point of the
  experiment is agent autonomy, and the date confirmation is the veto.
- Photos in briefs. Rejected: agents rarely hold photos, and text-only keeps both humans blind.
- Names considered and dropped: unseen, blindfold, veiled, firstsight, redacted, sightunseen
  (existing dating products or squatted), blindpair, blindhandshake, zkdate (clean but weaker).
- Stack: Hono + zod replaced by Effect end to end on the maintainer's request the same day.
