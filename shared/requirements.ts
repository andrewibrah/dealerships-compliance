// Requirement catalog — the FTC Safeguards Rule as data (PRD #3, entity 1 of 9).
//
// GLOBAL and tenant-neutral: one shared, versioned catalog that is identical for every
// dealer. Derived PURELY from SAFEGUARDS_SECTIONS so the questionnaire and the
// requirement rows can never drift — one requirement per question (9 sections x 5 = 45).
// Pure and dependency-free (mirrors shared/audit.ts / shared/tenant-guard.ts): imported
// by both runtimes and used to author the 0005 migration seed (codes) + the 0009 migration
// (refined citations), which the drift-guard tests pin to this file EXACTLY.
//
// The §314.4 citation here is PER-REQUIREMENT (task #5): each question is mapped to the
// most specific subsection of 16 CFR §314.4 it satisfies, grounded in the actual Rule
// text (see CITATION_BY_CODE). Where a question does not warrant anything finer than its
// section's element, it keeps the section-level citation (CITATION_BY_SECTION).

import { SAFEGUARDS_SECTIONS } from './safeguards-questions';

export type RequirementWeight = 'critical' | 'important' | 'standard';

export interface Requirement {
  /** Stable business key = the questionnaire question id (e.g. "q1_1"). */
  code: string;
  section: number;
  sectionName: string;
  /** The question text. */
  title: string;
  /** §314.4 citation — per-requirement subsection (see CITATION_BY_CODE). */
  citation: string;
  weight: RequirementWeight;
  /** Plain-language "why this control exists / what it prevents" (authored, not generated). */
  whyItMatters: string;
  /** Plain-language "how to close the gap" (authored, not generated). */
  fix: string;
  /** Reserved for applicability scoping (#7); intentionally empty today. */
  applicability: Record<string, unknown>;
  version: number;
}

/** Section number -> the §314.4 element it maps to. The coarse, element-level fallback:
 *  a requirement with no finer CITATION_BY_CODE entry inherits its section's element. */
export const CITATION_BY_SECTION: Record<number, string> = {
  1: '§314.4(a)', // Qualified Individual
  2: '§314.4(b)', // Risk Assessment
  3: '§314.4(c)(2)', // Data Inventory & Classification
  4: '§314.4(c)(1)', // Access Controls
  5: '§314.4(c)(3)', // Encryption
  6: '§314.4(f)', // Vendor & Third-Party Management
  7: '§314.4(h)', // Incident Response Plan
  8: '§314.4(e)', // Employee Training
  9: '§314.4(d)', // Penetration Testing & Monitoring
};

// Per-requirement §314.4 citation. Every mapping is grounded in the actual Rule text and is
// human-verifiable against 16 CFR §314.4; where the Rule is no more specific than the section
// element, the entry deliberately equals CITATION_BY_SECTION[section]. Real Rule structure used:
//   (a) Qualified Individual; (i) QI annual written report to the board.
//   (b) risk assessment: (b)(1) written + required contents; (b)(2) periodic reassessment.
//   (c) safeguards: (c)(1) access controls + least privilege; (c)(2) data inventory/classify;
//       (c)(3) encryption at rest + in transit; (c)(5) MFA; (c)(6) secure disposal + retention
//       review; (c)(8) monitor/log authorized-user activity.
//   (d) test/monitor effectiveness: (d)(2) continuous monitoring OR annual pentest + semiannual
//       vulnerability assessments.
//   (e) personnel: (e)(1) security awareness training.
//   (f) oversee service providers: (f)(1) select/retain capable; (f)(2) contractual safeguards;
//       (f)(3) periodic assessment.
//   (h) written incident response plan: (h)(3) roles/authority; (h)(4) communications;
//       (h)(6) documentation/reporting of security events.
export const CITATION_BY_CODE: Record<string, string> = {
  // §314.4(a) Qualified Individual — designation, qualifications, charter, continuity;
  // (i) the QI's reporting line to the board (the annual written report).
  q1_1: '§314.4(a)',
  q1_2: '§314.4(a)',
  q1_3: '§314.4(i)',
  q1_4: '§314.4(a)',
  q1_5: '§314.4(a)',

  // §314.4(b) Risk assessment — (b)(1) the written assessment and its contents (systems,
  // threats, vulnerabilities); (b)(2) periodic reassessment (annual + on material change).
  q2_1: '§314.4(b)(1)',
  q2_2: '§314.4(b)(1)',
  q2_3: '§314.4(b)(1)',
  q2_4: '§314.4(b)(2)',
  q2_5: '§314.4(b)(2)',

  // §314.4(c)(2) Data inventory/classification — (c)(6) covers retention review + secure disposal.
  q3_1: '§314.4(c)(2)',
  q3_2: '§314.4(c)(6)',
  q3_3: '§314.4(c)(2)',
  q3_4: '§314.4(c)(6)',
  q3_5: '§314.4(c)(2)',

  // §314.4(c)(1) Access controls + least privilege — (c)(5) MFA; (c)(8) monitor/log activity.
  q4_1: '§314.4(c)(5)',
  q4_2: '§314.4(c)(1)',
  q4_3: '§314.4(c)(1)',
  q4_4: '§314.4(c)(8)',
  q4_5: '§314.4(c)(1)',

  // §314.4(c)(3) Encryption at rest + in transit (keys/email/mobile are all encryption controls).
  q5_1: '§314.4(c)(3)',
  q5_2: '§314.4(c)(3)',
  q5_3: '§314.4(c)(3)',
  q5_4: '§314.4(c)(3)',
  q5_5: '§314.4(c)(3)',

  // §314.4(f) Service providers — (f)(1) select/retain capable; (f)(2) contractual safeguards;
  // (f)(3) periodic assessment/monitoring.
  q6_1: '§314.4(f)(2)',
  q6_2: '§314.4(f)(3)',
  q6_3: '§314.4(f)(2)',
  q6_4: '§314.4(f)(1)',
  q6_5: '§314.4(f)(3)',

  // §314.4(h) Incident response plan — (h) the written plan itself + tabletop testing;
  // (h)(3) roles/authority; (h)(4) communications (breach notification); (h)(6) documentation.
  q7_1: '§314.4(h)',
  q7_2: '§314.4(h)',
  q7_3: '§314.4(h)(4)',
  q7_4: '§314.4(h)(3)',
  q7_5: '§314.4(h)(6)',

  // §314.4(e)(1) Security awareness training for personnel (all of section 8 is training).
  q8_1: '§314.4(e)(1)',
  q8_2: '§314.4(e)(1)',
  q8_3: '§314.4(e)(1)',
  q8_4: '§314.4(e)(1)',
  q8_5: '§314.4(e)(1)',

  // §314.4(d) Test/monitor effectiveness — (d)(2) continuous monitoring OR annual pentest +
  // semiannual vulnerability assessments; tracking/QI review stay at the section element (d).
  q9_1: '§314.4(d)(2)',
  q9_2: '§314.4(d)(2)',
  q9_3: '§314.4(d)(2)',
  q9_4: '§314.4(d)',
  q9_5: '§314.4(d)',
};

// Per-requirement "why it matters / how to fix" — deterministic, authored content (NOT
// generated). One entry per question, grounded in that control's purpose under the Rule.
// Catalog-only (imported by both runtimes + the client); not stored in the DB (Wave 2
// surfaces these in the Dashboard/PDF by joining the global catalog on `code`).
export const REQUIREMENT_GUIDANCE: Record<string, { whyItMatters: string; fix: string }> = {
  q1_1: {
    whyItMatters:
      'The Rule requires a single accountable owner for the security program; without a named Qualified Individual, safeguards go unowned and enforcement gaps go unnoticed.',
    fix: 'Formally designate one qualified person (employee or vendor) to oversee and implement the information security program, and record the appointment.',
  },
  q1_2: {
    whyItMatters:
      'The individual must actually be "qualified" — relevant security knowledge is what makes the program credible rather than a paper exercise.',
    fix: "Document the QI's certifications, training, and relevant experience; if they are thin, add training or engage a qualified provider.",
  },
  q1_3: {
    whyItMatters:
      'Board-level reporting keeps security visible to leadership and supplies the accountability the Rule’s annual QI report depends on.',
    fix: 'Establish a direct reporting line from the QI to the board or owners, and calendar at least an annual written report.',
  },
  q1_4: {
    whyItMatters:
      "A written charter fixes the QI's authority and duties so responsibilities don't blur during an incident or a staffing change.",
    fix: "Put the QI's role, authority, and responsibilities in a short written charter approved by leadership.",
  },
  q1_5: {
    whyItMatters:
      'Security oversight cannot lapse when the QI leaves; an unstaffed QI role means the program stalls.',
    fix: 'Name a backup or a documented succession path so the QI function continues without interruption.',
  },
  q2_1: {
    whyItMatters:
      "The Rule requires the program to be based on a written risk assessment; without one, safeguards aren't tied to documented, real risks.",
    fix: 'Conduct and document a written risk assessment covering every system that handles customer NPI.',
  },
  q2_2: {
    whyItMatters:
      "Safeguards can only address threats you've identified; missing internal or external threats leaves blind spots attackers exploit.",
    fix: 'Expand the risk assessment to enumerate both internal (staff, misconfiguration) and external (hacking, vendor) threats to NPI.',
  },
  q2_3: {
    whyItMatters:
      'Knowing where systems are weak is what turns a risk assessment into an actionable remediation list.',
    fix: 'Assess and document the vulnerabilities in each in-scope system, including gaps in existing controls.',
  },
  q2_4: {
    whyItMatters:
      'Risk changes as systems and threats evolve; a stale assessment misstates today’s exposure.',
    fix: 'Refresh the written risk assessment at least annually and record the date of each review.',
  },
  q2_5: {
    whyItMatters:
      'Major system changes can introduce new risks that a once-a-year cycle would miss until it is too late.',
    fix: 'Trigger a targeted risk reassessment whenever you add, replace, or significantly change systems that touch NPI.',
  },
  q3_1: {
    whyItMatters:
      "You cannot protect data you haven't located; unmapped NPI stores are the ones that get breached.",
    fix: 'Inventory every place customer NPI lives — databases, files, backups, archives, and vendor systems.',
  },
  q3_2: {
    whyItMatters:
      'Data kept longer than needed expands breach exposure with no business benefit, and the Rule requires periodic retention review.',
    fix: 'Adopt a written retention schedule that defines how long each type of NPI is kept and when it is disposed of.',
  },
  q3_3: {
    whyItMatters:
      'NPI shared with third parties is still your responsibility; undocumented sharing hides where your data actually flows.',
    fix: 'Document every third party you share NPI with and the agreement that governs that sharing.',
  },
  q3_4: {
    whyItMatters:
      "NPI that isn't securely destroyed can be recovered from disposed media — a common and avoidable leak.",
    fix: 'Adopt and document a secure disposal procedure for both electronic and paper NPI.',
  },
  q3_5: {
    whyItMatters:
      'Data inventories drift as systems change; an out-of-date inventory silently loses coverage.',
    fix: 'Review and update the NPI data inventory on a set schedule and after significant system changes.',
  },
  q4_1: {
    whyItMatters:
      'Passwords alone are routinely phished or reused; MFA is the single most effective barrier to account takeover of NPI systems, and the Rule requires it.',
    fix: 'Enforce multi-factor authentication for every user and system that can access customer NPI.',
  },
  q4_2: {
    whyItMatters:
      'Broad access means one compromised or malicious account can reach far more NPI than it should.',
    fix: 'Restrict each user to only the data and systems their role requires, and review entitlements.',
  },
  q4_3: {
    whyItMatters:
      'Lingering access for departed staff is a well-known path to unauthorized NPI access.',
    fix: 'Adopt a documented process to revoke all system access immediately when someone leaves or changes roles.',
  },
  q4_4: {
    whyItMatters:
      'Privileged accounts can alter or exfiltrate large amounts of NPI; without logging, that misuse is invisible.',
    fix: 'Monitor and log privileged access so administrative activity can be reviewed and alerted on.',
  },
  q4_5: {
    whyItMatters:
      'Access accumulates over time; periodic review is what catches entitlements that should have been removed.',
    fix: 'Review user access rights at least quarterly and remove anything no longer needed.',
  },
  q5_1: {
    whyItMatters:
      'Encryption at rest renders stolen disks, backups, or database dumps useless to an attacker, and the Rule requires it for stored NPI.',
    fix: 'Encrypt all stored customer NPI with a strong standard such as AES-256.',
  },
  q5_2: {
    whyItMatters:
      'Unencrypted transmission lets NPI be intercepted on the network; TLS protects it in transit.',
    fix: 'Require TLS 1.2 or higher for every connection that carries customer NPI.',
  },
  q5_3: {
    whyItMatters:
      'Encryption is only as strong as its key handling; poorly managed or stale keys undermine the whole control.',
    fix: 'Store encryption keys securely, restrict access to them, and rotate them on a defined schedule.',
  },
  q5_4: {
    whyItMatters:
      'Email is a frequent channel for accidental NPI exposure because it crosses untrusted networks and inboxes.',
    fix: 'Encrypt email that contains NPI, or use a secure portal instead of plain email.',
  },
  q5_5: {
    whyItMatters:
      'Lost or stolen phones and laptops are a common breach cause; device encryption protects the NPI on them.',
    fix: 'Require full-disk/device encryption on any mobile device that can access or store NPI.',
  },
  q6_1: {
    whyItMatters:
      'Vendors handling your NPI extend your attack surface; without contractual security terms you have no enforceable protection.',
    fix: 'Require every vendor contract to specify the security controls the vendor must maintain for your NPI.',
  },
  q6_2: {
    whyItMatters:
      'A vendor secure at signing can degrade over time; periodic assessment is how you catch that.',
    fix: 'Assess the security of critical vendors at least annually based on the risk they present.',
  },
  q6_3: {
    whyItMatters:
      "If a vendor is breached, you can't meet your own notification obligations unless they tell you promptly.",
    fix: 'Require vendors by contract to notify you of a security breach within a defined short window (e.g., 30 days).',
  },
  q6_4: {
    whyItMatters:
      "The DMS holds the largest concentration of customer NPI in a dealership, so its vendor's security is disproportionately important.",
    fix: "Perform and document a security assessment of your DMS vendor's safeguards.",
  },
  q6_5: {
    whyItMatters:
      'Contract terms only protect you if vendors actually follow them; monitoring is what verifies that.',
    fix: 'Establish a process to monitor ongoing vendor compliance with your security requirements.',
  },
  q7_1: {
    whyItMatters:
      'In an incident, an unwritten plan means improvised, slow response that worsens the harm; the Rule requires a written plan.',
    fix: 'Write an incident response plan covering roles, steps, and communications for security events affecting NPI.',
  },
  q7_2: {
    whyItMatters:
      'A plan that has never been exercised usually fails on first real use; testing surfaces gaps while it is still safe.',
    fix: 'Run a tabletop exercise of the IRP at least annually and fix the weaknesses it reveals.',
  },
  q7_3: {
    whyItMatters:
      'Breach notification has deadlines; without a defined procedure you risk missing them and compounding liability.',
    fix: 'Add a breach-notification procedure to the IRP with clear owners and a timeline (e.g., 30 days).',
  },
  q7_4: {
    whyItMatters:
      'When an incident hits, unclear ownership causes delay and dropped steps; defined roles keep response fast and coordinated.',
    fix: "Designate an incident response team and document each member's role and decision authority.",
  },
  q7_5: {
    whyItMatters:
      'An incident log is the evidence trail regulators expect and the input to improving your defenses.',
    fix: 'Maintain a log documenting every security incident, its handling, and its resolution.',
  },
  q8_1: {
    whyItMatters:
      'Staff are the most-targeted attack surface; regular awareness training measurably reduces successful phishing and mishandling.',
    fix: 'Provide security awareness training to all employees at least annually and track completion.',
  },
  q8_2: {
    whyItMatters:
      'Simulated phishing turns training into practice and shows who still needs help before a real attacker finds them.',
    fix: 'Run periodic phishing simulations and use the results to target follow-up training.',
  },
  q8_3: {
    whyItMatters:
      'New employees often receive system access before any security guidance — a risky window.',
    fix: 'Require security training for new hires before or immediately upon granting system access.',
  },
  q8_4: {
    whyItMatters:
      'You must be able to show training actually happened; without records the program is unverifiable.',
    fix: 'Keep records of who completed which training and when.',
  },
  q8_5: {
    whyItMatters:
      'Many breaches start with manipulation rather than malware; staff who recognize social engineering stop those attempts.',
    fix: 'Include social-engineering recognition (pretexting, phone/vendor impersonation) in the training curriculum.',
  },
  q9_1: {
    whyItMatters:
      'Penetration testing reveals exploitable weaknesses before attackers do; the Rule expects it absent effective continuous monitoring.',
    fix: 'Have a qualified third party perform at least annual penetration testing of NPI systems.',
  },
  q9_2: {
    whyItMatters:
      "New vulnerabilities appear constantly; frequent scanning is how you find and patch them before they're exploited.",
    fix: 'Run vulnerability assessments at least every six months (quarterly is stronger) and remediate findings.',
  },
  q9_3: {
    whyItMatters:
      'Continuous monitoring and log aggregation detect attacks in progress; without them, intrusions can go unnoticed for months.',
    fix: 'Deploy continuous monitoring / log aggregation (e.g., a SIEM) over NPI systems.',
  },
  q9_4: {
    whyItMatters:
      "Finding vulnerabilities has no value unless they're fixed; untracked findings quietly persist.",
    fix: 'Track identified vulnerabilities to closure with owners and target dates.',
  },
  q9_5: {
    whyItMatters:
      'Test results must reach the accountable owner to drive action and inform the board report.',
    fix: 'Have the Qualified Individual review penetration test and vulnerability reports and direct remediation.',
  },
};

/** Current catalog version. Bumped to 2 for the per-requirement citation refinement (#5);
 *  the 0009 migration rewrites the seeded citations + version to match. */
export const REQUIREMENT_CATALOG_VERSION = 2;

/** The 45-row requirement catalog, derived from the questionnaire (source of truth). */
export const REQUIREMENT_CATALOG: Requirement[] = SAFEGUARDS_SECTIONS.flatMap((section) =>
  section.questions.map((question) => ({
    code: question.id,
    section: section.number,
    sectionName: section.name,
    title: question.text,
    citation: CITATION_BY_CODE[question.id] ?? CITATION_BY_SECTION[section.number] ?? '',
    weight: question.weight,
    whyItMatters: REQUIREMENT_GUIDANCE[question.id]?.whyItMatters ?? '',
    fix: REQUIREMENT_GUIDANCE[question.id]?.fix ?? '',
    applicability: {},
    version: REQUIREMENT_CATALOG_VERSION,
  })),
);
