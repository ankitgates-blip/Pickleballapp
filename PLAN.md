# Pickleball Tournament App — Master Plan (Dubai: Pickle Turf & Picklers)

Status: **Phase 1 reviewed & locked (2026-07-05) — nothing built yet.** Open questions answered, tech stack confirmed, full Phase 1 scope approved for Pickle Turf pilot. Next: scope Increment 1.1 in detail. Edit freely, this is still your working document.

---

## 0. Vision

A personalized, fully-brandable tournament platform for the Dubai pickleball scene, starting at **Pickle Turf** and **Picklers**, with two distinct experiences:

- **Organizer App/Dashboard** — run tournaments end-to-end (roster → format selection → brackets → live scoring → analytics).
- **Player App** — discover, register, check in, track live scores/schedule, see rating, history, and deep personal stats.

Design principle: build the **best-of-breed features from DUPR, PickleballBrackets, Pickleball Den, Playtomic, Score Pickleball/PKLGO**, plus your own additions (roster-based quick setup, format feasibility guidance, auto team shuffle, and deep player analytics) — but make every venue, format, and rule fully configurable rather than hardcoded, since you control both the venues and the software.

### Open questions — RESOLVED (2026-07-05)
- [x] **Branding**: one shared app with a venue selector inside it (not two separate branded instances). Simpler build, still shows the right venue's logo/colors once selected.
- [x] **Team**: solo build. Timeline in §8 assumes part-time, one-person pace.
- [x] **Budget**: near-zero. Stay on free tiers as long as possible (Supabase free tier, Expo free tier, WhatsApp Cloud API free conversation allowance); only unavoidable cost is per-transaction payment gateway fees.
- [x] **Pilot scope**: launch Increment 1.1 at **Pickle Turf** first, prove it out, then roll to Picklers.
- [x] **DUPR sync**: read-only lookup only for Phase 3.1 — display a player's existing DUPR rating, no write-back. Avoids the DUPR partner-approval dependency entirely (see updated §5).

---

## 1. Build Philosophy — Strict Rule: Incremental, Not Big-Bang

**This governs everything below.** We do not build the whole app in one pass. The sequence for every feature, every phase, is:

```
Build smallest usable slice → Deploy it live/usable → You test it with real use →
You give feedback → Fix/adjust → THEN start the next feature
```

Concretely:
- Each phase in §3 is itself broken into **increments** (e.g. Phase 1.1, 1.2, 1.3) — small enough to build, ship, and get your feedback on individually. We do not queue up five features and dump them on you at once.
- Nothing moves to the "next increment" until the current one is confirmed working by you (ideally tested at or against a real tournament, not just in isolation).
- The app must be **live and usable after Phase 1.1** — a real, working (if minimal) tool, not a demo. Every increment after that adds to something already running, never a rewrite.
- This means the architecture (§4) has to support bolting features on without breaking what's already shipped — that constraint is designed in now, not discovered later.

This is a standing instruction for how we work together on this build — it applies to every future phase, not just the MVP.

---

## 2. Customization Framework (the "fully customizable" pillar)

This is the differentiator vs. off-the-shelf tools — it needs to be designed in from day one, not bolted on later.

| Layer | What's configurable |
|---|---|
| **Branding** | Per-venue logo, colors, name, splash screen — Pickle Turf and Picklers can look distinct even on shared backend |
| **Tournament rules** | Scoring format (to 11/15/21, win-by-1/2), match format (single/double elim, round robin, pool play, MLP), court count, division structure |
| **Registration forms** | Organizer-defined custom fields (e.g. shirt size, emergency contact, T-shirt sponsor question) |
| **Notifications** | Editable message templates per venue/event ("You're on Court 3 now" can be reworded, translated) |
| **Feature flags** | Toggle modules per event: payments on/off, waiver required or not, referee mode, rating sync, livestream overlay — this doubles as the incremental-rollout mechanism from §1: new features ship dark behind a flag and get switched on only once you've approved them |
| **Roles & permissions** | Organizer / co-director / court monitor / referee / player — configurable per venue |

*(Language: English only — Arabic support considered and explicitly dropped, 2026-07-05.)*

Architecturally this means: a **settings/config table per venue and per tournament** that the app reads at runtime, not hardcoded conditionals scattered through the code.

---

## 3. Feature Rollout — Phase & Increment by Increment

Mapped from the full competitor feature list plus your own additions (roster/shuffle/analytics/DUPR) to a build sequence. Per §1, each phase below is a sequence of shippable increments, not one big drop — build → ship → your feedback → next increment.

### **Phase 1 — MVP: Run One Real Tournament**
Goal: replace spreadsheets/WhatsApp chaos for a single event at one venue.

| # | Increment | Ships |
|---|---|---|
| 1.1 | **Bare tournament core** | Tournament creation, quick player roster (type/paste in all player names directly — no self-registration needed for casual play), one bracket format (round robin or single elim, auto-generated), manual score entry, view bracket/schedule. This alone is a usable replacement for a spreadsheet — **first live/usable milestone.** |
| 1.2 | **Format & team intelligence** | Smart format recommender (given player count, court count, time available → suggests round robin vs. elimination vs. pool play), auto team shuffle (auto-generate balanced doubles pairs/teams from the roster) |
| 1.3 | **Registration hardening** | Online self-registration form, custom fields, waitlist, capacity limits |
| 1.4 | **Money & paperwork** | Payment collection (see §5 for gateway), digital waiver e-signature |
| 1.5 | **Player-side polish** | Player profile, browse/register from the app, push notifications (registered, check-in reminder, "you're on Court X") |
| 1.6 | **Branding** | Venue theming for Pickle Turf vs. Picklers |
| 1.7 | **Organizer dashboard basics** | Check-in %, matches remaining, courts in play |

> Exit criteria for Phase 1 overall: you've run a real tournament end-to-end on this and retired the spreadsheet. Each increment above gets its own smaller "did this work?" checkpoint before the next starts.

---

### **Phase 2 — Tournament-Day Ops Polish**
Goal: reduce manual work at the desk during live events. (Only starts once Phase 1 is validated at a real event.)

| # | Increment | Ships |
|---|---|---|
| 2.1 | Auto court assignment as matches finish |
| 2.2 | Referee mode (dedicated scoring view, role-gated in the same app) |
| 2.3 | Double elimination + Gold/Silver/Bronze consolation brackets |
| 2.4 | Offline-capable score entry (sync-on-reconnect) |
| 2.5 | Multi-admin roles (co-director, volunteer, court monitor) |
| 2.6 | Public shareable live-bracket link (no login, for spectators) |
| 2.7 | WhatsApp notifications alongside push (see §5 — higher engagement in UAE) |

---

### **Phase 3 — Rating, Identity & Analytics**
Goal: give players a reason to keep coming back beyond a single event, and turn every match played into data.

| # | Increment | Ships |
|---|---|---|
| 3.1 | DUPR read-only rating lookup — display each player's existing DUPR rating on their profile; no write-back, no partner approval needed (resolved decision, see §5) |
| 3.2 | Rich player profile — photo, nickname, jersey/player number, playing style & specialty tags (e.g. "lefty", "net specialist", "power player") |
| 3.3 | All-time match history & win/loss record |
| 3.4 | Consolidated stats dashboard — weekly / monthly / yearly views: tournaments won, games won/lost |
| 3.5 | Toughest opponent analysis — head-to-head win-rate breakdown per opponent, based on match scores |
| 3.6 | Best partner analysis — which doubles partner has your highest win rate |
| 3.7 | Player discovery (find players at your venues by rating/availability) |
| 3.8 | Post-match self-report for casual/non-tournament play |

---

### **Phase 4 — Community & Recurring Play**
Goal: become the default way your local scene organizes play, not just tournaments.

| # | Increment | Ships |
|---|---|---|
| 4.1 | Open-play/pickup session scheduler (post a session, others join) |
| 4.2 | Recurring league support (multi-week season, standings) |
| 4.3 | In-app chat (1:1 + group), local announcements feed |
| 4.4 | Court booking/reservation tie-in with venue availability |
| 4.5 | Social feed (results, photos, likes) |

---

### **Phase 5 — Scale & Monetization (stretch)**
Only pursue if Phases 1–4 prove out and you want to expand beyond two venues.

| # | Increment | Ships |
|---|---|---|
| 5.1 | Livestream scoreboard overlay |
| 5.2 | Sponsor placement / local discount marketplace |
| 5.3 | White-label the platform for other Dubai/UAE clubs (multi-tenant) |
| 5.4 | MLP-style Team-of-4 format, Dreambreaker logic |
| 5.5 | Advanced TD analytics/export |

---

## 4. Architecture — Designed for Incremental Delivery *(reviewed & confirmed, 2026-07-05)*

The two-sided shape:

```
                    ┌─────────────────────┐
                    │   Shared Backend      │
                    │  (API + DB + Auth)    │
                    └──────────┬───────────┘
             ┌──────────────────┼──────────────────┐
   ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
   │  Player Mobile App │  │ Organizer Web │  │ Referee/Court    │
   │  (iOS + Android)   │  │  Dashboard    │  │ Mode (in player  │
   │                    │  │  (desktop-    │  │ app, role-gated) │
   │                    │  │  first)       │  │                  │
   └──────────────────┘  └──────────────┘  └──────────────────┘
```

- **Player app**: mobile-first (React Native/Expo) — used on-court. **One shared app** for both venues, with a venue selector/switcher inside it (not two separately-branded app installs) — resolved decision, see §0.
- **Organizer dashboard**: web-first (desktop, since a TD runs an event from a laptop at the desk) — must also work on tablet.
- **Referee mode**: same mobile app, different role/view — no separate app.

**Principles that make "ship one increment at a time" actually work, not just a nice idea:**

1. **Modular monolith, not microservices.** One deployable backend, but internally split into clear modules (registration, brackets, scoring, notifications, payments, ratings, **analytics**). Small team, no need for the ops overhead of separate services — but module boundaries mean increment N+1 doesn't require touching increment N's code.
2. **Additive-only database migrations.** New tables/columns are nullable/optional by default. We never do a breaking schema change that requires rewriting a feature that's already live and in use.
3. **Feature flags as the release mechanism.** Every new increment ships behind a flag, off by default in production, switched on per-venue/per-tournament once you've approved it in a test/staging environment. This gives instant rollback (flip the flag off) without a redeploy.
4. **Versioned/stable API contracts.** New endpoints get added for new features; existing endpoints already used by a shipped increment don't change shape underneath it.
5. **CI/CD from Increment 1.1, not deferred.** Because we're shipping small slices frequently, automated tests + a staging/preview environment need to exist from the very first increment — this is pulled forward from where it'd normally sit in a bigger build, specifically to support this workflow.
6. **Each increment = one small branch/PR, tested and reviewed before merge**, with a staging deploy you can try before it goes live for real players.
7. **Analytics as pre-aggregated rollups, not live computation.** Weekly/monthly/yearly stats, toughest-opponent, and best-partner views (Phase 3) are computed by a scheduled background job into summary tables, not recalculated from raw match history on every screen load — keeps the app fast as match history grows.

---

## 5. Tech Stack (recommended, with Dubai-specific calls-out)

| Layer | Choice | Why |
|---|---|---|
| Mobile app | **React Native + Expo** | One codebase for iOS/Android, fast iteration, OTA updates without app-store resubmission for minor changes — important given we're shipping small increments often |
| Organizer dashboard | **Next.js** (React) | Shares component/logic patterns with mobile, deploys cleanly to Vercel |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage) | Realtime subscriptions are perfect for live scores/brackets; row-level security gives per-venue/per-role data isolation for free; fastest path for a solo/small team; can self-host later if you outgrow it |
| Auth | **Phone OTP** (via Supabase Auth) | Phone-first is the norm in UAE/Middle East — email/password would be friction |
| Payments | **Ziina, Telr, PayTabs, or Network International** (not Stripe) | Stripe does not support UAE-registered merchant accounts directly — you need a gateway that settles in AED and supports UAE cards. Ziina is UAE-native and popular for casual/P2P-style collection; PayTabs/Telr/NI are more traditional merchant gateways if you need invoicing/refund tooling |
| Notifications | **WhatsApp Business API (Meta Cloud API or Twilio)** + push (Expo/FCM) | WhatsApp has far higher engagement in the UAE than SMS or even push — treat it as a first-class channel, not an afterthought |
| Hosting | **Vercel** (dashboard) + **Supabase** (data/backend) + **Expo EAS** (mobile builds/app-store submission) | Minimal ops overhead for a small team; supports frequent small deploys cleanly |

**Resolved — DUPR integration (Phase 3.1):** DUPR does not offer a fully open, self-serve write API for arbitrary third-party apps — two-way sync would require becoming an approved DUPR club/software partner, an external approval process outside your timeline's control. Decision: start with **read-only DUPR rating lookup** (pull and display a player's existing public DUPR rating) — no write-back, no partner approval needed. Revisit two-way sync later only if it proves worth pursuing partner status. Your own win/loss/head-to-head analytics (§3.4–3.6) don't depend on DUPR at all — they're computed from your own match data regardless of this decision.

*Alternative if you want more backend control later: swap Supabase for a custom Node/TypeScript API + managed Postgres — noted as a fallback, not the starting recommendation.*

---

## 6. Data Model (high-level entities) *(reviewed & confirmed, 2026-07-05 — including roster-claiming behavior)*

```
Venue (Pickle Turf, Picklers, ...)
  └─ Tournament (belongs to a venue, has format config, branding override)
       └─ Division (skill level / age group)
            └─ Registration (player or team, payment status, waiver status)
                 └─ Match (bracket position, court, score, status)
Player (profile: name, phone, photo, nickname, jersey number, playing style/specialty tags, rating, role)
Team/Partnership (pair of players, used for doubles + team-shuffle output)
Court (belongs to venue, status: open/in-use)
Payment (linked to registration, gateway ref)
Rating (player, sport-mode singles/doubles, history log, source: dupr/in-house)
PlayerStatsRollup (player, period: week/month/year, tournaments won, games won/lost — precomputed, see §4.7)
OpponentStats (player, opponent, head-to-head win/loss — precomputed)
PartnerStats (player, partner, win rate together — precomputed)
Notification (template, channel: push/whatsapp, trigger event)
```

Key design calls:
- **Venue and Tournament config are separate rows the app reads at runtime** — this is what makes "fully customizable" real instead of aspirational.
- **Role is per-(user, venue)**, not global — someone can be a player at Picklers and a court monitor at Pickle Turf.
- **Roster entries can exist without a full user account** (name-only, added by an organizer) and get "claimed" by a real player profile later — this is what makes the quick-roster/auto-shuffle flow (1.1/1.2) work for casual play where not everyone has signed up yet.
- Every table designed from increment 1.1 onward assumes future columns get added, not existing ones repurposed — see §4's additive-migration rule.

---

## 7. Non-Functional Notes (light-touch for this scale, revisit before Phase 2 build)

- **Payments**: never store card data yourself — gateway handles PCI scope entirely.
- **Personal data**: UAE PDPL (Federal Decree-Law No. 45 of 2021) applies — you'll need a basic privacy policy, consent at signup, and a way to delete a player's data on request. Photos/nicknames/playing-style tags (Phase 3.2) count as personal data too. Lightweight at this scale, but not skippable once you're collecting phone numbers/payment info/photos from real people.
- **Abuse cases to design against early**: fake/duplicate registrations flooding a division, payment webhook replay, a player editing someone else's match score (must be role/ID-checked server-side), rating manipulation via friendly "fixed" matches, someone claiming a roster-only entry that isn't theirs.
- **External dependency risk**: DUPR partner-access approval (§5) is outside your control and timeline — don't block Phase 3 entirely on it; ship the in-house fallback first if approval is slow.
- These get a full pass (security/abuse-case review) before each increment that touches money, auth, or user data ships to real users — flagged here so it's not forgotten.

---

## 8. Rough Timeline (assumes solo/small-team, part-time pace — adjust once team size is known)

Timelines are per-phase totals across their increments; actual pace depends on how much feedback/iteration each increment needs before you sign off on it.

| Phase | Estimate |
|---|---|
| Phase 1 (MVP, 7 increments) | 5–7 weeks |
| Phase 2 (Ops polish, 7 increments) | 2–3 weeks |
| Phase 3 (Rating/identity/analytics, 8 increments) | 4–5 weeks |
| Phase 4 (Community, 5 increments) | 4–6 weeks |
| Phase 5 (Scale) | Open-ended, only if 1–4 validate |

---

## 9. Feature Selection Checklist — Pick Your V1

Every feature discussed so far, in one place. Fill in the **Decision** column with `V1` (build now), `Later` (yes, but not yet), or `Skip` (not wanted). Items marked **(new)** came from your latest additions.

**Phase 1 is reviewed and locked** — you confirmed building the full scope as laid out (2026-07-05), so all Phase 1 rows below are marked `V1`. Phases 2–5 are intentionally left blank — those decisions come later, once Phase 1 is live and validated, per the incremental-delivery rule in §1.

### Phase 1 — MVP: Run One Real Tournament (locked, all `V1`)

| # | Feature | What it does | Side | Decision |
|---|---|---|---|---|
| 1 | Tournament creation | Name, venue, dates, divisions, skill levels | Organizer | V1 |
| 2 | Quick player roster **(new)** | Type/paste in all player names directly — no self-registration required | Organizer | V1 |
| 3 | Smart format recommender **(new)** | Given player count, courts, time available — suggests round robin / elimination / pool play | Organizer | V1 |
| 4 | Auto team shuffle **(new)** | Auto-generates balanced doubles pairs/teams from the roster | Organizer | V1 |
| 5 | Auto-generated bracket | Round robin or single elimination, auto-built | Organizer | V1 |
| 6 | Manual seed override | TD can hand-adjust seeding | Organizer | V1 |
| 7 | Manual score entry | Organizer/desk enters match results | Organizer | V1 |
| 8 | View live bracket & schedule | Players see their matches/standings update | Player | V1 |
| 9 | Online self-registration form | Players sign themselves up | Player | V1 |
| 10 | Custom registration fields | Organizer-defined questions at signup | Organizer | V1 |
| 11 | Waitlist | Auto-promote when a slot opens | Both | V1 |
| 12 | Capacity limits per division | Caps registrations per division | Organizer | V1 |
| 13 | Payment collection | Registration fee via gateway | Both | V1 |
| 14 | Digital waiver e-signature | Sign waiver at registration | Player | V1 |
| 15 | Player profile (basic) | Name, phone, self-rated skill level | Player | V1 |
| 16 | Browse & register in-app | Find and join upcoming tournaments | Player | V1 |
| 17 | Push notifications | Registered / check-in reminder / court assignment | Player | V1 |
| 18 | Venue branding/theming | Pickle Turf styling first; venue selector scaffolded for Picklers later | Both | V1 |
| 19 | Organizer dashboard basics | Check-in %, matches remaining, courts in play | Organizer | V1 |

### Phase 2 — Tournament-Day Ops Polish

| # | Feature | What it does | Side | Decision |
|---|---|---|---|---|
| 20 | Auto court assignment | Assigns next court automatically as matches finish | Organizer | |
| 21 | Referee mode | Dedicated live-scoring view for referees/court monitors | Referee | |
| 22 | Double elimination + consolation brackets | Gold/Silver/Bronze matchups | Organizer | |
| 23 | Offline-capable score entry | Works without signal, syncs later | Organizer | |
| 24 | Multi-admin roles | Co-director, volunteer, court monitor permissions | Organizer | |
| 25 | Public shareable live-bracket link | No-login spectator view | Spectator | |
| 26 | WhatsApp notifications | Higher-engagement channel alongside push | Player | |

### Phase 3 — Rating, Identity & Analytics

| # | Feature | What it does | Side | Decision |
|---|---|---|---|---|
| 27 | DUPR sync **(your ask)** | Two-way rating sync with DUPR — needs partner-access validation, see §5 risk note | Player | |
| 28 | In-house rating (fallback) | Elo/Glicko-style rating if DUPR sync isn't feasible yet | Player | |
| 29 | Rich player profile **(new)** | Photo, nickname, jersey/player number | Player | |
| 30 | Playing style & specialty tags **(new)** | e.g. "lefty", "net specialist", "power player" | Player | |
| 31 | All-time match history | Full win/loss record, all matches played | Player | |
| 32 | Consolidated stats dashboard **(new)** | Weekly/monthly/yearly view: tournaments won, games won/lost | Player | |
| 33 | Toughest opponent analysis **(new)** | Head-to-head win-rate breakdown per opponent, from scores | Player | |
| 34 | Best partner analysis **(new)** | Doubles partner with your highest win rate | Player | |
| 35 | Player discovery | Find other players at your venues by rating/availability | Player | |
| 36 | Post-match self-report | Log casual/non-tournament match results | Player | |

### Phase 4 — Community & Recurring Play

| # | Feature | What it does | Side | Decision |
|---|---|---|---|---|
| 37 | Open-play/pickup scheduler | Post a session, others join, no group code | Player | |
| 38 | Recurring league support | Multi-week season with running standings | Both | |
| 39 | In-app chat | 1:1 and group messaging, announcements feed | Player | |
| 40 | Court booking/reservation tie-in | Ties into venue court availability | Player | |
| 41 | Social feed | Results, photos, likes | Player | |

### Phase 5 — Scale & Monetization (stretch)

| # | Feature | What it does | Side | Decision |
|---|---|---|---|---|
| 42 | Livestream scoreboard overlay | For streamed finals | Spectator | |
| 43 | Sponsor placement / discount marketplace | Local business partnerships | Organizer | |
| 44 | White-label multi-tenant | Platform reusable by other Dubai/UAE clubs | Business | |
| 45 | MLP-style Team-of-4 format | Plus Dreambreaker logic | Organizer | |
| 46 | Advanced TD analytics/export | Revenue/attendance trend reports | Organizer | |

### Customization pillars (cross-cutting, not phase-bound)

| Feature | What it does | Decision |
|---|---|---|
| Per-venue branding | Logo/colors/name per venue | |
| Configurable tournament rules | Scoring/format/court-count per event | |
| Custom registration fields | Organizer-defined signup questions | |
| Editable notification templates | Reword/translate system messages | |
| Feature flags per venue/event | Toggle modules on/off | |
| Roles & permissions per venue | Organizer/co-director/monitor/referee/player | |
| ~~English + Arabic language toggle~~ | Dropped — English only | Skip |

---

## 10. Next Step

Once §9 is filled in (and §0's open questions are answered), we scope **Increment 1.1** into a concrete implementation plan — screens, API endpoints, DB schema DDL — before writing any code. Nothing past 1.1 gets built until 1.1 is live and you've used it.
