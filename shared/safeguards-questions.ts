/**
 * FTC Safeguards Rule - 9 Sections
 * Based on 16 CFR Part 314
 * Each section contains real compliance questions
 */

export interface Question {
  id: string;
  text: string;
  weight: "critical" | "important" | "standard";
  type: "yes_no" | "yes_no_partial" | "text";
  hint?: string;
}

export interface Section {
  number: number;
  name: string;
  description: string;
  questions: Question[];
}

export const SAFEGUARDS_SECTIONS: Section[] = [
  {
    number: 1,
    name: "Qualified Individual",
    description:
      "Designation of a Qualified Individual responsible for overseeing and implementing the Safeguards Rule",
    questions: [
      {
        id: "q1_1",
        text: "Has your dealership designated a Qualified Individual (QI) responsible for overseeing information security?",
        weight: "critical",
        type: "yes_no",
        hint: "This person must have authority to implement security measures",
      },
      {
        id: "q1_2",
        text: "Does the QI have documented credentials and qualifications in information security?",
        weight: "important",
        type: "yes_no",
        hint: "Credentials can include certifications, experience, or formal training",
      },
      {
        id: "q1_3",
        text: "Does the QI report directly to the board of directors or equivalent governance body?",
        weight: "critical",
        type: "yes_no",
        hint: "Board reporting ensures accountability and oversight",
      },
      {
        id: "q1_4",
        text: "Is the QI's role and responsibilities documented in writing?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q1_5",
        text: "Does your dealership have a succession plan for the QI position?",
        weight: "standard",
        type: "yes_no",
      },
    ],
  },
  {
    number: 2,
    name: "Risk Assessment",
    description:
      "Written risk assessment identifying data systems, threats, and vulnerabilities",
    questions: [
      {
        id: "q2_1",
        text: "Has your dealership conducted a written risk assessment of all data systems?",
        weight: "critical",
        type: "yes_no",
        hint: "Must document all systems that handle customer NPI",
      },
      {
        id: "q2_2",
        text: "Does the risk assessment identify internal and external threats?",
        weight: "critical",
        type: "yes_no",
      },
      {
        id: "q2_3",
        text: "Has the risk assessment identified vulnerabilities in your systems?",
        weight: "critical",
        type: "yes_no",
      },
      {
        id: "q2_4",
        text: "Is the risk assessment updated at least annually?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q2_5",
        text: "Do you reassess risk when significant system changes occur?",
        weight: "important",
        type: "yes_no",
      },
    ],
  },
  {
    number: 3,
    name: "Data Inventory & Classification",
    description:
      "Comprehensive inventory of all customer NPI data, data flows, and retention policies",
    questions: [
      {
        id: "q3_1",
        text: "Have you documented all locations where customer NPI is stored?",
        weight: "critical",
        type: "yes_no",
        hint: "Include databases, files, backups, and archives",
      },
      {
        id: "q3_2",
        text: "Do you have documented data retention policies for customer information?",
        weight: "critical",
        type: "yes_no",
      },
      {
        id: "q3_3",
        text: "Have you documented all third-party data sharing agreements?",
        weight: "important",
        type: "yes_no",
        hint: "Include service providers, vendors, and partners",
      },
      {
        id: "q3_4",
        text: "Do you have a documented data disposal procedure?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q3_5",
        text: "Is your data inventory reviewed and updated regularly?",
        weight: "standard",
        type: "yes_no",
      },
    ],
  },
  {
    number: 4,
    name: "Access Controls",
    description:
      "Multi-factor authentication, least privilege access, and access revocation procedures",
    questions: [
      {
        id: "q4_1",
        text: "Is multi-factor authentication (MFA) implemented on all systems storing NPI?",
        weight: "critical",
        type: "yes_no_partial",
        hint: "MFA should be required for all user accounts",
      },
      {
        id: "q4_2",
        text: "Do you implement the principle of least privilege for system access?",
        weight: "critical",
        type: "yes_no",
        hint: "Users should only have access to data needed for their role",
      },
      {
        id: "q4_3",
        text: "Do you have a documented procedure for revoking access when employees terminate?",
        weight: "critical",
        type: "yes_no",
      },
      {
        id: "q4_4",
        text: "Is privileged access monitored and logged?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q4_5",
        text: "Are access rights reviewed and updated at least quarterly?",
        weight: "important",
        type: "yes_no",
      },
    ],
  },
  {
    number: 5,
    name: "Encryption",
    description:
      "Encryption at rest for stored NPI and encryption in transit (TLS 1.2+)",
    questions: [
      {
        id: "q5_1",
        text: "Is all customer NPI encrypted at rest using industry-standard encryption?",
        weight: "critical",
        type: "yes_no_partial",
        hint: "AES-256 or equivalent",
      },
      {
        id: "q5_2",
        text: "Is all data transmission using TLS 1.2 or higher?",
        weight: "critical",
        type: "yes_no",
      },
      {
        id: "q5_3",
        text: "Are encryption keys securely managed and rotated regularly?",
        weight: "critical",
        type: "yes_no",
      },
      {
        id: "q5_4",
        text: "Is email containing NPI encrypted end-to-end?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q5_5",
        text: "Are mobile devices accessing NPI encrypted?",
        weight: "important",
        type: "yes_no",
      },
    ],
  },
  {
    number: 6,
    name: "Vendor & Third-Party Management",
    description:
      "Written vendor contracts with security requirements, annual security reviews",
    questions: [
      {
        id: "q6_1",
        text: "Do all vendor contracts include written security requirements?",
        weight: "critical",
        type: "yes_no",
        hint: "Contracts should specify data protection obligations",
      },
      {
        id: "q6_2",
        text: "Do you conduct annual security assessments of critical vendors?",
        weight: "critical",
        type: "yes_no",
      },
      {
        id: "q6_3",
        text: "Do vendor contracts require breach notification within 30 days?",
        weight: "critical",
        type: "yes_no",
      },
      {
        id: "q6_4",
        text: "Have you assessed the security practices of your DMS vendor?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q6_5",
        text: "Do you have a process to monitor vendor compliance with security requirements?",
        weight: "important",
        type: "yes_no",
      },
    ],
  },
  {
    number: 7,
    name: "Incident Response Plan",
    description:
      "Written IRP tested via tabletop exercise, breach notification procedure (30-day FTC requirement)",
    questions: [
      {
        id: "q7_1",
        text: "Do you have a written Incident Response Plan (IRP)?",
        weight: "critical",
        type: "yes_no",
        hint: "IRP should document roles, procedures, and communication plan",
      },
      {
        id: "q7_2",
        text: "Has your IRP been tested via tabletop exercise in the last 12 months?",
        weight: "critical",
        type: "yes_no",
      },
      {
        id: "q7_3",
        text: "Does your IRP include a breach notification procedure with 30-day timeline?",
        weight: "critical",
        type: "yes_no",
        hint: "FTC requires notification within 30 days of discovery",
      },
      {
        id: "q7_4",
        text: "Is there a designated incident response team with clear roles?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q7_5",
        text: "Do you maintain an incident log documenting all security incidents?",
        weight: "important",
        type: "yes_no",
      },
    ],
  },
  {
    number: 8,
    name: "Employee Training",
    description:
      "Annual security awareness training, phishing simulations, new hire onboarding",
    questions: [
      {
        id: "q8_1",
        text: "Do all employees receive annual security awareness training?",
        weight: "critical",
        type: "yes_no",
        hint: "Training should cover phishing, password security, data handling",
      },
      {
        id: "q8_2",
        text: "Do you conduct phishing simulations to test employee awareness?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q8_3",
        text: "Are new employees trained on security policies before accessing systems?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q8_4",
        text: "Do you maintain records of employee training completion?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q8_5",
        text: "Is social engineering awareness included in training?",
        weight: "standard",
        type: "yes_no",
      },
    ],
  },
  {
    number: 9,
    name: "Penetration Testing & Monitoring",
    description:
      "Annual penetration testing, quarterly vulnerability assessments, continuous monitoring",
    questions: [
      {
        id: "q9_1",
        text: "Has your dealership conducted an annual penetration test?",
        weight: "critical",
        type: "yes_no",
        hint: "By qualified third party",
      },
      {
        id: "q9_2",
        text: "Do you conduct quarterly vulnerability assessments?",
        weight: "critical",
        type: "yes_no",
      },
      {
        id: "q9_3",
        text: "Do you have continuous monitoring and log aggregation in place?",
        weight: "critical",
        type: "yes_no_partial",
        hint: "SIEM or equivalent log monitoring",
      },
      {
        id: "q9_4",
        text: "Do you track and remediate identified vulnerabilities?",
        weight: "important",
        type: "yes_no",
      },
      {
        id: "q9_5",
        text: "Are penetration test and vulnerability assessment reports reviewed by QI?",
        weight: "important",
        type: "yes_no",
      },
    ],
  },
];

export function getSectionByNumber(number: number): Section | undefined {
  return SAFEGUARDS_SECTIONS.find((s) => s.number === number);
}

export function getAllQuestions(): Question[] {
  return SAFEGUARDS_SECTIONS.flatMap((s) => s.questions);
}
