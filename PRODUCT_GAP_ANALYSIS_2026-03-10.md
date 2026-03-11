# ZYM Product Gap Analysis (Web + iOS + Backend)

Date: 2026-03-10 (America/New_York)  
Scope: `/web`, `/ios`, `/server`, plus references from `~/Documents/apps/zym-web` and `~/Documents/apps/Zym`.

## Verification Evidence

- Code audit:
  - `web/src/app/app/page.tsx` (+ related `web/src/lib/*`)
  - `ios/ZYM/Views/*`, `ios/ZYM/AppState.swift`, `ios/ZYM/Services/*`
  - `server/src/api/server.ts`, `server/src/websocket/ws-server.ts`, `server/src/services/*`, `server/src/tools/*`, `server/src/security/*`
- Build checks:
  - `server`: `npm run build` passed
  - `web`: `npm run build` passed
  - `ios`: `xcodebuild ... build` passed
- Runtime E2E:
  - `server/scripts/e2e-real-check.mjs` passed (full flow incl. register/login, DM, groups, @coach, media upload, profile persistence, websocket typing/message, leaderboard, feed).

## Executive Summary

- Current product is **far beyond "only chat input"**: auth, coach selection, DM/group, @coach trigger, media upload, feed, friends, profile, and leaderboard are implemented on all 3 sides.
- Against your full target vision, progress is approximately:
  - Core social + AI coaching foundation: **~70%**
  - Production-grade architecture/security/ops: **~45%**
  - Premium unified design system across web+iOS: **~55%**
- Combined readiness toward your "production-ready + complete vision": **~55-60%**.

## 2026-03-11 Agent Hardening Update

- `CoachService` now applies stricter grounding policy for professional queries:
  - Higher retrieval threshold for strict domains.
  - Explicit strict-grounding enforcement prompt when no strong KB hit is found.
  - Server-side fallback when model still outputs specific numeric prescriptions without evidence.
- Prompt-ingestion monitoring added:
  - Detected suspicious prompt-injection patterns are now recorded in `security_events`.
- RAG hygiene improved:
  - Local/vector KB snippets are normalized and instruction-like poison patterns are filtered.
  - Optional trusted-source gate for Pinecone retrieval via `KB_ALLOWED_SOURCE_REGEX`.
- Tool output safety improved:
  - Tool output is sanitized and truncated to bounded size before being fed back into the model context.
- Media inspection path safety improved:
  - `resolve_stored_path` now rejects media paths outside user-scoped media directories.
- Coach routing parity improved:
  - Group `coach_enabled` (`zj`/`lc`) is now passed into coach execution.
  - WebSocket `send_message` flow now includes the same async coach-reply behavior as HTTP `/messages/send`.

## 2026-03-11 Tool Boundary Enforcement Update

- `bash` tool now enforces per-script argument schemas (not only generic command filtering):
  - strict validation for `get-context.sh`, `list-recent-media.sh`, `inspect-media.sh`, `set-profile.sh`, `set-goal.sh`, `summary.sh`, `history.sh`, daily-read scripts, `cleanup-media.sh`, `analyze-form.sh`, `log-meal.sh`, `log-training.sh`.
  - invalid flags/values are blocked before script execution.
- Tool failure semantics hardened:
  - command execution failures now surface as `TOOL_EXECUTION_ERROR` (`ok=false`) instead of being returned as successful text payload.
- Added executable regression check for agent boundaries:
  - `server/scripts/agent-tool-boundary-check.mjs`
  - npm script: `npm run check:agent-security`

## 2026-03-11 Knowledge Integrity + Citation Update

- Added local knowledge manifest workflow:
  - manifest generator: `server/scripts/generate-knowledge-manifest.mjs`
  - runtime loader verifies approved docs and SHA-256 hashes before indexing local KB chunks.
  - optional strict mode via `KNOWLEDGE_MANIFEST_MODE=required` to block startup loading if manifest is missing/invalid.
- Added knowledge integrity security events:
  - `knowledge_manifest_missing`, `knowledge_manifest_invalid`, `knowledge_doc_hash_mismatch`.
- Added stricter professional-answer citation behavior:
  - for strict professional queries with strong KB hits, if assistant omits `[KB n]` references, backend auto-appends references and records `coach_missing_citation_autofixed`.

## Requirement-to-Feature Alignment Matrix

Legend: `Done` / `Partial` / `Missing`

1) Auth + choose ZJ/LC + chat entry  
- Web: Done  
- iOS: Done  
- Backend: Done  
- Status: **Done**

2) ZJ (encouraging) vs LC (strict) via soul files  
- Web: Done  
- iOS: Done  
- Backend: Done (`src/coach/zj.soul.md`, `lc.soul.md`)  
- Status: **Done**

3) DM + group chat, @coach reply in group  
- Web: Done  
- iOS: Done  
- Backend: Done  
- Status: **Done**

4) Media in chat (image/video + HEIC compatibility)  
- Web: Done  
- iOS: Done  
- Backend: Done (`/media/upload`, HEIC convert)  
- Status: **Done**

5) Food image analysis / workout form analysis / profile+plan generation  
- Web: Partial (available through coach flow; no dedicated polished workflow page)  
- iOS: Partial (available through chat/media; no explicit guided wizard)  
- Backend: Done/Partial (tool scripts exist and run; UX orchestration still basic)  
- Status: **Partial**

6) Persistent profile JSON + expiring media  
- Web: N/A (client)  
- iOS: N/A (client)  
- Backend: Partial (profile/session persisted, media has expiry model; cleanup scheduling is not yet fully operationalized as a background job)  
- Status: **Partial**

7) Vector KB retrieval + anti-hallucination boundaries  
- Web: N/A  
- iOS: N/A  
- Backend: Partial (knowledge retrieval exists but not enterprise-grade RAG pipeline; still script+bash style tools)  
- Status: **Partial**

8) Strong tool boundary + strict schema gateway + safe writes via backend  
- Web: N/A  
- iOS: N/A  
- Backend: Partial (recently tightened request schema checks + safer bash tool constraints; still not full typed tool RPC with policy engine)  
- Status: **Partial**

9) Friends/add/group/feed/profile customization  
- Web: Done  
- iOS: Partial/Done (major paths done; some UX parity details still behind web)  
- Backend: Done  
- Status: **Partial**

10) Apple Health permission + leaderboard  
- Web: Partial (manual sync inputs)  
- iOS: Done (HealthKit read + sync)  
- Backend: Done  
- Status: **Partial**

11) Session management / social app production concerns (revocation, device sessions, push, moderation, abuse tooling)  
- Web: Missing/Partial  
- iOS: Missing/Partial  
- Backend: Missing/Partial  
- Status: **Missing to Partial**

## Frontend Design Gap (vs your premium bright lifestyle vision)

- Brand direction from `zym-web` (Syne + Outfit, logo language) is partially present.
- Web app has modernized light UI, but still overgrown in a single giant screen component (`web/src/app/app/page.tsx` ~2400 lines), which slows iterative polish.
- iOS has improved light theme in active screens, but legacy screens still exist in project and design language is not yet fully systematized.
- Cross-platform token parity (spacing, typography scale, semantic color tokens, motion primitives) is not yet formalized.

## iOS/Web/Backend Feature Parity Gaps (current)

1) iOS and web profile capabilities are not fully symmetrical (web has richer in-app profile/public profile workflows).  
2) Feed interactions are still basic (no comments/threading despite social requirement depth).  
3) Notification/read-state/mention UX parity is limited.  
4) Web health flow is manual; iOS is HealthKit-native.

## Changes Implemented in This Iteration

1) Backend hardening:
- Upgraded `APIGateway.validateSchema` from "required-only" to typed rule validation (type, range, string constraints, regex, arrays).
- Added strict validation schema for `/messages/send`.
- `/chat` now supports media-only requests (message optional when media exists).
- Tightened `bash` tool command boundary: no command chaining, no multiline, no shell control-character chaining patterns.

2) iOS parity improvements:
- Added app session persistence in `AppState` (restore login state/token/user context across app restarts).
- Inbox now mirrors web behavior better by adding friend DM placeholders (not only existing DM topics).
- Friends page now supports direct `DM` open flow (calls `/messages/open-dm` then enters `ConversationView`).
- Profile now supports coach switch (`ZJ`/`LC`) directly in iOS, aligned with web.

3) Web brand tweak:
- Sidebar brand now uses logo asset (`/public/logo.svg`) and `ZYM` label, closer to website identity.

## Highest-Priority Remaining Work (for production-ready target)

1) RAG/KB hardening:
- Move from lightweight local similarity to a production RAG stack with trustworthy citation chain, retrieval guardrails, and poisoning defenses.

2) Tool architecture:
- Replace bash-first orchestration with typed server tools (strict JSON schema per tool call, policy engine, audit trail, per-user permission scopes).

3) Social platform completeness:
- Add comments/replies, unread counters, mention inbox, push notifications, moderation/reporting controls.

4) Session/security:
- Add refresh tokens, revocation/session list, device-bound sessions, stronger abuse controls, and structured security tests.

5) UI systemization:
- Split web monolith screen into composable modules; establish shared visual token spec across web+iOS; run a full visual redesign pass aligned to your "bright premium lifestyle" direction.
