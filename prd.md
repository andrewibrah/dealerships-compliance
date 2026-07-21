Here's the full 0→100 surface. I've numbered continuously so it reads as one master list, grouped by layer. Not all of it is v1 — I flag the actual ship-critical subset at the bottom, because the fastest way to never ship is to try to build all 65 before the first dealer pays.

A. Foundation decisions (the "0%")

1. Lock scope to one regime × one vertical for v1: FTC Safeguards (16 CFR 314) × franchised auto dealers. Everything else is a later crosswalk.
2. Multi-tenant from line one: dealer groups own multiple rooftops; data model must be rooftop-scoped but group-aggregatable.
3. Define the core compliance object model up front: Control, Requirement, Risk, Evidence, Task, Policy, Asset, DataFlow, Attestation. Everything downstream references these.
4. Decide the trust boundary: you are software that produces a compliance program, not the auditor/lawyer who certifies it. This one decision drives your liability posture, disclaimers, and UI language (#61).

B. Regulatory brain — "law as data" (the fuel for Rule-Matcher)
5. Decompose FTC Safeguards into atomic, individually-testable control requirements (the 9 elements of §314.4 → dozens of discrete controls).
6. Store the regulation as versioned structured data (YAML/JSON), not prose — effective dates, citations, applicability conditions. This is your AI Prompt Firewall instinct (FastAPI + YAML rule engine) applied to law; you've already built the pattern.
7. Applicability engine: which controls apply given dealer size (the <5,000-consumer exemption), systems in use, and data types held.
8. Crosswalk layer (schema-ready, content-later): one control maps to NIST CSF 2.0 / PCI DSS / CMMC so v2 is content, not a rebuild.
9. Regulatory update pipeline: a process (human-reviewed) for when the rule changes, with re-notification of affected tenants.

C. Interviewer node (intake/discovery)
10. Adaptive questionnaire engine with branching + skip logic (never ask an irrelevant question).
11. Conversational LLM front-end over a structured question graph — the LLM phrases and clarifies; the graph guarantees coverage.
12. Evidence-aware questioning: don't ask what an integration can auto-detect (#48).
13. Asset + data-flow discovery: what nonpublic customer data exists, where it lives, who touches it (this feeds the required risk assessment).
14. Multi-stakeholder, multi-session: the Qualified Individual answers some, IT answers others; save/resume everywhere.
15. Confidence + clarification loop: low-confidence answers get re-asked, not silently accepted.

D. Rule-Matcher node (the matching brain)
16. Maps interview answers → applicable controls → gaps, deterministically where possible.
17. Hybrid architecture: deterministic rule engine for the pass/fail logic, LLM only for interpretation and phrasing. Compliance status must never be hallucinated.
18. Gap severity scoring (regulatory-mandatory vs. best-practice vs. informational).
19. Explainability is non-negotiable: every gap traces to a specific citation and the answer that triggered it.
20. Written risk assessment generation — Safeguards requires a written risk assessment; this node produces it as a first-class artifact.

E. Builder node (artifact generation)
21. WISP generator — the Written Information Security Program is the central deliverable; this is your product's "wow." You already hand-built real WISP artifacts in the 21-day NJ sprint — those are your template corpus, don't rewrite them from scratch.
22. Policy/procedure document generation (access control, encryption, MFA, disposal, change management) from templates + org specifics.
23. Incident Response Plan generator (required by §314.4(h)).
24. Remediation roadmap: gaps → prioritized, assigned, dated tasks.
25. Evidence-request checklist auto-generated per open control.
26. Document lifecycle: versioning, draft→review→approve workflow, e-signature, immutable "adopted on" record.

F. Teacher node (your actual moat)
27. Per-control plain-language "why this exists / what breach it prevents" — the layer Vanta/Drata don't emphasize.
28. Role-based training modules (Qualified Individual vs. front-desk staff vs. F&I).
29. Staff attestation/acknowledgment tracking — because completed training is itself required evidence (§314.4(e)). The Teacher node feeds the Librarian node.
30. The signature 10-minute output: "here's your risk, here's why it matters, here's the fix" — this is the sentence that sells the product.

G. Librarian node (evidence + state over time)
31. Evidence repository: documents, screenshots, config exports, attestations — encrypted object storage.
32. Evidence-to-control linking (one artifact can satisfy multiple controls).
33. Continuous posture tracking: compliance isn't a PDF, it's a state that drifts — track it over time.
34. Append-only audit trail of every change (who, what, when) — this is what an examiner or breach-litigation discovery will demand.
35. Recurrence engine: annual risk assessment, periodic pen test / vuln assessment (§314.4(d)), annual QI report to the board — auto-scheduled and nagged.
36. Audit-ready export: a single "examiner package" or "board report" generated on demand.

H. UI/UX
37. Onboarding that reaches first artifact fast — time-to-first-value is the metric that decides pilot conversion.
38. Dashboard: posture score, open gaps by severity, tasks, upcoming recurrences.
39. Interview UX: chat + inline forms hybrid (chat for reasoning, forms for structured data).
40. Task board with ownership, due dates, evidence-attach in place.
41. Document viewer/editor with the approval workflow surfaced.
42. Role-scoped views: owner sees posture, QI sees everything, staff sees only their training/tasks, auditor gets a read-only evidence room.
43. Notifications + reminders (email/in-app) driven by the recurrence engine.
44. Mobile-responsive (dealers aren't at desks).
45. White-label/branding — for dealer groups and, later, for AAND-as-platform resellers.

I. Backend / system architecture
46. Multi-tenant data layer with hard isolation guarantees (row-level security or per-tenant schema).
47. Auth done right: SSO, enforced MFA, RBAC — a security product without MFA is dead on the demo.
48. LLM orchestration layer (your agentic core): model routing, prompt/version management, tool-calling — this is where your Claude Code / agent-skills experience is a direct advantage.
49. Deterministic rule-engine service, architecturally separate from the LLM layer (#17).
50. Document-generation service (templating → PDF/DOCX).
51. Append-only audit-log service (separate store, tamper-evident).
52. Async job/queue system for long-running agent tasks (interviews, generation, evidence sync).
53. Integration connectors (see K) behind a stable internal API.

J. Security of the product itself (credibility-critical)
54. Encryption at rest + in transit, everywhere. You're selling security to security-anxious buyers post-CDK; the product cannot be the soft target.
55. Dogfood: build toward your own SOC 2, and use AAND to run AAND's compliance — that's the demo and the case study.
56. PII handling, data-retention, and deletion policy (you're holding dealers' risk assessments — a juicy breach target).
57. Secrets management, dependency/vuln scanning, secure SDLC — your bug-bounty and SOC-lab work is the proof you can speak to this.
58. Prompt-injection defense: user-uploaded documents flow into the LLM; treat all tenant content as untrusted input.

K. Integrations (dealer ecosystem)
59. DMS connectors — CDK, Reynolds & Reynolds, Dealertrack — this is where the data and the pain live; even read-only evidence pull is a huge differentiator.
60. Evidence auto-collection (IdP, endpoint/MDM, email security) — the Vanta model that turns manual attestation into automated evidence.
61. Vendor/service-provider oversight module — Safeguards §314.4(f) requires overseeing service providers; dealers have dozens.

L. AI reliability + guardrails
62. Grounding + citation enforcement so every compliance claim is traceable (#19); no ungrounded generation in the compliance path.
63. Eval harness: a test set of dealer profiles → expected gaps, run on every model/prompt change. Without this you can't safely touch the prompts.
64. Confidence thresholds → human-in-the-loop escalation; the agent knows when to say "a person should confirm this."

M. Code structure / engineering
65. Separate, independently-versioned repos/packages: regulatory-content (data), rule-engine, agent-orchestration, web-app, doc-gen. The content repo versioning is what lets you update the law without redeploying the app.
66. Test strategy split by layer: unit tests for the rule engine (deterministic, must be 100%), eval harness for the LLM (statistical), integration tests for connectors.
67. Observability: structured logging, tracing, and per-tenant LLM cost/latency monitoring (agent apps bleed money silently).
68. CI/CD, IaC, environment separation, feature flags.

Critical path to first paying dealer (build these, defer the rest): #1–6, #10–11, #16–21, #23–24, #30, #31–34, #37–38, #46–47, #54. That's Interviewer → Rule-Matcher → risk assessment + WISP + IR plan → the Teacher one-pager → an evidence room → basic dashboard, multi-tenant, encrypted, MFA. Everything else (DMS integrations, auto-evidence, crosswalks, white-label, SOC 2) is what turns a pilot into a moat after you've proven a dealer will pay.