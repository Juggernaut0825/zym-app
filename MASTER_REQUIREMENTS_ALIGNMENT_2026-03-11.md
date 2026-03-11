# ZYM Master Requirements Alignment (Web + iOS + Backend)

Date: 2026-03-11 (America/New_York)
Owner: Product/Engineering

This document is the source-of-truth checklist for the user requirements shared in chat.
Every release should be validated against this file.

## 1) Product Vision

- Community-based social + coaching app.
- Two coach personas: `zj` (encouraging) and `lc` (strict), selectable and switchable.
- Chat-first UX with DM + group chat, with `@coach` trigger behavior in groups.
- Full media workflow (image/video incl. HEIC/HEIF), plus AI analysis and coaching.
- Strong agent safety:
  - strict schema tool calls
  - bounded tool permissions
  - anti prompt-ingestion controls
  - vector KB grounding + anti-hallucination measures

## 2) Requirement Matrix (Current)

Legend: `Done` / `Partial` / `Missing`

1. Login/auth + session lifecycle (web + iOS + backend): `Done`
2. Coach selection (`zj`/`lc`) at onboarding + switch later: `Done`
3. Persona via soul files (`zj.soul.md`, `lc.soul.md`): `Done`
4. Chat-first app with DM + group channels: `Done`
5. Group `@coach` mention-only reply behavior: `Done`
6. Message send/receive via websocket and HTTP fallback: `Done`
7. Chat media upload/send (image/video/file style) web + iOS: `Done`
8. HEIC/HEIF compatibility in media pipeline: `Done`
9. Food photo calorie/macro analysis: `Done`
10. Video form analysis: `Done`
11. Profile creation and goal-based plan generation: `Done/Partial`
12. Long-lived profile JSON + expiring media storage/cleanup: `Done/Partial`
13. Vector KB grounding in coach conversations: `Done/Partial`
14. Anti-hallucination strict grounding fallback: `Done`
15. Anti-ingestion/agent boundary hardening: `Done/Partial`
16. Friends/add friend + group creation/member management: `Done`
17. Feed post/reaction/comment flow: `Done`
18. Profile page (avatar/info/memo style fields): `Done`
19. Apple Health integration + leaderboard: `Done (iOS native) / Partial (web manual sync path)`
20. Social/session/security governance (revocation, abuse/moderation, security events): `Done/Partial`

## 3) What Is Still Not Fully Production-Ready

These are the highest-impact remaining gaps:

1. Tool architecture still shell-first:
- Current coach tools run through controlled `bash` scripts.
- Target should be typed backend tool RPC (no shell in primary path), with policy engine and per-tool auth.

2. Knowledge ingestion governance:
- Retrieval is hardened (hybrid search + source filters + manifest hash checks), but full ingestion governance still needs:
- signed source approvals, namespace isolation, version rollback workflow, ingestion audit UI.

3. Cross-platform UX parity + design system maturity:
- iOS visual direction is strong.
- Web still has heavy monolithic screen architecture and needs further design-system decomposition for long-term polish velocity.

4. Production social platform completeness:
- push notifications, richer moderation/admin console, and stronger anti-abuse automation can still be expanded.

## 4) Agent Safety Controls Already Implemented

- Strict tool schema validation and unknown-field rejection.
- Script allowlist + per-script argument validation.
- Command injection controls and shell control character blocking.
- Tool output sanitization/truncation.
- Prompt-injection pattern detection + security event logging.
- Hybrid knowledge retrieval + strict professional grounding fallback.
- Optional Pinecone source filtering (`KB_ALLOWED_SOURCE_REGEX`).
- Local KB manifest+SHA256 integrity checks (`KNOWLEDGE_MANIFEST_MODE`).
- Media path boundary enforcement for inspection scripts.

## 5) Release Gates (Must Pass Before Production)

1. Build gates:
- `server`: `npm run build`
- `web`: `npm run build`
- `ios`: `xcodebuild ... build`

2. Agent/security gates:
- `server`: `npm run check:agent-security`
- no high-severity `security_events` regression in smoke scenarios

3. End-to-end gate:
- `server/scripts/e2e-real-check.mjs` pass

4. Manual UX gate:
- Web + iOS messaging with media + `@coach` in group
- Coach switch (`zj` <-> `lc`) and persona behavior verification
- Feed/friend/group/profile/leaderboard sanity pass

## 6) Next Iteration Priority (Execution Order)

1. Replace shell-first agent path with typed tool RPC for core flows:
- `inspect_media`, `log_meal`, `log_training`, `set_profile`, `get_context`, `search_kb`.

2. Add citation contract enforcement at response schema level:
- strict professional responses must include structured references.

3. Finish web UI architecture refactor:
- split giant app page into composable modules while keeping existing functionality stable.

