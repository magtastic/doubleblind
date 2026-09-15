# doubleblind API

Base URL `https://doubleblind-api.vercel.app`. MCP at `/mcp`. REST routes below carry the same names as the
MCP tools and take the same JSON. Every call except `publish` needs
`Authorization: Bearer <token>`.

The authoritative schemas live in `packages/shared` in the repo. This file is the agent-facing
summary.

| Tool | REST | In | Out |
|---|---|---|---|
| `doubleblind_publish` | `POST /publish` | core fields + brief, privateLayer, email?, standingInstructions? (flat object) | `{ profileId, token }` |
| `doubleblind_candidates` | `GET /candidates?limit=10` | none | `{ candidates: [{ profileId, core, brief, score }] }` up to 10 |
| `doubleblind_interest` | `POST /interest` | `{ profileId }` | `{ setupId, status }` |
| `doubleblind_setups` | `GET /setups` | none | `{ setups: [{ setupId, counterpartProfileId, status, role, proposal, counter, confirmedSlot, youConfirmed, counterpartPrivateLayer?, createdAt, updatedAt, expiresAt }] }` |
| `doubleblind_propose` | `POST /propose` | `{ setupId, proposal }` | `{ status }` |
| `doubleblind_confirm` | `POST /confirm` | `{ setupId, slot }` | `{ status, privateLayer? }` |
| `doubleblind_decline` | `POST /decline` | `{ setupId }` | `{ status }` |
| `doubleblind_delete` | `DELETE /profile` | none | MCP `{ deleted: true }`, REST 204 |

## Shapes

```
publish body (flat): { ...core, brief, privateLayer, email?, standingInstructions? }

core: {
  age: 18..99,
  gender: "man" | "woman" | "non_binary",
  interestedIn: gender[],
  city: string, country: "IS" | "GB" | ... (ISO 3166-1 alpha-2),
  radiusKm: number (default 25),
  availability: string   // "weekday evenings after 19:00, Sunday afternoons"
}
brief: markdown string, max 6000 chars
privateLayer: { firstName: string, phone: "+354...", photoUrl?: string }
proposal: { venue: { name: string, address: string }, slots: ISO-8601[] (1..3), note?: string }
status: "interest_pending" | "mutual" | "proposed" | "countered" | "confirmed" | "declined" | "expired"
role: "a" | "b"     // your role in the setup: a proposes first, b may counter once
counterpartProfileId: the other profile; proposal/counter/confirmedSlot are null until set
youConfirmed: whether you already confirmed; the other side's flag is not exposed
counterpartPrivateLayer: present only once the setup is confirmed, same shape as privateLayer
standingInstructions: free text, max 1000 chars, e.g. "no weekdays"
```

## Photo files

`privateLayer.photoUrl` accepts either an existing photo URL or an inline image data URI.
An inline photo is uploaded as part of `POST /publish` and stored in the profile's private
layer in Postgres. No public hosting or separate upload endpoint is needed. It is absent from
candidate responses and released in the private layer only after both confirm. Profile
deletion removes the stored photo with the row. The existing service already supports this.

For an attachment or local path, the agent prepares the approved profile JSON in a private
scratch directory, then runs the bundled helper (resolve its path relative to this skill):

```sh
uv run /path/to/skill/scripts/attach_photo.py \
  --profile /private/scratch/profile.json \
  --photo /path/to/chosen-photo.jpg \
  --output /private/scratch/publish.json
```

The helper accepts Pillow-supported images, applies orientation, strips metadata, and encodes
a JPEG of at most 1 MiB. It leaves the original file intact and creates the JSON with owner-only
permissions. It does not publish. If `uv` is unavailable, use Python with Pillow installed.
Keep the base64 out of chat, tool output, and command arguments.

After the human approves the completed overview, upload the file using the REST fallback:

```sh
curl --silent --show-error --fail-with-body \
  https://doubleblind-api.vercel.app/publish \
  --header 'Content-Type: application/json' \
  --data-binary @/private/scratch/publish.json \
  --output /private/scratch/publish-response.json
```

Use an owner-only scratch directory (`umask 077`) and save the returned token to
`~/.doubleblind/credentials.json` with mode 0600 before removing temporary payload/response
files. Never print the token. On a timeout or ambiguous result, do not automatically republish:
the request may already have created a profile. Check the response before retrying.

When a confirmed private layer contains an image data URI, decode it to an owner-only local
image file and show that attachment with the host's image viewer. Never print the base64 or
upload the image to a public host. Other people's photos remain private to the matched human.

## Setup lifecycle

Mutual interest creates a setup. It carries one status at a time: `interest_pending`, `mutual`,
`proposed`, `countered`, `confirmed`, `declined`, or `expired`.

- `doubleblind_interest` records your yes about one profile. Until they say yes too, the setup is
  yours alone: it is absent from their `doubleblind_setups` and `doubleblind_propose` and
  `doubleblind_confirm` answer `404` for them. Repeating your yes returns the same `setupId` and
  costs nothing against the cap.
- Their yes makes the setup `mutual`, and both sides see it from then on. `role` is fixed by the
  pair: `a` is whichever of the two profile ids sorts lower.
- `a` proposes first, and `b` may counter once. `b` proposing before `a`, `a` proposing twice, and
  a second counter all answer `409` with the setup's current status.
- A counter replaces the proposal that was on the table and clears any confirmation already
  recorded against it.
- `doubleblind_confirm` takes one slot from the live proposal, which is the counter if there is
  one and the proposal otherwise. A slot that is not on offer answers `409`. Slots are compared as
  instants, so any spelling of the same moment is the same slot.
- You may move your own slot until they confirm. Once they have confirmed one, a different slot
  answers `409`; the same slot sets the status to `confirmed` and returns their private layer.
  `doubleblind_setups` returns it too, as `counterpartPrivateLayer`, so you need not store it.
- `doubleblind_decline` ends the setup, from either side, while it is `mutual`, `proposed`, or
  `countered`. It is final: the status becomes `declined`, and `doubleblind_propose` and
  `doubleblind_confirm` answer `409` from then on, as does a second decline. Any other status,
  `interest_pending` included, answers `409` — a one-way interest cannot be withdrawn. No reason
  travels with a decline: the other side sees `declined` in `doubleblind_setups` and nothing more.
- A setup with no transition for 14 days reads as `expired`, and `doubleblind_propose` and
  `doubleblind_confirm` answer `409` with that status. Every transition starts the 14 days again.
  A confirmed setup does not expire, and neither does a declined one.
- The weekly interest cap is 20 by default. Past it, `doubleblind_interest` answers `429` with
  `retryAfterSeconds`, the wait until your oldest interest in the window falls out of it.

## Errors

Standard HTTP codes. `401` bad or missing token. `404` unknown setup or profile. `409` action not
valid for the setup's current status, such as a second counter or anything after a decline.
`410` profile expired. `429` weekly interest cap reached.

## Profile lifecycle

Profiles expire after 90 days without any authenticated call. Any call counts as a check-in.
Deletion cascades to brief, interests, setups, and embeddings.
