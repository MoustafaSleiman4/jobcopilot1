import { NextRequest, NextResponse } from "next/server";
import type { StructuredResume } from "@/lib/resume-types";

export const runtime = "nodejs";

export type CertLevel = "beginner" | "intermediate" | "advanced";
export type CertPriority = "high" | "medium" | "low";

export type CertRecommendation = {
  name: string;
  issuer: string;
  category: string;
  level: CertLevel;
  priority: CertPriority;
  estimatedTime: string;
  whyItMatters: string;
  studyUrl: string;
};

type RecommendRequest = {
  resume?: StructuredResume;
  targetRole?: string;
};

// A curated, keyword-matched fallback — used when ANTHROPIC_API_KEY isn't
// set, and as a safety net if a real AI call fails or returns something we
// can't parse as the expected JSON shape. Unlike a generic "demo" string
// (see demoCoverLetter in the sibling route), every entry here is a real,
// verifiable certification with its actual official enrollment/info page —
// getting this wrong would send someone chasing a broken link, so accuracy
// matters even in the fallback path. Matching follows the same
// keyword-classification approach as inferIndustry() in
// app/api/jobs/search/route.ts, reusing similar category buckets so the
// "why it matters" story stays consistent with how jobs are categorized
// elsewhere in the app.
const CATALOG: { keywords: string[]; certs: CertRecommendation[] }[] = [
  {
    keywords: ["engineer", "developer", "software", "devops", "cloud", "backend", "full stack", "it ", "system admin", "infrastructure"],
    certs: [
      {
        name: "AWS Certified Cloud Practitioner",
        issuer: "Amazon Web Services",
        category: "Technology",
        level: "beginner",
        priority: "high",
        estimatedTime: "3-4 weeks",
        whyItMatters:
          "Cloud infrastructure shows up in almost every tech job posting across the Gulf now — this is the fastest, most recognized way to prove baseline cloud fluency even without hands-on AWS experience yet.",
        studyUrl: "https://aws.amazon.com/certification/certified-cloud-practitioner/",
      },
      {
        name: "Microsoft Certified: Azure Fundamentals (AZ-900)",
        issuer: "Microsoft",
        category: "Technology",
        level: "beginner",
        priority: "medium",
        estimatedTime: "2-3 weeks",
        whyItMatters:
          "Many Gulf enterprises and government-linked companies run on Microsoft/Azure rather than AWS — this credential signals you can work in that stack specifically.",
        studyUrl: "https://learn.microsoft.com/en-us/credentials/certifications/azure-fundamentals/",
      },
      {
        name: "CompTIA Security+",
        issuer: "CompTIA",
        category: "Technology",
        level: "intermediate",
        priority: "medium",
        estimatedTime: "6-8 weeks",
        whyItMatters:
          "A widely-required baseline security credential — even for non-security engineering roles, it's often listed as a plus and demonstrates you understand secure coding/deployment practices.",
        studyUrl: "https://www.comptia.org/certifications/security",
      },
    ],
  },
  {
    keywords: ["data", "analyst", "analytics", "bi ", "business intelligence", "sql"],
    certs: [
      {
        name: "Google Data Analytics Professional Certificate",
        issuer: "Google (via Coursera)",
        category: "Data",
        level: "beginner",
        priority: "high",
        estimatedTime: "3-6 months (self-paced)",
        whyItMatters:
          "Directly maps to the SQL/spreadsheets/visualization skills most data-analyst postings screen for, and is one of the most recognized entry credentials for candidates without a formal data degree.",
        studyUrl: "https://www.coursera.org/professional-certificates/google-data-analytics",
      },
      {
        name: "Microsoft Certified: Power BI Data Analyst Associate",
        issuer: "Microsoft",
        category: "Data",
        level: "intermediate",
        priority: "medium",
        estimatedTime: "4-6 weeks",
        whyItMatters:
          "Power BI is the dominant reporting tool in Gulf finance/operations teams — this credential is a fast way to stand out for BI-analyst roles specifically.",
        studyUrl: "https://learn.microsoft.com/en-us/credentials/certifications/power-bi-data-analyst-associate/",
      },
    ],
  },
  {
    keywords: ["marketing", "growth", "seo", "social media", "content", "brand", "digital marketing"],
    certs: [
      {
        name: "Google Ads Search Certification",
        issuer: "Google Skillshop",
        category: "Marketing",
        level: "beginner",
        priority: "high",
        estimatedTime: "1-2 weeks",
        whyItMatters:
          "Free, fast, and the single most commonly requested certification in Gulf digital-marketing job postings — a quick, credible signal you can run paid campaigns.",
        studyUrl: "https://skillshop.exceedlms.com/student/catalog/list?category_ids=53088",
      },
      {
        name: "HubSpot Content Marketing Certification",
        issuer: "HubSpot Academy",
        category: "Marketing",
        level: "beginner",
        priority: "medium",
        estimatedTime: "1 week",
        whyItMatters:
          "Free and well-regarded — strengthens a content/brand-focused resume with a recognized third-party credential in under a week.",
        studyUrl: "https://academy.hubspot.com/courses/content-marketing",
      },
    ],
  },
  {
    keywords: ["finance", "accountant", "audit", "banking", "financial", "investment"],
    certs: [
      {
        name: "CFA Program (Level I)",
        issuer: "CFA Institute",
        category: "Finance & Banking",
        level: "advanced",
        priority: "high",
        estimatedTime: "6+ months",
        whyItMatters:
          "The gold-standard credential for investment/finance roles across Gulf banks — even passing Level I meaningfully strengthens a finance resume.",
        studyUrl: "https://www.cfainstitute.org/programs/cfa-program",
      },
      {
        name: "Certified Management Accountant (CMA)",
        issuer: "IMA (Institute of Management Accountants)",
        category: "Finance & Banking",
        level: "intermediate",
        priority: "medium",
        estimatedTime: "6-12 months",
        whyItMatters:
          "Widely recognized in the Gulf for corporate finance/accounting roles specifically, and often faster to complete than a full CFA track.",
        studyUrl: "https://www.imanet.org/cma-certification",
      },
    ],
  },
  {
    keywords: ["sales", "business development", "account executive", "partnership"],
    certs: [
      {
        name: "HubSpot Inbound Sales Certification",
        issuer: "HubSpot Academy",
        category: "Sales & Business Development",
        level: "beginner",
        priority: "medium",
        estimatedTime: "1 week",
        whyItMatters:
          "Free, quick, and demonstrates modern consultative-selling technique — a solid signal for B2B sales roles common across Gulf tech and SaaS employers.",
        studyUrl: "https://academy.hubspot.com/courses/inbound-sales",
      },
    ],
  },
  {
    keywords: ["operations", "supply chain", "logistics", "procurement", "warehouse", "project manage"],
    certs: [
      {
        name: "Project Management Professional (PMP)",
        issuer: "Project Management Institute (PMI)",
        category: "Operations & Supply Chain",
        level: "advanced",
        priority: "high",
        estimatedTime: "3-6 months",
        whyItMatters:
          "The most recognized project-management credential globally and heavily favored by Gulf employers for operations/PM roles at any seniority above entry-level.",
        studyUrl: "https://www.pmi.org/certifications/project-management-pmp",
      },
      {
        name: "CAPM (Certified Associate in Project Management)",
        issuer: "Project Management Institute (PMI)",
        category: "Operations & Supply Chain",
        level: "beginner",
        priority: "medium",
        estimatedTime: "6-8 weeks",
        whyItMatters:
          "The natural entry point before PMP — no work-experience prerequisite, so it's realistic to earn even early in a career.",
        studyUrl: "https://www.pmi.org/certifications/certified-associate-capm",
      },
    ],
  },
  {
    keywords: ["hr ", "human resources", "recruiter", "talent"],
    certs: [
      {
        name: "SHRM Certified Professional (SHRM-CP)",
        issuer: "Society for Human Resource Management",
        category: "Human Resources",
        level: "intermediate",
        priority: "high",
        estimatedTime: "3-4 months",
        whyItMatters:
          "One of the two most-recognized HR credentials internationally, and increasingly requested in Gulf HR job postings alongside a bachelor's degree.",
        studyUrl: "https://www.shrm.org/credentials/certification",
      },
    ],
  },
  {
    keywords: ["customer support", "customer service", "support specialist"],
    certs: [
      {
        name: "HubSpot Customer Service Certification",
        issuer: "HubSpot Academy",
        category: "Customer Support",
        level: "beginner",
        priority: "medium",
        estimatedTime: "1 week",
        whyItMatters:
          "Free and fast — signals structured customer-service methodology on a resume that might otherwise only show job titles.",
        studyUrl: "https://academy.hubspot.com/courses/customer-service",
      },
    ],
  },
  {
    keywords: ["designer", "ux", "ui ", "graphic", "product design"],
    certs: [
      {
        name: "Google UX Design Professional Certificate",
        issuer: "Google (via Coursera)",
        category: "Design",
        level: "beginner",
        priority: "high",
        estimatedTime: "3-6 months (self-paced)",
        whyItMatters:
          "Builds an actual portfolio alongside the credential, which matters more than the certificate itself for design hiring — a strong pairing for a design-focused resume.",
        studyUrl: "https://www.coursera.org/professional-certificates/google-ux-design",
      },
    ],
  },
];

const GENERIC_FALLBACK: CertRecommendation[] = [
  {
    name: "Google Project Management Professional Certificate",
    issuer: "Google (via Coursera)",
    category: "General",
    level: "beginner",
    priority: "medium",
    estimatedTime: "3-6 months (self-paced)",
    whyItMatters:
      "A broadly useful, widely recognized credential regardless of field — strengthens any resume with structured project-delivery experience.",
    studyUrl: "https://www.coursera.org/professional-certificates/google-project-management",
  },
  {
    name: "LinkedIn Learning: Professional Communication skills paths",
    issuer: "LinkedIn Learning",
    category: "General",
    level: "beginner",
    priority: "low",
    estimatedTime: "1-2 weeks",
    whyItMatters:
      "Fast, low-cost way to add a credential while your resume's core skill set is still taking shape — useful alongside, not instead of, a field-specific certification.",
    studyUrl: "https://www.linkedin.com/learning/",
  },
];

function demoRecommendations(resume: StructuredResume | undefined): CertRecommendation[] {
  const haystack = ` ${(resume?.title || "")} ${(resume?.skills || []).join(" ")} ${(resume?.experience || [])
    .map((e) => e.role)
    .join(" ")} `.toLowerCase();

  const matched = CATALOG.filter((bucket) => bucket.keywords.some((k) => haystack.includes(k))).flatMap(
    (bucket) => bucket.certs
  );

  const already = new Set((resume?.certifications ?? []).map((c) => c.name.toLowerCase().trim()));
  const deduped = (matched.length > 0 ? matched : GENERIC_FALLBACK).filter(
    (c) => !already.has(c.name.toLowerCase().trim())
  );

  return deduped.length > 0 ? deduped : GENERIC_FALLBACK;
}

const SYSTEM_PROMPT = `You are a career-development advisor for job seekers in the Gulf, Levant, and wider MEA region. Given a candidate's resume, recommend certifications that would meaningfully improve their job prospects for their apparent target role.

Rules:
- Recommend 4-8 certifications, ranked by real impact — do not pad the list.
- Every certification must be REAL and CURRENTLY OFFERED — only recommend well-known, verifiable credentials (e.g. AWS/Microsoft/Google certifications, PMI's PMP/CAPM, CFA Institute, SHRM, CompTIA, HubSpot Academy, Coursera Professional Certificates). Never invent a certification name or issuer.
- Do NOT recommend certifications the candidate already lists on their resume.
- studyUrl must be the certification's real official page (the issuing organization's own site, or its official Coursera/edX listing) — never a generic search-results link.
- Vary priority realistically: not everything is "high".
- whyItMatters must be 1-2 sentences, specific to THIS candidate's actual resume content (their apparent seniority, existing skills, target role/industry) — not generic boilerplate that could apply to anyone.

Return ONLY a JSON array (no markdown fences, no commentary) where each item matches exactly:
{"name": string, "issuer": string, "category": string, "level": "beginner"|"intermediate"|"advanced", "priority": "high"|"medium"|"low", "estimatedTime": string, "whyItMatters": string, "studyUrl": string}`;

function isValidRecommendation(v: unknown): v is CertRecommendation {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.name === "string" &&
    typeof r.issuer === "string" &&
    typeof r.category === "string" &&
    (r.level === "beginner" || r.level === "intermediate" || r.level === "advanced") &&
    (r.priority === "high" || r.priority === "medium" || r.priority === "low") &&
    typeof r.estimatedTime === "string" &&
    typeof r.whyItMatters === "string" &&
    typeof r.studyUrl === "string"
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RecommendRequest;
  const { resume, targetRole } = body;

  if (!resume || !resume.fullName) {
    return NextResponse.json({ error: "Missing resume details" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      recommendations: demoRecommendations(resume),
      note: "Demo recommendations — set ANTHROPIC_API_KEY to generate ones tailored by AI to this exact resume.",
    });
  }

  const resumeSummary = `Name: ${resume.fullName}
Title: ${resume.title || ""}
Summary: ${resume.summary || ""}
Skills: ${(resume.skills ?? []).join(", ")}
Experience: ${(resume.experience ?? [])
    .map((e) => `${e.role} at ${e.company} (${e.period}) — ${e.bullets.join("; ")}`)
    .join(" | ")}
Education: ${(resume.education ?? []).map((e) => `${e.degree}, ${e.school} (${e.period})`).join(" | ")}
Existing certifications: ${(resume.certifications ?? []).map((c) => c.name).join(", ") || "none listed"}
${targetRole ? `Target role: ${targetRole}` : ""}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: resumeSummary }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({
        recommendations: demoRecommendations(resume),
        note: "AI generation failed — showing curated recommendations instead.",
      });
    }

    const data = await res.json();
    const raw: string = data.content?.[0]?.text ?? "";
    // Models occasionally wrap JSON in a fenced code block despite being
    // told not to — strip that defensively rather than failing the whole
    // response over formatting.
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({
        recommendations: demoRecommendations(resume),
        note: "Couldn't parse the AI response — showing curated recommendations instead.",
      });
    }

    const list = Array.isArray(parsed) ? parsed.filter(isValidRecommendation) : [];
    if (list.length === 0) {
      return NextResponse.json({
        recommendations: demoRecommendations(resume),
        note: "AI response was empty or malformed — showing curated recommendations instead.",
      });
    }

    return NextResponse.json({ recommendations: list });
  } catch {
    return NextResponse.json({
      recommendations: demoRecommendations(resume),
      note: "AI generation failed — showing curated recommendations instead.",
    });
  }
}
