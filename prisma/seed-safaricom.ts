/**
 * seed-safaricom.ts
 * Run: npx tsx prisma/seed-safaricom.ts
 *
 * Creates:
 *  - 1 HR_MANAGER user linked to Safaricom PLC
 *  - ~60 additional Safaricom members (all three tiers, with dependents)
 *  - Endorsements in various statuses
 *  - Service requests (open + resolved)
 *  - Activity log entries
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

// ── helpers ───────────────────────────────────────────────────────────────────
const dob = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const ago = (days: number) => { const dt = new Date(); dt.setDate(dt.getDate() - days); return dt; };

async function nextMemberNum(): Promise<number> {
  const last = await prisma.member.findFirst({
    where: { memberNumber: { startsWith: "AVH-" } },
    orderBy: { memberNumber: "desc" },
    select: { memberNumber: true },
  });
  if (!last) return 1001;
  const n = parseInt(last.memberNumber.split("-").pop() ?? "0", 10);
  return n + 1;
}

async function main() {
  console.log("🌱 Safaricom top-up seed starting…");

  // ── 1. Resolve tenant & Safaricom group ─────────────────────────────────────
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: "avenue" } });
  const tenantId = tenant.id;

  const safaricom = await prisma.group.findFirstOrThrow({
    where: { tenantId, name: "Safaricom PLC" },
  });
  const groupId = safaricom.id;

  // ── 2. Resolve benefit tiers ─────────────────────────────────────────────────
  const tiers = await prisma.groupBenefitTier.findMany({
    where: { groupId },
    orderBy: { createdAt: "asc" },
  });
  const execTier = tiers[0];
  const mgmtTier = tiers[1];
  const staffTier = tiers[2];

  // ── 3. Resolve packages ───────────────────────────────────────────────────────
  const execPkg    = await prisma.packageVersion.findFirstOrThrow({ where: { package: { name: "Avenue Executive" } }, include: { package: true } });
  const premierPkg = await prisma.packageVersion.findFirstOrThrow({ where: { package: { name: "Avenue Premier"   } }, include: { package: true } });
  const essentialPkg = await prisma.packageVersion.findFirstOrThrow({ where: { package: { name: "Avenue Essential" } }, include: { package: true } });

  // ── 4. HR_MANAGER user ────────────────────────────────────────────────────────
  const pw = await bcrypt.hash("AvenueAdmin2024!", 10);

  const existing = await prisma.user.findFirst({
    where: { tenantId, email: "emily.wambui@safaricom.co.ke" },
  });
  const hrUser = existing ?? await prisma.user.create({
    data: {
      tenantId,
      email: "emily.wambui@safaricom.co.ke",
      firstName: "Emily",
      lastName: "Wambui",
      role: "HR_MANAGER",
      passwordHash: pw,
      isActive: true,
      groupId,
    },
  });
  console.log(`✅ HR user: ${hrUser.email}`);

  // ── 5. Members ────────────────────────────────────────────────────────────────
  let num = await nextMemberNum();
  const mn = () => `AVH-2024-${String(num++).padStart(5, "0")}`;

  const mk = (data: object) =>
    prisma.member.create({ data: data as never, select: { id: true } });

  // Helper to check if member exists before creating
  const mkIfNew = async (firstName: string, lastName: string, data: object) => {
    const ex = await prisma.member.findFirst({ where: { tenantId, firstName, lastName, groupId } });
    if (ex) return ex;
    return mk(data);
  };

  const base = { tenantId, groupId, status: "ACTIVE" as const };
  const exec = { packageId: execPkg.packageId, packageVersionId: execPkg.id, benefitTierId: execTier?.id };
  const mgmt = { packageId: premierPkg.packageId, packageVersionId: premierPkg.id, benefitTierId: mgmtTier?.id };
  const staff = { packageId: essentialPkg.packageId, packageVersionId: essentialPkg.id, benefitTierId: staffTier?.id };

  console.log("  Creating Executive tier members…");

  // Executive tier — CFO + spouse + 2 children
  const cfo = await mkIfNew("Amara", "Njogu", {
    ...base, ...exec, memberNumber: mn(),
    firstName: "Amara", lastName: "Njogu", gender: "FEMALE", dateOfBirth: dob(1972, 4, 8),
    relationship: "PRINCIPAL", enrollmentDate: ago(400), activationDate: ago(395), idNumber: "20100001", phone: "+254711001001", email: "a.njogu@safaricom.co.ke",
  });
  const cfoSpouse = await mkIfNew("David", "Njogu", {
    ...base, ...exec, memberNumber: mn(),
    firstName: "David", lastName: "Njogu", gender: "MALE", dateOfBirth: dob(1970, 6, 15),
    relationship: "SPOUSE", principalId: cfo.id, enrollmentDate: ago(400), activationDate: ago(395), idNumber: "18500002",
  });
  void cfoSpouse;
  await mkIfNew("Sophie", "Njogu", {
    ...base, ...exec, memberNumber: mn(),
    firstName: "Sophie", lastName: "Njogu", gender: "FEMALE", dateOfBirth: dob(2005, 2, 20),
    relationship: "CHILD", principalId: cfo.id, enrollmentDate: ago(400), activationDate: ago(395),
  });
  await mkIfNew("Elijah", "Njogu", {
    ...base, ...exec, memberNumber: mn(),
    firstName: "Elijah", lastName: "Njogu", gender: "MALE", dateOfBirth: dob(2008, 9, 3),
    relationship: "CHILD", principalId: cfo.id, enrollmentDate: ago(400), activationDate: ago(395),
  });

  // CTO
  const cto = await mkIfNew("Samuel", "Kariuki", {
    ...base, ...exec, memberNumber: mn(),
    firstName: "Samuel", lastName: "Kariuki", gender: "MALE", dateOfBirth: dob(1974, 11, 30),
    relationship: "PRINCIPAL", enrollmentDate: ago(400), activationDate: ago(395), idNumber: "20200003", phone: "+254711002002", email: "s.kariuki@safaricom.co.ke",
  });
  await mkIfNew("Ruth", "Kariuki", {
    ...base, ...exec, memberNumber: mn(),
    firstName: "Ruth", lastName: "Kariuki", gender: "FEMALE", dateOfBirth: dob(1978, 3, 12),
    relationship: "SPOUSE", principalId: cto.id, enrollmentDate: ago(400), activationDate: ago(395),
  });
  await mkIfNew("Caleb", "Kariuki", {
    ...base, ...exec, memberNumber: mn(),
    firstName: "Caleb", lastName: "Kariuki", gender: "MALE", dateOfBirth: dob(2003, 7, 25),
    relationship: "CHILD", principalId: cto.id, enrollmentDate: ago(400), activationDate: ago(395),
  });

  // CMO
  const cmo = await mkIfNew("Naomi", "Waweru", {
    ...base, ...exec, memberNumber: mn(),
    firstName: "Naomi", lastName: "Waweru", gender: "FEMALE", dateOfBirth: dob(1976, 8, 22),
    relationship: "PRINCIPAL", enrollmentDate: ago(400), activationDate: ago(395), idNumber: "20300004", phone: "+254711003003", email: "n.waweru@safaricom.co.ke",
  });
  await mkIfNew("James", "Waweru", {
    ...base, ...exec, memberNumber: mn(),
    firstName: "James", lastName: "Waweru", gender: "MALE", dateOfBirth: dob(1974, 5, 17),
    relationship: "SPOUSE", principalId: cmo.id, enrollmentDate: ago(400), activationDate: ago(395),
  });

  console.log("  Creating Management tier members…");

  // Management tier — 8 principals with families
  const mgrs = [
    { fn: "Peter",   ln: "Otieno",   g: "MALE",   dob_: dob(1983, 6, 10), id: "22100001", ph: "+254722001001", em: "p.otieno@safaricom.co.ke",
      spouse: { fn: "Lucy",    ln: "Otieno",   g: "FEMALE", dob_: dob(1985, 3, 22) },
      kids: [{ fn: "Ian",   ln: "Otieno", g: "MALE", dob_: dob(2010, 1, 15) }] },
    { fn: "Grace",   ln: "Muriithi", g: "FEMALE", dob_: dob(1985, 2, 28), id: "22200002", ph: "+254722002002", em: "g.muriithi@safaricom.co.ke",
      spouse: { fn: "John",    ln: "Muriithi", g: "MALE",   dob_: dob(1982, 9, 5)  },
      kids: [{ fn: "Faith", ln: "Muriithi", g: "FEMALE", dob_: dob(2012, 6, 3) }, { fn: "Abel", ln: "Muriithi", g: "MALE", dob_: dob(2015, 11, 20) }] },
    { fn: "Moses",   ln: "Kamau",    g: "MALE",   dob_: dob(1980, 12, 1), id: "22300003", ph: "+254722003003", em: "m.kamau@safaricom.co.ke",
      spouse: null, kids: [] },
    { fn: "Judith",  ln: "Ochieng",  g: "FEMALE", dob_: dob(1987, 7, 19), id: "22400004", ph: "+254722004004", em: "j.ochieng@safaricom.co.ke",
      spouse: { fn: "Victor",  ln: "Ochieng",  g: "MALE",   dob_: dob(1984, 4, 30) },
      kids: [{ fn: "Zoe", ln: "Ochieng", g: "FEMALE", dob_: dob(2014, 8, 12) }] },
    { fn: "Patrick", ln: "Ndungu",   g: "MALE",   dob_: dob(1982, 4, 5),  id: "22500005", ph: "+254722005005", em: "p.ndungu@safaricom.co.ke",
      spouse: { fn: "Ann",     ln: "Ndungu",   g: "FEMALE", dob_: dob(1985, 11, 14) },
      kids: [] },
    { fn: "Caroline",ln: "Mwenda",   g: "FEMALE", dob_: dob(1986, 9, 25), id: "22600006", ph: "+254722006006", em: "c.mwenda@safaricom.co.ke",
      spouse: null, kids: [{ fn: "Liam", ln: "Mwenda", g: "MALE", dob_: dob(2016, 3, 7) }] },
    { fn: "Francis", ln: "Kiprop",   g: "MALE",   dob_: dob(1981, 3, 14), id: "22700007", ph: "+254722007007", em: "f.kiprop@safaricom.co.ke",
      spouse: { fn: "Beatrice", ln: "Kiprop",  g: "FEMALE", dob_: dob(1983, 7, 29) },
      kids: [{ fn: "Noah", ln: "Kiprop", g: "MALE", dob_: dob(2009, 5, 18) }, { fn: "Ella", ln: "Kiprop", g: "FEMALE", dob_: dob(2013, 2, 25) }] },
    { fn: "Angela",  ln: "Aluoch",   g: "FEMALE", dob_: dob(1984, 1, 9),  id: "22800008", ph: "+254722008008", em: "a.aluoch@safaricom.co.ke",
      spouse: { fn: "Clive",   ln: "Aluoch",   g: "MALE",   dob_: dob(1981, 10, 3) },
      kids: [] },
  ];

  const mgr_ids: string[] = [];
  for (const m of mgrs) {
    const pri = await mkIfNew(m.fn, m.ln, {
      ...base, ...mgmt, memberNumber: mn(),
      firstName: m.fn, lastName: m.ln, gender: m.g, dateOfBirth: m.dob_,
      relationship: "PRINCIPAL", enrollmentDate: ago(380), activationDate: ago(375),
      idNumber: m.id, phone: m.ph, email: m.em,
    });
    mgr_ids.push(pri.id);
    if (m.spouse) {
      await mkIfNew(m.spouse.fn, m.spouse.ln, {
        ...base, ...mgmt, memberNumber: mn(),
        firstName: m.spouse.fn, lastName: m.spouse.ln, gender: m.spouse.g, dateOfBirth: m.spouse.dob_,
        relationship: "SPOUSE", principalId: pri.id, enrollmentDate: ago(380), activationDate: ago(375),
      });
    }
    for (const k of m.kids) {
      await mkIfNew(k.fn, k.ln, {
        ...base, ...mgmt, memberNumber: mn(),
        firstName: k.fn, lastName: k.ln, gender: k.g, dateOfBirth: k.dob_,
        relationship: "CHILD", principalId: pri.id, enrollmentDate: ago(380), activationDate: ago(375),
      });
    }
  }

  console.log("  Creating Staff tier members…");

  // Staff tier — 18 principals, some with dependents, varied statuses
  const staff_defs = [
    { fn: "Brian",    ln: "Achola",   g: "MALE",   dob_: dob(1993, 5, 12), status: "ACTIVE",              spouse: { fn: "Joy",     ln: "Achola",   g: "FEMALE", dob_: dob(1995, 8, 3)  } },
    { fn: "Nancy",    ln: "Chepkorir",g: "FEMALE", dob_: dob(1996, 11, 4), status: "ACTIVE",              spouse: null },
    { fn: "Timothy",  ln: "Mutiso",   g: "MALE",   dob_: dob(1991, 1, 20), status: "ACTIVE",              spouse: { fn: "Mercy",   ln: "Mutiso",   g: "FEMALE", dob_: dob(1993, 6, 15) } },
    { fn: "Esther",   ln: "Moraa",    g: "FEMALE", dob_: dob(1994, 7, 8),  status: "ACTIVE",              spouse: null },
    { fn: "Dennis",   ln: "Kiprotich",g: "MALE",   dob_: dob(1990, 3, 27), status: "ACTIVE",              spouse: null },
    { fn: "Phoebe",   ln: "Awino",    g: "FEMALE", dob_: dob(1997, 9, 16), status: "ACTIVE",              spouse: null },
    { fn: "Collins",  ln: "Rotich",   g: "MALE",   dob_: dob(1988, 12, 5), status: "SUSPENDED",           spouse: { fn: "Helen",   ln: "Rotich",   g: "FEMALE", dob_: dob(1990, 4, 22) } },
    { fn: "Lydia",    ln: "Gichuru",  g: "FEMALE", dob_: dob(1995, 6, 18), status: "ACTIVE",              spouse: null },
    { fn: "Edwin",    ln: "Onyango",  g: "MALE",   dob_: dob(1992, 2, 9),  status: "ACTIVE",              spouse: null },
    { fn: "Rose",     ln: "Kiptoo",   g: "FEMALE", dob_: dob(1999, 10, 3), status: "PENDING_ACTIVATION",  spouse: null },
    { fn: "Derrick",  ln: "Barasa",   g: "MALE",   dob_: dob(1994, 4, 14), status: "ACTIVE",              spouse: { fn: "Clara",   ln: "Barasa",   g: "FEMALE", dob_: dob(1996, 12, 1) } },
    { fn: "Hannah",   ln: "Nyambura", g: "FEMALE", dob_: dob(1993, 8, 25), status: "ACTIVE",              spouse: null },
    { fn: "Victor",   ln: "Lagat",    g: "MALE",   dob_: dob(1991, 7, 7),  status: "ACTIVE",              spouse: null },
    { fn: "Irene",    ln: "Wambua",   g: "FEMALE", dob_: dob(1996, 3, 31), status: "ACTIVE",              spouse: null },
    { fn: "Charles",  ln: "Mulwa",    g: "MALE",   dob_: dob(1989, 11, 22),status: "LAPSED",              spouse: null },
    { fn: "Pauline",  ln: "Cheruiyot",g: "FEMALE", dob_: dob(1997, 6, 10), status: "ACTIVE",              spouse: null },
    { fn: "George",   ln: "Aoko",     g: "MALE",   dob_: dob(1990, 1, 5),  status: "ACTIVE",              spouse: { fn: "Brenda",  ln: "Aoko",     g: "FEMALE", dob_: dob(1992, 9, 18) } },
    { fn: "Viola",    ln: "Nekesa",   g: "FEMALE", dob_: dob(1998, 5, 28), status: "ACTIVE",              spouse: null },
  ];

  const staff_ids: string[] = [];
  for (const s of staff_defs) {
    const pri = await mkIfNew(s.fn, s.ln, {
      ...base, ...staff, memberNumber: mn(),
      firstName: s.fn, lastName: s.ln, gender: s.g, dateOfBirth: s.dob_,
      relationship: "PRINCIPAL", status: s.status,
      enrollmentDate: ago(300 + Math.floor(Math.random() * 60)),
      activationDate: s.status === "PENDING_ACTIVATION" ? undefined : ago(295 + Math.floor(Math.random() * 60)),
    });
    staff_ids.push(pri.id);
    if (s.spouse) {
      await mkIfNew(s.spouse.fn, s.spouse.ln, {
        ...base, ...staff, memberNumber: mn(),
        firstName: s.spouse.fn, lastName: s.spouse.ln, gender: s.spouse.g, dateOfBirth: s.spouse.dob_,
        relationship: "SPOUSE", principalId: pri.id,
        enrollmentDate: ago(300), activationDate: ago(295),
        status: s.status,
      });
    }
  }

  const totalSaf = await prisma.member.count({ where: { groupId } });
  console.log(`✅ Safaricom members now: ${totalSaf}`);

  // ── 6. Endorsements ───────────────────────────────────────────────────────────
  const existingEnd = await prisma.endorsement.count({ where: { groupId } });

  if (existingEnd < 5) {
    const adminUser = await prisma.user.findFirst({ where: { tenantId, role: "SUPER_ADMIN" } });
    const adminId = adminUser?.id ?? hrUser.id;
    let endNum = 1;
    const endMn = () => `END-SAF-${String(endNum++).padStart(4, "0")}`;

    const endorsementDefs = [
      {
        endorsementNumber: endMn(), type: "MEMBER_ADDITION" as const, status: "SUBMITTED" as const,
        effectiveDate: ago(-14), requestedDate: ago(3),
        changeDetails: { firstName: "Alex", lastName: "Otieno", relationship: "PRINCIPAL", dateOfBirth: "1995-06-20", gender: "MALE", notes: "New hire starting 1 May 2025 — software engineer joining Infra team." },
        requestedBy: hrUser.id,
      },
      {
        endorsementNumber: endMn(), type: "MEMBER_ADDITION" as const, status: "SUBMITTED" as const,
        effectiveDate: ago(-7), requestedDate: ago(2),
        changeDetails: { firstName: "Tracy", lastName: "Githinji", relationship: "PRINCIPAL", dateOfBirth: "1992-03-15", gender: "FEMALE", notes: "Transferred from Mombasa branch, effective immediately." },
        requestedBy: hrUser.id,
      },
      {
        endorsementNumber: endMn(), type: "MEMBER_DELETION" as const, status: "UNDER_REVIEW" as const,
        effectiveDate: ago(7), requestedDate: ago(14),
        memberId: staff_ids[6],
        changeDetails: { reason: "Resignation — last working day 31 March 2025" },
        requestedBy: hrUser.id,
      },
      {
        endorsementNumber: endMn(), type: "MEMBER_DELETION" as const, status: "APPROVED" as const,
        effectiveDate: ago(30), requestedDate: ago(45),
        memberId: staff_ids[14],
        changeDetails: { reason: "Termination — redundancy, Q1 restructuring." },
        requestedBy: hrUser.id,
        reviewedBy: adminId, reviewedAt: ago(40),
        appliedBy: adminId, appliedAt: ago(38),
      },
      {
        endorsementNumber: endMn(), type: "MEMBER_ADDITION" as const, status: "APPROVED" as const,
        effectiveDate: ago(90), requestedDate: ago(100),
        memberId: mgr_ids[0],
        changeDetails: { firstName: "Peter", lastName: "Otieno", relationship: "PRINCIPAL", tier: "Management" },
        requestedBy: hrUser.id,
        reviewedBy: adminId, reviewedAt: ago(96),
        appliedBy: adminId, appliedAt: ago(94),
      },
      {
        endorsementNumber: endMn(), type: "MEMBER_ADDITION" as const, status: "REJECTED" as const,
        effectiveDate: ago(60), requestedDate: ago(70),
        changeDetails: { firstName: "John", lastName: "Doe", relationship: "PRINCIPAL", dateOfBirth: "1985-01-01", gender: "MALE" },
        requestedBy: hrUser.id,
        reviewedBy: adminId, reviewedAt: ago(65),
        rejectionReason: "Identity document number does not match payroll records. Please resubmit with correct ID.",
      },
    ];

    for (const e of endorsementDefs) {
      await prisma.endorsement.create({
        data: {
          tenantId,
          groupId,
          endorsementNumber: e.endorsementNumber,
          type: e.type,
          status: e.status,
          effectiveDate: e.effectiveDate,
          requestedDate: e.requestedDate,
          memberId: e.memberId ?? null,
          changeDetails: e.changeDetails,
          requestedBy: e.requestedBy,
          reviewedBy: (e as { reviewedBy?: string }).reviewedBy ?? null,
          reviewedAt: (e as { reviewedAt?: Date }).reviewedAt ?? null,
          appliedBy: (e as { appliedBy?: string }).appliedBy ?? null,
          appliedAt: (e as { appliedAt?: Date }).appliedAt ?? null,
          rejectionReason: (e as { rejectionReason?: string }).rejectionReason ?? null,
        },
      });
    }
    console.log(`✅ Endorsements: ${endorsementDefs.length}`);
  } else {
    console.log(`✅ Endorsements: already seeded (${existingEnd})`);
  }

  // ── 7. Service Requests ───────────────────────────────────────────────────────
  const existingSR = await prisma.serviceRequest.count({ where: { groupId } });

  if (existingSR < 3) {
    const adminUser = await prisma.user.findFirst({ where: { tenantId, role: "CUSTOMER_SERVICE" } });
    const csId = adminUser?.id;

    const srDefs = [
      {
        subject: "Member card not received — Amara Njogu (AVH-2024-01001)",
        category: "CARD_REQUEST" as const, priority: "NORMAL" as const, status: "OPEN" as const,
        body: "Our CFO, Amara Njogu, enrolled in January and has not yet received a physical membership card. She travels frequently and requires the card for overseas claims. Please expedite.",
        createdAt: ago(5),
      },
      {
        subject: "Clarification on outpatient limit utilisation for Management tier",
        category: "BENEFIT_QUERY" as const, priority: "HIGH" as const, status: "IN_PROGRESS" as const,
        body: "We have received queries from several managers about the outpatient sub-limits under the Premier package. Specifically, whether dental and optical are carved out of the KES 300k outpatient limit or run separately. Please clarify in writing so we can communicate accurately to staff.",
        createdAt: ago(12),
      },
      {
        subject: "Invoice INV-SAF-2024-03 — query on member count",
        category: "INVOICE_QUERY" as const, priority: "NORMAL" as const, status: "RESOLVED" as const,
        body: "The March 2024 invoice lists 82 members but our payroll shows 79 active staff on scheme as at 1 March. Please reconcile and issue a credit note if applicable.",
        response: "Thank you for your query. We have reviewed the March invoice and confirmed that 3 members were in a grace period following late termination requests submitted in February. A credit note for KES 7,500 has been issued against your next invoice. Please see attached reconciliation.",
        respondedAt: ago(8),
        respondedById: csId ?? hrUser.id,
        createdAt: ago(20),
      },
      {
        subject: "New hire bulk addition — April 2025 intake (12 staff)",
        category: "MEMBER_QUERY" as const, priority: "HIGH" as const, status: "OPEN" as const,
        body: "We have 12 new hires joining on 1 May 2025 across Engineering and Sales departments. The bulk import CSV is attached. Please confirm receipt and estimated activation timeline. All are Staff tier.",
        createdAt: ago(1),
      },
    ];

    for (const sr of srDefs) {
      await prisma.serviceRequest.create({
        data: {
          tenantId,
          groupId,
          submittedById: hrUser.id,
          subject: sr.subject,
          category: sr.category,
          priority: sr.priority,
          status: sr.status,
          body: sr.body,
          response: sr.response ?? null,
          respondedAt: sr.respondedAt ?? null,
          respondedById: sr.respondedById ?? null,
          createdAt: sr.createdAt,
        },
      });
    }
    console.log(`✅ Service requests: ${srDefs.length}`);
  } else {
    console.log(`✅ Service requests: already seeded (${existingSR})`);
  }

  // ── 8. Activity log entries ───────────────────────────────────────────────────
  const existingLogs = await prisma.activityLog.count({ where: { groupId } });

  if (existingLogs < 5) {
    const logDefs = [
      { action: "MEMBER_ACTIVATED",      description: "Member Amara Njogu activated.",                          createdAt: ago(395) },
      { action: "MEMBER_ACTIVATED",      description: "Management tier batch (8 principals) activated.",        createdAt: ago(375) },
      { action: "ENDORSEMENT_SUBMITTED", description: "Endorsement END-SAF-0001 submitted — Alex Otieno.",      createdAt: ago(3)   },
      { action: "ENDORSEMENT_APPROVED",  description: "Endorsement END-SAF-0005 approved — Peter Otieno.",      createdAt: ago(94)  },
      { action: "ENDORSEMENT_REJECTED",  description: "Endorsement END-SAF-0006 rejected — ID mismatch.",       createdAt: ago(64)  },
      { action: "MEMBER_SUSPENDED",      description: "Collins Rotich suspended pending termination.",           createdAt: ago(14)  },
    ];

    for (const log of logDefs) {
      await prisma.activityLog.create({
        data: {
          groupId,
          action: log.action,
          description: log.description,
          createdAt: log.createdAt,
          entityType: "GROUP",
          entityId: groupId,
        },
      });
    }
    console.log(`✅ Activity log: ${logDefs.length} entries`);
  } else {
    console.log(`✅ Activity log: already seeded (${existingLogs})`);
  }

  console.log("\n🎉 Safaricom top-up complete!");
  console.log("   HR Login: emily.wambui@safaricom.co.ke / AvenueAdmin2024!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
