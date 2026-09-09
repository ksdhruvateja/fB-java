/**
 * Navigation parent-resolution smoke tests (mirrors src/app/navigation.ts).
 */

function resolveParentFrame(frame) {
  if (frame.role === "homeowner") {
    if (frame.jobId != null) return { ...frame, jobId: null };
    if (frame.tab === "jobs") return { role: "homeowner", tab: "overview" };
    if (frame.tab === "report") {
      if (frame.reportStep === "assessment") {
        if (frame.reportPath === "experts") {
          return { role: "homeowner", tab: "report", reportStep: "experts", reportPath: "experts" };
        }
        return { role: "homeowner", tab: "report", reportStep: "intake", intakePhase: "details", reportPath: frame.reportPath ?? null };
      }
      if (frame.reportStep === "experts") {
        return { role: "homeowner", tab: "report", reportStep: "intake", intakePhase: "details" };
      }
      if (frame.reportStep === "intake" && frame.intakePhase === "details") {
        return { role: "homeowner", tab: "report", reportStep: "intake", intakePhase: "whats" };
      }
      if (frame.reportStep === "intake") return { role: "homeowner", tab: "overview" };
      return { role: "homeowner", tab: "overview" };
    }
    if (frame.tab !== "overview") return { role: "homeowner", tab: "overview" };
    return null;
  }

  if (frame.role === "contractor") {
    if (frame.tab !== "dashboard") return { role: "contractor", tab: "dashboard" };
    return null;
  }

  const f = frame;
  if (f.mobileNav) return { ...f, mobileNav: false };
  if (f.cmdOpen) return { ...f, cmdOpen: false };
  if (f.notifOpen) return { ...f, notifOpen: false };
  if (f.drawerOpen) return { ...f, drawerOpen: false };
  if (f.homeownerRecordFocus) return { ...f, homeownerRecordFocus: null };
  if (f.selectedHomeownerProfileId != null) {
    return { ...f, selectedHomeownerProfileId: null, homeownerRecordFocus: null };
  }
  if (f.expandedContractorId != null) return { ...f, expandedContractorId: null };
  if (f.selectedSupportTicket) return { ...f, selectedSupportTicket: null };
  if (f.selectedJobId != null && (f.tab === "dispatch" || f.tab === "work-queue" || f.tab === "pricing")) {
    return { ...f, selectedJobId: null };
  }
  if (f.tab !== "overview") return { ...f, tab: "overview" };
  return null;
}

function roleHomePage(role) {
  if (role === "contractor") return "contractor-dashboard";
  if (role === "admin") return "admin";
  return "homeowner-dashboard";
}

const tests = [
  {
    name: "homeowner job detail → jobs list",
    frame: { role: "homeowner", tab: "jobs", jobId: 123, jobsSegment: "active" },
    expect: { role: "homeowner", tab: "jobs", jobId: null, jobsSegment: "active" },
  },
  {
    name: "homeowner jobs → overview",
    frame: { role: "homeowner", tab: "jobs", jobId: null },
    expect: { role: "homeowner", tab: "overview" },
  },
  {
    name: "homeowner overview root",
    frame: { role: "homeowner", tab: "overview" },
    expect: null,
  },
  {
    name: "homeowner report intake details → whats",
    frame: { role: "homeowner", tab: "report", reportStep: "intake", intakePhase: "details" },
    expect: { role: "homeowner", tab: "report", reportStep: "intake", intakePhase: "whats" },
  },
  {
    name: "homeowner report step 1 → overview",
    frame: { role: "homeowner", tab: "report", reportStep: "intake", intakePhase: "whats" },
    expect: { role: "homeowner", tab: "overview" },
  },
  {
    name: "contractor jobs → dashboard",
    frame: { role: "contractor", tab: "jobs" },
    expect: { role: "contractor", tab: "dashboard" },
  },
  {
    name: "admin contractor detail → contractors list",
    frame: { role: "admin", tab: "contractors", expandedContractorId: 9 },
    expect: { role: "admin", tab: "contractors", expandedContractorId: null },
  },
  {
    name: "admin homeowners profile → list",
    frame: { role: "admin", tab: "homeowners", selectedHomeownerProfileId: 4 },
    expect: { role: "admin", tab: "homeowners", selectedHomeownerProfileId: null, homeownerRecordFocus: null },
  },
  {
    name: "admin overview root",
    frame: { role: "admin", tab: "overview" },
    expect: null,
  },
  {
    name: "role home routes",
    frame: null,
    expect: {
      homeowner: "homeowner-dashboard",
      contractor: "contractor-dashboard",
      admin: "admin",
    },
    custom: () => ({
      homeowner: roleHomePage("homeowner"),
      contractor: roleHomePage("contractor"),
      admin: roleHomePage("admin"),
    }),
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const got = t.custom ? t.custom() : resolveParentFrame(t.frame);
  const ok = JSON.stringify(got) === JSON.stringify(t.expect);
  if (ok) {
    passed += 1;
    console.log(`PASS  ${t.name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${t.name}`);
    console.error("  expected:", JSON.stringify(t.expect));
    console.error("  got:     ", JSON.stringify(got));
  }
}

console.log(`\n${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
