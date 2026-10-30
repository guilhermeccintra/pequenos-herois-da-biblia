# Code Review Report

## Report Contract

- Report type: `code-review`
- Report ID: `cr-20261030-phwebinitial`
- Review chain ID: `rc-20261030-phwebapp`
- Review generation: `0`
- Review trigger: `initial`
- Parent review report ID: `None`
- Parent review report path: `None`
- Parent resolution ID: `None`
- Parent resolution path: `None`
- Generated at: `2026-10-30T21:21:33Z`
- Report path: `docs/REVIEW-initial.md`
- Source skill: `code-review`
- Status: `Review complete`
- Git mutation during review: `None`
- Scope fingerprint: `sha256:13a7ccb1cf83f7cf2b138f8f9a91c63f71c3ffee6381c4465ccd45fda5eb2121`

Logical parent chain label: `ph-webapp-20261030`; the canonical chain ID above conforms to the skill validator. This report freezes the initial reviewed source. Record subsequent fixes/dispositions separately; do not rewrite this report during receiving.

## Scope

- Review date: `2026-10-30`
- Scope kind: `file set`
- Scope description: `Fresh-project, read-only bounded security/correctness review of 20 frozen files covering API, server, SQL, content/audio import, client services/auth/state, Vite and Vercel configuration.`
- Scope mode: `full frozen scope`
- Baseline: `Empty new project; no Git repository or HEAD exists in this directory.`
- Target: `Frozen file set identified by the per-file SHA-256 inventory below; parent coordinator reserved these files from concurrent edits.`
- Changed paths: `20`
- Diff size: `1813 added lines against empty baseline; 0 deleted lines.`
- Completion: `Complete within reviewed scope`
- Requirements consulted: `docs/CONTRATO.md; docs/BACKEND.md; docs/NARRACAO.md; parent task and explicit confirmation of all-forty narration behavior.`
- Prior resolution consulted: `None`
- Assumptions: `No live service credentials; no publishing, payment, email, generation, or remote mutation authorized for this review. Source-level completion does not assert production readiness.`
- Excluded as unrelated: `Visual design and browser visual QA, content artistry/theological review, deployment, packaging, legal/operator completeness, and a comprehensive dependency-CVE audit are owned separately by the parent coordinator.`

## Review Orchestration

- Assessment subagent: `Coordinator assessment - bounded 20-file frozen source set permits one reviewer to trace all critical payment, authorization, persistence, import and client-state paths without duplicate specialists.`
- Orchestration decision: `Single reviewer`
- Decision confidence: `high`
- Decision rationale: `This reviewer is the parent-assigned independent source reviewer; no further delegation occurred. Shared authorization and billing chains benefit from one consistent trace. Focused isolated reproductions replace uncertain asynchronous reasoning.`
- Coordinator override: `None`
- Context or tool limits: `No Git history, live credentials, hosted Supabase/Stripe/Vercel or paid ElevenLabs execution. Existing full-suite result was supplied by the parent, not rerun by this reviewer.`

### Risk Dimensions

- Paid content and media authorization, account ownership and client account switching.
- Stripe prices, payment completion races, webhook replay/order, and atomic fenced persistence.
- Progress durability, recovery redirects, production versus dev boundaries.
- Import retry behavior, narration cost gating, uncertain outcomes and private media publication.

### Reviewer Assignments

| Reviewer | Angle | Owned surfaces | Mandatory cross-checks | Status |
| --- | --- | --- | --- | --- |
| R1 | Security and correctness | The 20-file frozen scope | Contract, callers/callees, SQL grants/RLS, existing tests, focused race reproductions | Complete |

### Synthesis Statement

R1 independently traced each accepted claim from entry to terminal behavior and checked counterarguments. F1/F2/F3 have deterministic reproductions; F4 is a complete producer-to-consumer trace confirmed independently by the parent; F5 is corroborated by official Vite guidance. Passing backend tests were not treated as proof against client races. Live-provider behavior and email delivery remain explicit deployment blind spots, outside this source review.

## Review Snapshot

- Recommendation: `Changes requested`
- Completion: `Complete within reviewed scope`
- Why now: `Two major asynchronous correctness defects affect account isolation and duplicate-payment prevention; three minor defects affect state durability, first-story narration and development host security.`
- Must-review now: `F1, F2`
- Findings count: `Blocker 0 | Major 2 | Minor 3 | Question 0`
- Standalone test gaps: `Blocker 0 | Major 0 | Minor 0`
- Coverage confidence: `high`
- Biggest blind spot: `Real hosted payment/email/Storage integration remains untested without credentials.`

## Complete Findings Index

| ID | Severity | Surface | Review risk | Confidence | Origin | Verification | Issue key | Issue fingerprint | Expected basis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | Major | Client account refresh / auth transitions | Previous account progress is saved under the next account and entitlement UI is stale | high | R1 | targeted test | `behavior; entry=account refresh during session switch; contract=progress and account state belong only to the active parent account; effect=previous account data contaminates the next account cache` | `ifp-sha256:d814d0d918493f265653b61301365923e510bde272533e01e27bbb2d22f80f56` | `kind:hard-invariant; strength:authoritative; evidence:docs/CONTRATO.md progress ownership and authenticated account response contract` |
| F2 | Major | Checkout subscription/open-session reconciliation | One parent can be charged for a duplicate subscription | high | R1 | targeted test | `behavior; entry=checkout creation concurrent with previous hosted payment; contract=an account with an existing active subscription cannot start another subscription; effect=a second payable checkout is created after the first subscription activates` | `ifp-sha256:2351b326a1660ce4ea6a228394c72925496743bb5e78fb5b44a9a55d1164fb57` | `kind:requirement; strength:authoritative; evidence:docs/CONTRATO.md POST checkout must block another active subscription and reuse idempotency` |
| F3 | Minor | Client progress upsert ordering | Favorite removal or latest reading position is reverted after refresh | high | R1 | targeted test | `behavior; entry=rapid progress updates for one account and story; contract=the latest user action persists as the current reading state; effect=an earlier in-flight write overwrites the later action` | `ifp-sha256:58f31f3243b291db66eafb5c3e8659b1b822fb9b1377ec1e53c5a1f9b3dfa0af` | `kind:hard-invariant; strength:authoritative; evidence:docs/CONTRATO.md remote progress and favorite persistence plus latest-action data integrity` |
| F4 | Minor | Public sample selection versus private narrated story | The documented first narration/import trial produces no player in the app | high | R1 | static trace plus contract evidence | `behavior; entry=subscriber opens the first story after audio publication; contract=published narration can be played for all forty stories; effect=the public sample masks the first story signed audio forever` | `ifp-sha256:3a5bbe0f993f3ed15db551c2b7bcea952b9f612b5bd0b481f4935a09c8948781` | `kind:requirement; strength:authoritative; evidence:docs/NARRACAO.md all-forty narration workflow and parent coordinator confirmation on 2026-10-30` |
| F5 | Minor | Vite development host validation | DNS rebinding can expose local source and private content while dev is running | high | R1 | static trace plus contract evidence | `behavior; entry=development server request using an arbitrary hostname; contract=untrusted websites cannot read local project source or private content; effect=disabled host validation permits DNS rebinding access to the development server` | `ifp-sha256:f4d3cece15b994c49fc3519dd1b35fb1f84284192753f46269e68fea84be2bdd` | `kind:hard-invariant; strength:authoritative; evidence:Vite official server.allowedHosts security guidance and private-source requirement in docs/CONTRATO.md` |

## Blocker

None.

## Major

### F1 Major - A delayed account response crosses the active account boundary

Impact: On a shared device, a slow response for Alice can populate Bob's progress cache and display Alice's subscription. A later Bob save can persist the contaminated reading state as Bob. This is client privacy/data isolation failure; server story authorization remains enforced.
Review reason: Previous account progress is saved under the next account and entitlement UI is stale.
Surface: Client account refresh / auth transitions
Issue key: `behavior; entry=account refresh during session switch; contract=progress and account state belong only to the active parent account; effect=previous account data contaminates the next account cache`
Issue fingerprint: `ifp-sha256:d814d0d918493f265653b61301365923e510bde272533e01e27bbb2d22f80f56`
Expected basis: `kind:hard-invariant; strength:authoritative; evidence:docs/CONTRATO.md progress ownership and authenticated account response contract`
Confidence: `high`
Origin: `R1 candidate F1`
Coordinator verification: The extracted unchanged refreshAccount function ran in a VM with a deferred API response. Start as Alice, switch state.session to Bob, then resolve Alice's response: cache.bob[2].completed is true and Bob's UI hasAccess is true. Auth listeners and manual refresh invoke this same function without serializing requests. Sign-out alone also permits an old response to replace guest progress before the null session access throws.

Look here first:
- [src/main.js:75](/workspace/scratch/e58e70e01ac3/pequenos-herois/src/main.js#L75)
- [src/main.js:555](/workspace/scratch/e58e70e01ac3/pequenos-herois/src/main.js#L555)

Failure mode:
- Expected: Account results are applied only while the initiating authenticated identity and request generation are still current.
- Current: After awaiting api("account"), refreshAccount reads mutable state.session and merges into mutable state.progress. It does not compare result.user.id, capture the requesting user, cancel older requests, or fence completion.

Evidence:
- The extracted unchanged refreshAccount function ran in a VM with a deferred API response. Start as Alice, switch state.session to Bob, then resolve Alice's response: cache.bob[2].completed is true and Bob's UI hasAccess is true. Auth listeners and manual refresh invoke this same function without serializing requests. Sign-out alone also permits an old response to replace guest progress before the null session access throws.

Assumptions and limits:
- The reproduction deterministically controls the asynchronous boundary, without a live Supabase account. The server still checks Bob's bearer independently, so this does not grant Bob paid API content.

Reviewer action:
Fence account refresh by captured user/session and monotonically current request; test sign-out, account switch, and stale failures.

### F2 Major - Checkout completion between two Stripe reads permits another payable session

Impact: A prior hosted Checkout can finish while another tab requests checkout. The new request can return a second payment URL even though the first payment has already activated a subscription.
Review reason: One parent can be charged for a duplicate subscription.
Surface: Checkout subscription/open-session reconciliation
Issue key: `behavior; entry=checkout creation concurrent with previous hosted payment; contract=an account with an existing active subscription cannot start another subscription; effect=a second payable checkout is created after the first subscription activates`
Issue fingerprint: `ifp-sha256:2351b326a1660ce4ea6a228394c72925496743bb5e78fb5b44a9a55d1164fb57`
Expected basis: `kind:requirement; strength:authoritative; evidence:docs/CONTRATO.md POST checkout must block another active subscription and reuse idempotency`
Confidence: `high`
Origin: `R1 candidate F2`
Coordinator verification: The real createCheckout orchestration was exercised with provider boundary stubs: subscriptions.list first returned no subscription; checkout.sessions.list then marked the existing stored session completed and returned no open session; checkout.sessions.create was invoked while provider state was active. Reproducer asserted one new payable session. A delayed webhook is irrelevant because the duplicate starts before local state refresh.

Look here first:
- [server/billing.mjs:66](/workspace/scratch/e58e70e01ac3/pequenos-herois/server/billing.mjs#L66)
- [server/billing.mjs:72](/workspace/scratch/e58e70e01ac3/pequenos-herois/server/billing.mjs#L72)

Failure mode:
- Expected: A completed stored Checkout must be reconciled before rotating to a fresh reservation and creating another payable subscription session.
- Current: The subscription list is read once, before the open-only session list. If the old session completes between those reads, it is absent from open sessions and the code creates a fresh reservation. Persisted checkout_session_id is not checked. The DB lease serializes this application's workers but cannot prevent a payment completion on Stripe's hosted page.

Evidence:
- The real createCheckout orchestration was exercised with provider boundary stubs: subscriptions.list first returned no subscription; checkout.sessions.list then marked the existing stored session completed and returned no open session; checkout.sessions.create was invoked while provider state was active. Reproducer asserted one new payable session. A delayed webhook is irrelevant because the duplicate starts before local state refresh.

Assumptions and limits:
- The interleaving is a deterministic boundary reproduction, not a live Stripe charge. A new-session-only subscription recheck narrows but does not fully prove closure of external state races; reconcile the persisted pending session and unknown outcomes as part of the fix.

Reviewer action:
Reconcile stored checkout_session_id and completed/pending outcomes before creating a fresh session; cover completion between the Stripe reads and delayed webhooks.

## Minor

### F3 Minor - Overlapping progress writes can persist an older user action last

Impact: Rapid favorite/unfavorite or navigation/conclusion interactions may appear successful locally but be restored to older values when account data reloads.
Review reason: Favorite removal or latest reading position is reverted after refresh.
Surface: Client progress upsert ordering
Issue key: `behavior; entry=rapid progress updates for one account and story; contract=the latest user action persists as the current reading state; effect=an earlier in-flight write overwrites the later action`
Issue fingerprint: `ifp-sha256:58f31f3243b291db66eafb5c3e8659b1b822fb9b1377ec1e53c5a1f9b3dfa0af`
Expected basis: `kind:hard-invariant; strength:authoritative; evidence:docs/CONTRATO.md remote progress and favorite persistence plus latest-action data integrity`
Confidence: `high`
Origin: `R1 candidate F3`
Coordinator verification: The unchanged saveProgress function was extracted and run with deferred database upserts. Favorite=true was initiated first, favorite=false second. Resolving the second write and then the first left remote.favorite=true while local.favorite=false. The existing mergeProgress gives the remote row precedence on the next refresh.

Look here first:
- [src/services.js:84](/workspace/scratch/e58e70e01ac3/pequenos-herois/src/services.js#L84)
- [src/main.js:195](/workspace/scratch/e58e70e01ac3/pequenos-herois/src/main.js#L195)

Failure mode:
- Expected: Writes from one client for an account/story must preserve user action order or reject stale versions.
- Current: Every action starts an independent upsert; there is no per-account/story queue, revision check, or other ordering mechanism. updated_at is generated when each request reaches the database, so it cannot identify the older initiating action.

Evidence:
- The unchanged saveProgress function was extracted and run with deferred database upserts. Favorite=true was initiated first, favorite=false second. Resolving the second write and then the first left remote.favorite=true while local.favorite=false. The existing mergeProgress gives the remote row precedence on the next refresh.

Assumptions and limits:
- Cross-device conflict policy is not adjudicated here; the proven failure is two actions from a single client. The deterministic test replaces only remote completion order.

Reviewer action:
Serialize or coalesce writes per user/story and cover reversed completion order for favorite changes and story completion.

### F4 Minor - Published narration for story 1 never reaches a subscriber

Impact: Operators can generate/import 01.mp3 successfully, but paid subscribers opening the first story still see that narration is unavailable. This is particularly visible because the documented first generation trial uses story 1.
Review reason: The documented first narration/import trial produces no player in the app.
Surface: Public sample selection versus private narrated story
Issue key: `behavior; entry=subscriber opens the first story after audio publication; contract=published narration can be played for all forty stories; effect=the public sample masks the first story signed audio forever`
Issue fingerprint: `ifp-sha256:3a5bbe0f993f3ed15db551c2b7bcea952b9f612b5bd0b481f4935a09c8948781`
Expected basis: `kind:requirement; strength:authoritative; evidence:docs/NARRACAO.md all-forty narration workflow and parent coordinator confirmation on 2026-10-30`
Confidence: `high`
Origin: `R1 candidate F4`
Coordinator verification: Static producer-to-consumer trace: import-audio PATCH associates a private audio_path; handlers.story signs it correctly; services.getStory(1) never invokes that handler. Parent coordinator independently observed and confirmed the intended all-story narration requirement.

Look here first:
- [src/services.js:52](/workspace/scratch/e58e70e01ac3/pequenos-herois/src/services.js#L52)
- [scripts/import-audio.mjs:96](/workspace/scratch/e58e70e01ac3/pequenos-herois/scripts/import-audio.mjs#L96)

Failure mode:
- Expected: A subscriber can load the server-backed first story and its signed audio when published, while guests retain the public reading sample.
- Current: getStory unconditionally fetches /sample.json whenever id===1, before considering authentication or the API. import-audio updates only the database body; the static sample retains audio_url:null.

Evidence:
- Static producer-to-consumer trace: import-audio PATCH associates a private audio_path; handlers.story signs it correctly; services.getStory(1) never invokes that handler. Parent coordinator independently observed and confirmed the intended all-story narration requirement.

Assumptions and limits:
- No natural narration exists yet, as intended. Failure becomes visible after an authorized operator publishes real audio; no demand is made to generate audio before credentials exist.

Reviewer action:
For entitled signed-in readers, obtain story 1 through the authorized API; preserve guest sample and an explicit 401/403 fallback without exposing private audio.

### F5 Minor - Development server accepts attacker-controlled hostnames

Impact: A developer running the supplied dev command loses Vite's host-based DNS rebinding protection. Proprietary code/content served by the dev server can become readable to a malicious website.
Review reason: DNS rebinding can expose local source and private content while dev is running.
Surface: Vite development host validation
Issue key: `behavior; entry=development server request using an arbitrary hostname; contract=untrusted websites cannot read local project source or private content; effect=disabled host validation permits DNS rebinding access to the development server`
Issue fingerprint: `ifp-sha256:f4d3cece15b994c49fc3519dd1b35fb1f84284192753f46269e68fea84be2bdd`
Expected basis: `kind:hard-invariant; strength:authoritative; evidence:Vite official server.allowedHosts security guidance and private-source requirement in docs/CONTRATO.md`
Confidence: `high`
Origin: `R1 candidate F5`
Coordinator verification: The official Vite server options documentation explicitly identifies allowedHosts:true as allowing DNS rebinding and source/content download. The project sets that exact value. Source inspected; no attack traffic was generated.

Look here first:
- [vite.config.js:8](/workspace/scratch/e58e70e01ac3/pequenos-herois/vite.config.js#L8)

Failure mode:
- Expected: Allow localhost/IP defaults and only explicitly trusted development hostnames.
- Current: server.allowedHosts is unconditionally true. package.json supplies --host 0.0.0.0. The permissive setting is unnecessary for ordinary localhost preview and persists regardless of whether local demo content is enabled.

Evidence:
- The official Vite server options documentation explicitly identifies allowedHosts:true as allowing DNS rebinding and source/content download. The project sets that exact value. Source inspected; no attack traffic was generated.

Assumptions and limits:
- This is limited to a running development server. It does not alter the compiled Vercel app, production API authorization, or Supabase RLS. Exploitability depends on browser/network conditions.

Reviewer action:
Remove allowedHosts:true or supply an explicit trusted-host list; keep any workspace proxy hostname narrowly configured.

## Questions

None. The parent coordinator explicitly confirmed narration availability for all 40 stories, settling the only potentially ambiguous product expectation.

## Test Gaps

None as standalone findings. Missing regression cases for account switching, provider completion between reads, reordered progress writes, and published first-story audio are included in their corresponding finding cards; they are not duplicated as T-items. Live-service acceptance testing is a stated deployment limit, not an invented test defect.

## Review Coverage Ledger

| Area ID | Area / path | Touched files or entry points | Owner | Depth | Status | Result | Evidence / next step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | HTTP adapters, methods, authentication and errors | api/account.js, api/checkout.js, api/portal.js, api/story.js, api/webhook.js; server/http.mjs; server/runtime.mjs | R1 | dependency trace | Reviewed - no issue found | Bearer verified with getUser, no client-selected user, bounded bodies, no-store JSON, raw signed webhook | Reviewed all entry wrappers and existing backend-http cases; Vercel body-parser behavior still needs hosted smoke test. |
| A2 | Account/story/portal access and media lifetime | server/handlers.mjs; server/rules.mjs access, media and asset helpers | R1 | contract trace | Reviewed - no issue found | Authentication precedes private reads/signing; active known plan and future expiry required; portal customer is server-selected | Signed URL TTL is at most 900 seconds and remaining period; price/status spoofing does not bypass gate. |
| A3 | Checkout, webhook and commercial price mapping | server/billing.mjs; server/rules.mjs price/subscription helpers | R1 | runtime verified | Finding F2 | Completion race remains despite fenced application lease; replay/order paths otherwise coherent | Deterministic F2 reproduction; current snapshot fetched inside lock, event payload not trusted, price amounts/BRL/interval/quantity checked. |
| A4 | Database, repository, RLS, leases, atomic events and Storage | server/repository.mjs; supabase/migrations/202610300001_initial.sql | R1 | dependency trace | Reviewed - no issue found | Invoker RPCs restricted to service_role, RLS own progress, restrictive private-bucket guard, atomic event plus grant commit | Read real SQL tests and parent-supplied PGlite pass; stale lock token cannot commit or release a newer lease. |
| A5 | Client authentication/session/account transitions | src/main.js account refresh, init/auth listener and submitAuth; src/auth.js | R1 | runtime verified | Finding F1 | Delayed results can cross account boundary; login/signup/recovery routes otherwise consistent | Reproduced cache contamination; recovery redirect matches route and Vercel rewrite; UI escapes email/errors and only allows Stripe payment origins. |
| A6 | Progress storage and user interactions | src/services.js local/remote persistence; src/main.js favorite, movePart and finish | R1 | runtime verified | Finding F3 | Local keys and RLS isolate ordinary operations, but concurrent same-row writes can finish out of order | Reproduced favorite reversal; no guest-to-account merge is imposed, consistent with current contract. |
| A7 | Story retrieval, narrated sample and API service | src/services.js getStory/api; src/main.js render | R1 | contract trace | Finding F4 | Public sample is always selected for story 1, hiding subsequently published audio | Producer/importer/API/client chain verified; current renderVersion otherwise suppresses obsolete route responses. |
| A8 | Full content/image import | scripts/import-content.mjs | R1 | dependency trace | Reviewed - no issue found | Validates all content/assets before mutation, confines paths, private bucket required, stable upsert restart | Existing import tests inspected; story import RPC preserves audio atomically. |
| A9 | Optional paid generation and MP3 association | scripts/generate-narration.mjs; scripts/import-audio.mjs | R1 | dependency trace | Reviewed - no issue found | Dry-run default, explicit paid flag, pre-request manifest, no automatic retry of uncertain charges; hash-addressed private uploads and compare/update | Existing failure/retake tests inspected; full-body conditional update URLs for supplied stories range 5107–6030 characters, so suspected current-data oversized URL dismissed. |
| A10 | Development and production bundling boundary | vite.config.js | R1 | contract trace | Finding F5 | Arbitrary dev hosts permitted; local-content plugin is serve-only and DEV flag cannot grant production access | Official Vite security guidance confirms host risk; existing dist scan found no paragraphs from any of 39 paid stories. |
| A11 | Hosted routes and response security policy | vercel.json | R1 | dependency trace | Reviewed - no issue found | SPA rewrites explicitly cover auth/recovery/account; API routes not swallowed; CSP limits scripts/connections; max duration 60s less than DB lease 120s | Source review only; Supabase custom domains would require a deliberate CSP extension and are not configured in current contract. |

## Subagent Candidate Adjudication

| Candidate ID | Proposed by | Decision | Final ID | Coordinator evidence | Reason |
| --- | --- | --- | --- | --- | --- |
| R1-C1 | R1 | accepted | F1 | Deferred real refreshAccount function reproduction | Mutable current identity used after asynchronous response. |
| R1-C2 | R1 | accepted | F2 | Real createCheckout orchestration with legitimate provider state transition | App lease cannot serialize hosted payment completion. |
| R1-C3 | R1 | accepted | F3 | Real saveProgress function with reversed remote completion | No write ordering or version guard. |
| R1-C4 | R1 and parent coordinator | accepted | F4 | Import/API/client trace and parent confirmation | Story 1 audio is within intended all-forty workflow. |
| R1-C5 | R1 | accepted | F5 | Exact permissive config plus official Vite security documentation | Dev-only exposure is material but lower severity. |
| R1-C6 | R1 | dismissed | None | Supplied story conditional-update URLs measured at 5107–6030 chars | Suspected oversized body-in-query requests not supported for current data; no speculative failure claimed. |
| R1-C7 | R1 | dismissed | None | Recovery email redirect targets /definir-senha directly | Listener attaches after session initialization, but initial recovery still lands on the explicit password-reset route. |
| R1-C8 | R1 | dismissed | None | Source and existing SQL tests: lease token checked before commit and event insertion transaction | No accepted out-of-order webhook replay grant or stale-lease overwrite defect. |
| R1-C9 | R1 | dismissed | None | DB private bucket, signed TTL cap, production DEV elimination, dist text scan | No production paid-content bypass identified. Previously issued URLs intentionally remain valid until expiry. |

## Evidence Appendix

### Diff Inventory

All files are additions relative to the fresh-project empty baseline. Hashes below are SHA-256 of exact file bytes. Scope fingerprint is SHA-256 of compact sorted JSON containing baseline `empty-new-project` and target mapping of relative paths to these hashes.

| File or area | Classification | Semantic review area considered | SHA-256 |
| --- | --- | --- | --- |
| api/account.js | surface | See A1–A11 coverage mapping | `9d004f48b29ed5c56883930ccc079f8f508205d42b131dad4744d48ca991a09b` |
| api/checkout.js | surface | See A1–A11 coverage mapping | `e9ca6f6924e9bc90514ed4f45c00917893bd8d89589b7e9c1f8dcca0fe3a2a60` |
| api/portal.js | surface | See A1–A11 coverage mapping | `e64172f1ddfd803f814945b54ff409f7c86896a28cfd7960547540a92c2a6995` |
| api/story.js | surface | See A1–A11 coverage mapping | `a2c34167682476a00ff0d6db7f2b7a84fc2f746c54185a12dc449beb4578a360` |
| api/webhook.js | surface | See A1–A11 coverage mapping | `f9a2ef815caeb7bf25904d1b5919375403167508ad8488c4cda873463ba1671b` |
| scripts/generate-narration.mjs | surface | See A1–A11 coverage mapping | `dc92aa4e5b445014c6e3f0506674a371c81444d4bed685b0ead8dabd24ebc63f` |
| scripts/import-audio.mjs | surface | See A1–A11 coverage mapping | `02a6044eb19eec24ffd6e5be333ab513ca98f6d2aca239dfc6003769fba9e932` |
| scripts/import-content.mjs | surface | See A1–A11 coverage mapping | `a87a29cba2571598a6ae0dab59673ab3fe85a663132a431d519d45608119319f` |
| server/billing.mjs | surface | See A1–A11 coverage mapping | `502d4a9706797edadeee2fde2ab1c6e9f4f0b0e9f241ba15b0fa5e10371980dd` |
| server/handlers.mjs | surface | See A1–A11 coverage mapping | `1cea02ef96520b6d8dcb89e786541c020f1643de72c2d678981dbacd2e52d97d` |
| server/http.mjs | surface | See A1–A11 coverage mapping | `abcc3d5dcab34f08091e9a7fce874299ea27151b96aab4e85698afa6ba2a7218` |
| server/repository.mjs | surface | See A1–A11 coverage mapping | `59ecfa541fd8632048ee9b8e30bddc4a0780aa2fe04e06ac11682d2cd67708e2` |
| server/rules.mjs | surface | See A1–A11 coverage mapping | `8f0c6fb6549f6906b0dde32266a290b6d5ca6225d2613d881313245040e693ca` |
| server/runtime.mjs | surface | See A1–A11 coverage mapping | `0e3008a87b20052618258ababa347625b5bc9ccf62929a51d841be2592a1e0f2` |
| src/auth.js | surface | See A1–A11 coverage mapping | `be75fb52ff204993076c9717c4c678e44fcaa3cad6c9bf18d4af1a3be8294837` |
| src/main.js | surface | See A1–A11 coverage mapping | `bb9ee213ba84c012b9d4b80ae69bd1da5f972215a14d6065f251cbb7ec4107af` |
| src/services.js | surface | See A1–A11 coverage mapping | `a0ccd69841046c939934c674670bfe83efbce45ccfab4117e8db48108503fc08` |
| supabase/migrations/202610300001_initial.sql | surface | See A1–A11 coverage mapping | `120bc5b1a6c125587b57958323dc3eb50625b670f02e6bfb8083978d909f6fbd` |
| vercel.json | config | See A1–A11 coverage mapping | `acc15739242dca7437d007943376ae9ea04611cb77e5a05bd1ff695f99541648` |
| vite.config.js | config | See A1–A11 coverage mapping | `0ffa59f93cb1ff8446ff76b3eddded6a5aa1ac43547be215240509a279d754ed` |

Supporting context read without changes: docs/CONTRATO.md, docs/BACKEND.md, docs/NARRACAO.md; package.json; src/core.js, src/reader.js, src/library.js, index.html; all relevant existing test files; content/stories.json and generated dist text assets. No new source-file surface was silently added to findings.

### Verification Commands

- `node /tmp/ph-review-repro.mjs` -> all three assertions reproduced F1, F2 and F3 against unchanged code. The temporary script executes extracted real client functions and the real createCheckout function; only external timing/boundaries are stubbed.
- Python read-only dist scan -> no full paid-story paragraphs from stories 2–40 in six compiled/static text assets. This verifies the current available build, without rebuilding or modifying it.
- Node read-only URL-size measurement -> conditional audio-association request paths for all 40 stories measure 5107–6030 characters; no current-data over-8KB case.
- `git status --short` / `git rev-parse HEAD` -> directory is not a Git repository; no Git mutations occurred.
- Parent-supplied `npm test` result -> 41 passed, including PGlite real-migration/RLS cases. Reviewer inspected tests rather than duplicating the complete suite. This is attributed evidence, not a fresh independent run.
- `python3 /root/.codex/skills/remote-skills/skill-6ae3c19c34fc8191ad08e4a0962ed5ff/scripts/validate_review_report.py docs/REVIEW-initial.md` -> canonical report validator passed after report preparation.

Focused reproduction outputs:

```text
F1 REPRODUCED: Alice response saved in Bob local cache; Alice entitlement also displayed under Bob session.
F2 REPRODUCED: second payable Checkout created after prior Checkout completed between subscription snapshot and open-session listing.
F3 REPRODUCED: earlier favorite write commits after later unfavorite and restores stale remote favorite.
```

Reproduction sequence sufficient to recreate each timing test:

1. Extract `refreshAccount` unchanged into a context with Alice session and deferred account API. Switch current state to Bob before resolving Alice's response, then inspect Bob's saved local cache.
2. Invoke real `createCheckout` with a persisted prior session. Let subscriptions list finish empty; complete the prior session just as open-only session listing begins. The create call still occurs with new reservation.
3. Invoke real `saveProgress` with favorite true, then false. Hold both DB upserts, apply false first and true second. Remote favorite is true while final local action is false.

### Supporting Code Links

| ID | Role | Link | Why it matters |
| --- | --- | --- | --- |
| F1 | entry or risk | [src/main.js:75](/workspace/scratch/e58e70e01ac3/pequenos-herois/src/main.js#L75) | Client account refresh / auth transitions |
| F1 | entry or risk | [src/main.js:555](/workspace/scratch/e58e70e01ac3/pequenos-herois/src/main.js#L555) | Client account refresh / auth transitions |
| F2 | entry or risk | [server/billing.mjs:66](/workspace/scratch/e58e70e01ac3/pequenos-herois/server/billing.mjs#L66) | Checkout subscription/open-session reconciliation |
| F2 | entry or risk | [server/billing.mjs:72](/workspace/scratch/e58e70e01ac3/pequenos-herois/server/billing.mjs#L72) | Checkout subscription/open-session reconciliation |
| F3 | entry or risk | [src/services.js:84](/workspace/scratch/e58e70e01ac3/pequenos-herois/src/services.js#L84) | Client progress upsert ordering |
| F3 | entry or risk | [src/main.js:195](/workspace/scratch/e58e70e01ac3/pequenos-herois/src/main.js#L195) | Client progress upsert ordering |
| F4 | entry or risk | [src/services.js:52](/workspace/scratch/e58e70e01ac3/pequenos-herois/src/services.js#L52) | Public sample selection versus private narrated story |
| F4 | entry or risk | [scripts/import-audio.mjs:96](/workspace/scratch/e58e70e01ac3/pequenos-herois/scripts/import-audio.mjs#L96) | Public sample selection versus private narrated story |
| F5 | entry or risk | [vite.config.js:8](/workspace/scratch/e58e70e01ac3/pequenos-herois/vite.config.js#L8) | Vite development host validation |

F5 external primary authority: [Vite official server.allowedHosts documentation](https://vite.dev/config/server-options.html#server-allowedhosts), retrieved 2026-10-30. It explains that arbitrary host acceptance permits DNS rebinding to local source/content and recommends explicit hostnames. No exploit was executed.

### Dismissed Coordinator Candidates

See R1-C6 through R1-C9 above. Also, an authenticated user setting their own password on /definir-senha is normal session-authorized account functionality; the recovery-token route need not be the only valid password-update context. Arbitrary client-supplied subscription IDs, user IDs or prices do not enter entitlement writes.

### Blind Spots

| Area ID | Blind spot | Decision risk | What would resolve it |
| --- | --- | --- | --- |
| A1 | Hosted Vercel request stream and live Supabase token/email configuration | Raw-body routing and confirmation/recovery must work with deployed provider settings | Stage deployment with test accounts; verify invalid signature, email confirmation, recovery and expired token responses. |
| A3 | Real Stripe payment/session timing and webhook delivery | Source-level fix must be validated against test-mode hosted Checkout completion/cancel/renewal | Execute two-tab race and replay/out-of-order events against test Stripe with no production charges. |
| A4 | Real Supabase default privileges/Storage middleware and project state | PGlite tests simulate provider infrastructure, not every hosted configuration | Apply migration to isolated project, test anon/authenticated access and signed private object fetch. |
| A9 | Natural narration quality and provider quota/response behavior | No actual generated/human MP3 was listened to; intended optional feature remains unpopulated | After operator supplies credentials/files, generate one authorized sample, review acoustically, then import and play it. |
| A10 | Actual browser/network DNS rebinding exploitability | Configuration risk is known; environmental exploit preconditions were not exercised | Remove broad host setting; test trusted workspace host plus untrusted Host rejection. |

These are limitations of source review and live integration acceptance; all frozen source surfaces were covered. No production readiness claim is made.

## Prior Resolution Reconciliation

None - initial review generation.

## Receiving Handoff

- Handoff status: `Ready for receiving-code-review`
- Automatic receiving permitted: `Yes`
- Source report ID: `cr-20261030-phwebinitial`
- Scope fingerprint to recheck: `sha256:13a7ccb1cf83f7cf2b138f8f9a91c63f71c3ffee6381c4465ccd45fda5eb2121`
- Actionable finding IDs: `F1, F2, F3, F4, F5`
- Deferred finding IDs: `None`
- Actionable test-gap IDs: `None`
- Deferred test-gap IDs: `None`
- Open question IDs: `None`
- Open coverage area IDs: `None`
- Highest-risk verification to repeat: `Deterministic account switching during an account request and completed-hosted-checkout reconciliation before creating a second payable session.`
- Suggested implementation boundaries: `Client refresh and progress services, first-story retrieval, checkout reconciliation and focused related SQL if needed, Vite trusted hosts. Preserve server-side paid entitlement checks and optional cost-gated narration.`
- Re-review note: `Treat every finding as a claim to verify. Challenges require a counterclaim, argument, evidence, limits, and settlement criterion.`
- Chain rule: `Generation 1 is terminal. Do not automatically invoke receiving-code-review; return remaining findings to the user or product owner.`

The parent coordinator has existing authorization to complete/fix the app and explicitly stated that verified findings will be fixed after this report freezes. This handoff grants no independent external publication, charge, email or credential permission.

## Report Self-Check

- yes Actual assessment mode and rationale are recorded.
- yes Every changed review-relevant source area appears in the coverage ledger, split by entry-point responsibility where files span areas.
- yes Every final finding appears once in the index and once as a matching card.
- yes Every Finding F-number area references an existing finding.
- yes No standalone test gaps are duplicated from accepted defects.
- yes Every finding has a unique semantic fingerprint and authoritative expected basis.
- yes Generation, trigger, scope, parent fields and receiving handoff satisfy the bounded chain contract.
- yes Prior-resolution reconciliation correctly states initial generation; no inherited dispositions exist.
- yes Every finding is partitioned exactly once into the actionable handoff; no open questions or uncovered source areas remain.
- yes Every meaningful candidate has an adjudication.
- yes Live-provider blind spots have concrete follow-up verification and are not represented as completed integration tests.
- yes Recommendation follows the skill mapping.
- yes Canonical validator passes.
- yes No product, tests or Git state were mutated during review; only this requested report and disposable /tmp evidence were created.
