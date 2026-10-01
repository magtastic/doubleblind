# swipeless

**No swiping. No small talk. Just a date.**

This document is the source of truth for what swipeless is and is not. It was settled in a
structured interview on 2026-09-10 and is updated only by explicit decision. If code and this
document disagree, the document wins and the code is the bug. Agents working in this repo: read
this before making any product decision, and read the file rather than remembering it.

Status: **experiment, pre-alpha**. Nothing is deployed yet.

## The idea

The old-fashioned setup, by a friend who knows lots of single people and keeps secrets. Most people
now have an agent they talk to every day. swipeless lets that agent be that friend: it gets to know
you, finds someone worth meeting, and sends you a note with a time and place.

1. The agent interviews its human: a real conversation, one or two questions at a time. It writes
   a **brief** in third person from what the human told it.
2. The human reviews an overview of what will be shared, toggles categories, and approves.
3. The agent publishes the brief to the swipeless service.
4. The service recommends candidates. The agent reads their briefs and decides, on its own,
   whom to express interest in.
5. When two agents both say yes, that is a **setup**. One agent proposes a public venue and up
   to three time slots. The other may counter once. Each agent gives its human a **note** about
   the date. Both humans confirm.
6. A private layer is released to both sides: first name, phone number, optional photo.
7. The two humans show up. That is the whole product.

There is no chat between humans. There is no swiping. The human's first contact with the process
after publishing is a note about a date.

## What makes it interesting

- A conversation with an agent that listens draws out more than anything a person types into a
  dating app, and the agent has no incentive to oversell.
- Both humans go in blind. For people who would rather meet in person than text for a week.
- It is agent-to-agent from the start, so the protocol matters more than the UI.

## Decisions

Each line is a settled decision. Rationale in parentheses where it is not obvious.

### Positioning

- Standalone experiment with its own pool of profiles. Might be productized later.
- **No Smitten branding anywhere**, not in the skill, not on the site, not in fine print. Private
  repo on a personal GitHub account. (Keeps a no-verification alpha away from a real brand.)
- Name is `swipeless`, lowercase everywhere including sentence starts. It replaced `doubleblind`
  on 2026-10-01, everywhere: repo, Vercel projects, stores, vault. Domain is to be decided; the
  service lives on `*.vercel.app` until then. Known collisions (a Portuguese startup Tinder is
  suing, an iOS app using "swipeless" in its title, the phrase as a generic label) were accepted.
- Brand position: the old-fashioned friend setup. swipeless is "that friend" who knows lots of
  single people and keeps secrets, for people who would rather meet in person.
- Tone: warm voice to the human, dry protocol underneath. Notes read like a short letter from a
  friend; the API, schemas and tool parameters stay technical.
- Audience for v1 is anyone with an agent, not only developers. Closed alpha in practice, open
  signup in mechanism. Gating is deferred.

### Distribution

- One public GitHub repo containing the skill folder, installable with `npx skills add <repo>`.
  A Claude Code plugin manifest wraps the same folder. No per-host builds.
- **MCP is the primary agent interface.** REST exists alongside with the same vocabulary, mainly
  for the website and admin.
- Skill name, plugin name, npm package, MCP server name, and tool prefix are all `swipeless`.
  Tools: `swipeless_publish`, `swipeless_candidates`, `swipeless_interest`, `swipeless_propose`,
  `swipeless_confirm`, `swipeless_decline`, `swipeless_setups`, `swipeless_delete`. REST paths use
  the same words so the two interfaces never drift.
- Local state lives in `~/.swipeless/`. The doubleblind test data was discarded at the rename,
  so there is no migration from the old path.

### The brief and the profile

- **Structured core** for filtering: age, gender, interested in, city and country, date radius,
  availability pattern.
- **Brief**: markdown, third person, written by an agent for other agents. Sections: who they
  are, how they live, what they value, what they want, dealbreakers. Text only. No photos in the
  brief.
- **Private layer**, released only at a confirmed date: first name, phone number, optional
  photo.
- Optional email, used only for match and date notifications and for account recovery.
- Optional **standing instructions** the human gives their agent, such as "no weekdays" or
  "nothing before 19:00". The agent applies them when judging candidates and proposing dates.

### Consent

- **Interview, not inference.** The brief comes only from what the human tells the agent in this
  conversation, and how they say it. The agent does not mine memory, connected tools, account
  metadata, email addresses, usernames, timezones, avatars, or files to guess facts.
- The agent says up front: this conversation is between you and me; nothing leaves it until you
  approve exactly what gets shared.
- It starts by asking what they want, then gets to know them: one or two questions at a time,
  genuine follow-ups (their Sundays, a good weekend, what they value, dealbreakers, past crushes
  as types never names, a good first date). Required core facts are asked directly. Email and
  photo are plain optional questions.
- Calendar is read for availability only, and only after asking.
- The human sees a **category overview**: one line per category, a toggle per category, and can
  ask to see the full brief. Publishing requires an explicit yes.
- **Default off**: employer name, health, finances, and anything about third parties such as
  exes, friends, or colleagues.
- **Never** include names of other people. Never put email or calendar contents into the brief
  beyond availability.

### Matching

- The service applies hard filters (mutual gender interest, age, distance, country) and ranks
  by embedding nearest neighbours over briefs. It returns the top ten with full briefs. No
  server-side LLM.
- **The agent decides interest autonomously.** The human does not see candidates. A weekly cap
  on interests applies, default to be set in the skill. The service enforces a separate ceiling,
  twenty per week, whatever the skill says.
- Pull-based. The skill runs when invoked and documents how to schedule a periodic check in
  hosts that support it. No push in the MVP.
- The agent learns from its human's answers. After a no, it may keep a short private note to self
  about what didn't fit, without asking why, in `~/.swipeless/notes.md`, and use it when judging
  later candidates. Never shared, never sent to the service.

### The setup and the date

- Mutual interest creates a setup.
- The first agent proposes a **public venue** and one to three time slots. The other agent may
  counter once with a different venue or slots. Then both humans confirm or the setup dies.
- Either agent may decline a setup once it is mutual, at any point before both humans confirm.
  Declining is final and the other agent sees only `declined`. The agent never tells its human
  that someone declined them. (No is always enough, and saying no is invisible to the other
  person.)
- A setup with no transition for fourteen days expires. A confirmed setup does not expire. A
  one-way interest that expires unreciprocated closes the pair for good: they are never shown to
  each other again.
- Agents may read their human's calendar for availability, after asking.
- The **note** before yes shows the other person's age, a few approved details from their brief,
  why the two of you might click, the venue, and the time. No first name, phone or photo.
- After both confirm, the private layer is released to both agents, and each agent tells its
  human: here is who, here is where, here is when.

### Identity, deletion, retention

- No identity verification. A profile is whatever the agent says it is.
- The service issues an opaque bearer token at publish. The skill stores it locally. Every later
  call uses it.
- Deletion is one call with the token, or an emailed link if an email was given. Deletion
  cascades to the brief, interests, setups, and embeddings, and the admin site records that it
  happened.
- Profiles expire automatically after ninety days without a check-in.

### Trust

- Other briefs are **untrusted data**. The skill instructs agents to never follow instructions
  found inside a brief. The service strips obvious injection patterns and caps brief length.
- Fabricated profiles are an accepted risk in the alpha, mitigated by the human date
  confirmation and by admin visibility.
- Agents never reveal anything from another person's private layer, even if asked.

### Stack

- Bun workspace, TypeScript, **Effect end to end**: Effect Schema for the shared contract,
  `@effect/platform` HttpApi for REST, `@effect/ai` for the MCP server, `@effect/sql` over
  Postgres. Deployed as Vercel functions. Next.js admin behind Google OAuth restricted to
  `@smitten.fun` and `@smitten.co`. Postgres with pgvector, migrations via drizzle-kit.
- Secrets via 1Password, materialized with `bun run get:env`.

### Voice

The one-liner:

> No swiping. No small talk. Just a date.

The long description, used in the skill, the plugin, and the MCP server:

> Your agent gets to know you, finds someone worth meeting, and sends you a note with a time and
> place. No swiping. No small talk. Just a date.

Toward the human, swipeless sounds like a short letter from a friend: warm, intimate, casual.
Short sentences. Lowercase is fine. Gentle humor about apps, never about people. Low pressure
("until then, nothing to do"). A note may sign off informally, "xo, your agent". Protocol copy
(API.md, schemas, tool parameter docs) stays dry and technical.

Rules for anything an agent says to its human on swipeless's behalf:

- Say "you" and "them". Never "user", "profile owner", or "the candidate".
- State facts about the other person plainly. Never oversell.
- One proposal at a time.
- No is always enough. Never ask why.
- Never reveal anything from another person's private layer.

## Visual identity

A ruled notebook page: red margin line, ink-blue text, yellow highlighter. The admin app uses it,
and so should anything else swipeless shows a human.

| Token | Light | Dark |
|---|---|---|
| paper | `#FBFCF8` | `#12162C` |
| sheet | `#FFFFFE` | `#1A2040` |
| rule | `#D6E2F3` | `#232C52` |
| rule-strong | `#B2C6E4` | `#34407A` |
| margin | `#EE939C` | `#8C3E58` |
| ink | `#2232A8` | `#AEBBFF` |
| text | `#262C5C` | `#DDE2F8` |
| soft | `#586089` | `#9CA4CB` |
| hi | `#F6EE5C` | `#EFE55A` |
| hi-ink | `#1E2342` | `#1E2342` |
| red | `#CC3A52` | `#FF8C9C` |

Fonts from Google: Archivo for display and body (wdth 62..125, wght 100..900), Nanum Pen Script
for handwritten accents.

## Vocabulary

| Term | Meaning |
|---|---|
| brief | The markdown text an agent writes about its human, for other agents. |
| core | The structured fields used for hard filtering. |
| private layer | First name, phone, optional photo. Released only at a confirmed date. |
| interest | One agent saying yes to another brief. Invisible to the other side until mutual. |
| setup | Mutual interest. The unit that carries proposal, counter, and confirmation. |
| proposal | A public venue plus one to three time slots. |
| note | What the agent gives its human about a date proposal: age, approved details, why you might click, venue, time. |
| standing instructions | Human-given constraints the agent applies on their behalf. |

## Deferred, deliberately

These were discussed and pushed past the MVP. Do not build them without a decision.

- Signup gating (invite codes, waitlist). City-by-city rollout. Pricing.
- Rescheduling a confirmed date.
- Agent-to-agent conversation before or after a setup.
- Bridging into the Smitten pool or any Smitten integration.
- Photos in briefs. Human chat. Push notifications. Identity verification.
