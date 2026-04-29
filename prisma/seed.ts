import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import bcrypt from 'bcryptjs'
import { GLService } from '../src/server/services/gl.service'

async function main() {
  console.log('🌱 Starting comprehensive seed...')

  // ═══════════════════════════════════════════════════════════
  // 1. TENANT
  // ═══════════════════════════════════════════════════════════
  const tenant = await prisma.tenant.upsert({
    where:  { slug: 'avenue' },
    update: {},
    create: {
      name: 'Avenue Healthcare', slug: 'avenue',
      primaryColor: '#292A83', accentColor: '#435BA1', warmColor: '#F5C6B6',
      fontHeading: 'Quicksand', fontBody: 'Lato', config: {},
    },
  })
  console.log(`✅ Tenant: ${tenant.name}`)
  const tenantId = tenant.id
  // ═══════════════════════════════════════════════════════════
  // 1b. BENEFIT RIDERS & TAXES
  // ═══════════════════════════════════════════════════════════
  const riders = [
    { code: 'IP-HIV', description: 'Inpatient HIV/AIDS', type: 'INPATIENT' },
    { code: 'IP-DIALY', description: 'Inpatient Dialysis', type: 'INPATIENT' },
    { code: 'IP-EVAC', description: 'Inpatient Evacuation', type: 'INPATIENT' },
    { code: 'IP-CONG', description: 'Inpatient Congenital', type: 'INPATIENT' },
    { code: 'IP-PC', description: 'Inpatient Palliative Care', type: 'INPATIENT' },
    { code: 'IP-GYNA', description: 'Inpatient Gynaecology', type: 'INPATIENT' },
    { code: 'IP-MAT', description: 'Inpatient Maternity', type: 'INPATIENT' },
    { code: 'IP-OPTH', description: 'Inpatient Ophthalmology', type: 'INPATIENT' },
    { code: 'IP-PERNATL', description: 'Inpatient Perinatal', type: 'INPATIENT' },
    { code: 'IP-PHSP', description: 'Inpatient Physiotherapy', type: 'INPATIENT' },
    { code: 'IP-CA', description: 'Inpatient Cancer', type: 'INPATIENT' },
    { code: 'IP-PSYC', description: 'Inpatient Psychiatry', type: 'INPATIENT' },
    { code: 'IP-CS', description: 'Inpatient Caesarean Section', type: 'INPATIENT' },
    { code: 'OP-DNTL', description: 'Outpatient Dental', type: 'OUTPATIENT' },
    { code: 'OP-OPTC', description: 'Outpatient Optical', type: 'OUTPATIENT' },
    { code: 'OP-GYNA', description: 'Outpatient Gynaecology', type: 'OUTPATIENT' },
    { code: 'OP-HIV', description: 'Outpatient HIV/AIDS', type: 'OUTPATIENT' },
    { code: 'OP-CA', description: 'Outpatient Cancer', type: 'OUTPATIENT' },
    { code: 'OP-CONG', description: 'Outpatient Congenital', type: 'OUTPATIENT' },
    { code: 'OP-EVAC', description: 'Outpatient Evacuation', type: 'OUTPATIENT' },
    { code: 'OP-MAT', description: 'Outpatient Maternity', type: 'OUTPATIENT' },
    { code: 'OP-MER', description: 'Outpatient Medical Exam', type: 'OUTPATIENT' },
    { code: 'OP-PC', description: 'Outpatient Palliative Care', type: 'OUTPATIENT' },
    { code: 'OP-PSYC', description: 'Outpatient Psychiatry', type: 'OUTPATIENT' },
    { code: 'OP-VACC', description: 'Outpatient Vaccination', type: 'OUTPATIENT' },
    { code: 'OP-FUNERAL', description: 'Outpatient Funeral', type: 'OUTPATIENT' },
  ];
  for (const r of riders) {
    await prisma.benefitRider.upsert({
      where: { code: r.code },
      update: {},
      create: { ...r, isActive: true },
    });
  }
  console.log(`✅ Benefit Riders: ${riders.length}`);

  const taxes = [
    { taxType: 'STAMP_DUTY' as const, flatAmount: 40, percentage: null },
    { taxType: 'TRAINING_LEVY' as const, flatAmount: null, percentage: 0.002 },
    { taxType: 'PHCF' as const, flatAmount: null, percentage: 0.0025 },
  ];
  for (const t of taxes) {
    await prisma.taxRate.upsert({
      where: { tenantId_taxType_effectiveFrom: { tenantId, taxType: t.taxType, effectiveFrom: new Date('2024-01-01') } },
      update: {},
      create: { tenantId, taxType: t.taxType, flatAmount: t.flatAmount, percentage: t.percentage, effectiveFrom: new Date('2024-01-01') },
    });
  }
  console.log(`✅ Tax Rates: ${taxes.length}`);

  // ═══════════════════════════════════════════════════════════
  // 2. USERS
  // ═══════════════════════════════════════════════════════════
  const pw = await bcrypt.hash('AvenueAdmin2024!', 10)
  const userDefs = [
    { email: 'admin@avenue.co.ke',       firstName: 'James',    lastName: 'Kamau',    role: 'SUPER_ADMIN'        },
    { email: 'claims@avenue.co.ke',      firstName: 'Grace',    lastName: 'Wanjiku',  role: 'CLAIMS_OFFICER'     },
    { email: 'finance@avenue.co.ke',     firstName: 'Peter',    lastName: 'Ochieng',  role: 'FINANCE_OFFICER'    },
    { email: 'underwriter@avenue.co.ke', firstName: 'Faith',    lastName: 'Muthoni',  role: 'UNDERWRITER'        },
    { email: 'cs@avenue.co.ke',          firstName: 'David',    lastName: 'Kipchoge', role: 'CUSTOMER_SERVICE'   },
    { email: 'medical@avenue.co.ke',     firstName: 'Dr. Sarah',lastName: 'Achieng',  role: 'MEDICAL_OFFICER'    },
    { email: 'fund@avenue.co.ke',        firstName: 'Caroline', lastName: 'Mwaura',   role: 'FUND_ADMINISTRATOR' },
  ] as const
  const users: Record<string, string> = {}
  for (const u of userDefs) {
    const user = await prisma.user.upsert({
      where:  { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {},
      create: { tenantId: tenant.id, passwordHash: pw, isActive: true, ...u },
    })
    users[u.role] = user.id
  }
  console.log(`✅ Users: ${userDefs.length} (incl. fund@avenue.co.ke / FUND_ADMINISTRATOR)`)

  // ═══════════════════════════════════════════════════════════
  // 3. PACKAGES (Essential, Premier, Executive)
  // ═══════════════════════════════════════════════════════════
  const pkgDefs = [
    { name: 'Avenue Essential', annual: 500000, contrib: 30000, benefits: [
      { cat: 'INPATIENT' as const,           limit: 500000,  copay: 0,  wait: 30  },
      { cat: 'OUTPATIENT' as const,          limit: 100000,  copay: 10, wait: 0   },
      { cat: 'MATERNITY' as const,           limit: 80000,   copay: 0,  wait: 365 },
      { cat: 'DENTAL' as const,              limit: 20000,   copay: 20, wait: 90  },
      { cat: 'OPTICAL' as const,             limit: 15000,   copay: 20, wait: 90  },
    ]},
    { name: 'Avenue Premier', annual: 2000000, contrib: 75000, benefits: [
      { cat: 'INPATIENT' as const,           limit: 2000000, copay: 0,  wait: 0   },
      { cat: 'OUTPATIENT' as const,          limit: 300000,  copay: 5,  wait: 0   },
      { cat: 'MATERNITY' as const,           limit: 200000,  copay: 0,  wait: 270 },
      { cat: 'DENTAL' as const,              limit: 50000,   copay: 10, wait: 30  },
      { cat: 'OPTICAL' as const,             limit: 40000,   copay: 10, wait: 30  },
      { cat: 'MENTAL_HEALTH' as const,       limit: 100000,  copay: 10, wait: 90  },
      { cat: 'CHRONIC_DISEASE' as const,     limit: 300000,  copay: 0,  wait: 0   },
    ]},
    { name: 'Avenue Executive', annual: 5000000, contrib: 150000, benefits: [
      { cat: 'INPATIENT' as const,           limit: 5000000, copay: 0,  wait: 0   },
      { cat: 'OUTPATIENT' as const,          limit: 500000,  copay: 0,  wait: 0   },
      { cat: 'MATERNITY' as const,           limit: 500000,  copay: 0,  wait: 180 },
      { cat: 'DENTAL' as const,              limit: 100000,  copay: 0,  wait: 0   },
      { cat: 'OPTICAL' as const,             limit: 80000,   copay: 0,  wait: 0   },
      { cat: 'MENTAL_HEALTH' as const,       limit: 300000,  copay: 0,  wait: 0   },
      { cat: 'CHRONIC_DISEASE' as const,     limit: 500000,  copay: 0,  wait: 0   },
      { cat: 'SURGICAL' as const,            limit: 3000000, copay: 0,  wait: 0   },
      { cat: 'AMBULANCE_EMERGENCY' as const, limit: 200000,  copay: 0,  wait: 0   },
      { cat: 'LAST_EXPENSE' as const,        limit: 100000,  copay: 0,  wait: 0   },
    ]},
  ]
  const packages: { id: string; versionId: string; name: string; contrib: number }[] = []
  for (const p of pkgDefs) {
    const existing = await prisma.package.findFirst({ where: { tenantId: tenant.id, name: p.name }, include: { versions: true } })
    if (existing) { packages.push({ id: existing.id, versionId: existing.versions[0]?.id ?? '', name: p.name, contrib: p.contrib }); continue }
    const pkg = await prisma.package.create({
      data: {
        tenantId: tenant.id, name: p.name, type: 'CORPORATE',
        annualLimit: p.annual, contributionAmount: p.contrib, status: 'ACTIVE',
        versions: { create: { versionNumber: 1, effectiveFrom: new Date('2024-01-01'),
          benefits: { create: p.benefits.map(b => ({ category: b.cat, annualSubLimit: b.limit, copayPercentage: b.copay, waitingPeriodDays: b.wait })) },
        }},
      },
      include: { versions: true },
    })
    await prisma.package.update({ where: { id: pkg.id }, data: { currentVersionId: pkg.versions[0].id } })
    packages.push({ id: pkg.id, versionId: pkg.versions[0].id, name: p.name, contrib: p.contrib })
  }
  console.log(`✅ Packages: ${packages.length}`)

  // ═══════════════════════════════════════════════════════════
  // 4. PROVIDERS — with rich contracts, CPT tariffs, diagnosis tariffs
  // ═══════════════════════════════════════════════════════════
  const providerDefs = [
    {
      name: 'Avenue Hospital - Parklands', type: 'HOSPITAL' as const, tier: 'OWN' as const,
      county: 'Nairobi', phone: '+254202345678', email: 'parklands@avenue.co.ke',
      contactPerson: 'Dr. Kariuki Mbugua',
      contractStatus: 'ACTIVE', paymentTermDays: 14, creditLimit: 5000000,
      contractNotes: 'Flagship facility. All services covered. Priority settlement.',
      svcs: ['Inpatient','Outpatient','Maternity','Surgery','Pharmacy','ICU','Laboratory'],
      cptTariffs: [
        { serviceName: 'General Consultation',    cptCode: '99213', agreedRate: 2500  },
        { serviceName: 'Specialist Consultation', cptCode: '99214', agreedRate: 4500  },
        { serviceName: 'Full Blood Count',        cptCode: '85025', agreedRate: 1200  },
        { serviceName: 'Chest X-Ray',             cptCode: '71046', agreedRate: 3500  },
        { serviceName: 'Ultrasound - Abdomen',    cptCode: '76700', agreedRate: 6000  },
        { serviceName: 'ECG',                     cptCode: '93000', agreedRate: 2800  },
        { serviceName: 'Malaria Test (RDT)',       cptCode: '87207', agreedRate: 800   },
        { serviceName: 'Caesarean Section',        cptCode: '59510', agreedRate: 85000 },
      ],
      diagTariffs: [
        { icdCode: 'B54',   diagnosisLabel: 'Malaria, unspecified',           bundledRate: 18000,  perDayRate: 4500  },
        { icdCode: 'J18.9', diagnosisLabel: 'Pneumonia, unspecified organism', bundledRate: 45000,  perDayRate: 8500  },
        { icdCode: 'E11.9', diagnosisLabel: 'Type 2 diabetes, unspecified',   bundledRate: null,   perDayRate: 6000  },
        { icdCode: 'I10',   diagnosisLabel: 'Essential hypertension',         bundledRate: null,   perDayRate: 5500  },
        { icdCode: 'K35.9', diagnosisLabel: 'Acute appendicitis, unspecified',bundledRate: 120000, perDayRate: null  },
      ],
    },
    {
      name: 'Avenue Hospital - Thika', type: 'HOSPITAL' as const, tier: 'OWN' as const,
      county: 'Kiambu', phone: '+254202456789', email: 'thika@avenue.co.ke',
      contactPerson: 'Dr. Jane Muthee',
      contractStatus: 'ACTIVE', paymentTermDays: 14, creditLimit: 2000000,
      contractNotes: 'Outpatient and maternity focus. Inpatient capacity up to 50 beds.',
      svcs: ['Inpatient','Outpatient','Maternity','Surgery','Pharmacy'],
      cptTariffs: [
        { serviceName: 'General Consultation',    cptCode: '99213', agreedRate: 2200  },
        { serviceName: 'Specialist Consultation', cptCode: '99214', agreedRate: 4000  },
        { serviceName: 'Full Blood Count',        cptCode: '85025', agreedRate: 1100  },
        { serviceName: 'Caesarean Section',        cptCode: '59510', agreedRate: 80000 },
      ],
      diagTariffs: [
        { icdCode: 'B54',   diagnosisLabel: 'Malaria, unspecified',           bundledRate: 16000,  perDayRate: 4000  },
        { icdCode: 'O80',   diagnosisLabel: 'Spontaneous vertex delivery',    bundledRate: 35000,  perDayRate: null  },
      ],
    },
    {
      name: 'Nairobi Hospital', type: 'HOSPITAL' as const, tier: 'PARTNER' as const,
      county: 'Nairobi', phone: '+254202845000', email: 'medicalfinance@nairobihospital.org',
      contactPerson: 'Finance Manager',
      contractStatus: 'ACTIVE', paymentTermDays: 30, creditLimit: 3000000,
      contractNotes: 'Panel partner. Net 30 payment. Pre-auth required for all inpatient admissions.',
      svcs: ['Inpatient','Outpatient','Surgery','ICU'],
      cptTariffs: [
        { serviceName: 'General Consultation',    cptCode: '99213', agreedRate: 3000  },
        { serviceName: 'Specialist Consultation', cptCode: '99214', agreedRate: 5500  },
        { serviceName: 'ICU Per Day',             cptCode: '99291', agreedRate: 25000 },
      ],
      diagTariffs: [
        { icdCode: 'I21.9', diagnosisLabel: 'Acute myocardial infarction',    bundledRate: null,   perDayRate: 22000 },
        { icdCode: 'J18.9', diagnosisLabel: 'Pneumonia, unspecified organism', bundledRate: 55000,  perDayRate: 10000 },
      ],
    },
    {
      name: 'Aga Khan University Hospital', type: 'HOSPITAL' as const, tier: 'PARTNER' as const,
      county: 'Nairobi', phone: '+254203662000', email: 'billing@aku.edu',
      contactPerson: 'Billing Supervisor',
      contractStatus: 'ACTIVE', paymentTermDays: 30, creditLimit: 4000000,
      contractNotes: 'Tertiary referral partner. Complex surgical and oncology cases.',
      svcs: ['Inpatient','Outpatient','Surgery','ICU','Maternity'],
      cptTariffs: [
        { serviceName: 'General Consultation',    cptCode: '99213', agreedRate: 3500  },
        { serviceName: 'Specialist Consultation', cptCode: '99214', agreedRate: 6000  },
        { serviceName: 'MRI Brain',               cptCode: '70553', agreedRate: 28000 },
        { serviceName: 'CT Scan - Chest',         cptCode: '71250', agreedRate: 18000 },
      ],
      diagTariffs: [],
    },
    {
      name: 'Lancet Kenya Laboratories', type: 'LABORATORY' as const, tier: 'PANEL' as const,
      county: 'Nairobi', phone: '+254722205050', email: 'corporate@lancet.co.ke',
      contactPerson: 'Corporate Accounts',
      contractStatus: 'ACTIVE', paymentTermDays: 30, creditLimit: 500000,
      contractNotes: 'Preferred laboratory partner. 15% corporate discount applied.',
      svcs: ['Laboratory'],
      cptTariffs: [
        { serviceName: 'Full Blood Count',        cptCode: '85025', agreedRate: 950   },
        { serviceName: 'Lipid Profile',           cptCode: '80061', agreedRate: 2200  },
        { serviceName: 'Blood Glucose (Fasting)', cptCode: '82947', agreedRate: 600   },
        { serviceName: 'HbA1c',                   cptCode: '83036', agreedRate: 1800  },
        { serviceName: 'Liver Function Tests',    cptCode: '80076', agreedRate: 2500  },
        { serviceName: 'COVID-19 PCR',            cptCode: '87635', agreedRate: 4500  },
      ],
      diagTariffs: [],
    },
    {
      name: 'City Eye Hospital', type: 'OPTICAL' as const, tier: 'PANEL' as const,
      county: 'Nairobi', phone: '+254202230100', email: 'billing@cityeye.co.ke',
      contactPerson: 'Admin Officer',
      contractStatus: 'ACTIVE', paymentTermDays: 30, creditLimit: 300000,
      contractNotes: 'Optical-only panel. Frames and lenses per agreed price list attached.',
      svcs: ['Optical'],
      cptTariffs: [
        { serviceName: 'Eye Examination',         cptCode: '92004', agreedRate: 2500  },
        { serviceName: 'Spectacle Lenses (pair)',  cptCode: '92340', agreedRate: 8000  },
        { serviceName: 'Frames',                  cptCode: '92341', agreedRate: 5000  },
      ],
      diagTariffs: [],
    },
  ]

  const effectiveDate = new Date('2024-01-01')
  const providers: string[] = []
  for (const p of providerDefs) {
    const existing = await prisma.provider.findFirst({ where: { tenantId: tenant.id, name: p.name } })
    if (existing) { providers.push(existing.id); continue }
    const prov = await prisma.provider.create({
      data: {
        tenantId: tenant.id, name: p.name, type: p.type, tier: p.tier,
        county: p.county, phone: p.phone, email: p.email, contactPerson: p.contactPerson,
        servicesOffered: p.svcs,
        contractStatus: p.contractStatus,
        contractStartDate: new Date('2024-01-01'),
        contractEndDate: new Date('2025-12-31'),
        paymentTermDays: p.paymentTermDays,
        creditLimit: p.creditLimit,
        contractNotes: p.contractNotes,
        tariffs: {
          create: p.cptTariffs.map(t => ({ ...t, effectiveFrom: effectiveDate })),
        },
        diagnosisTariffs: {
          create: p.diagTariffs.map(t => ({ ...t, effectiveFrom: effectiveDate })),
        },
      },
    })
    providers.push(prov.id)
  }
  console.log(`✅ Providers: ${providers.length} (with CPT + diagnosis tariffs)`)

  // ═══════════════════════════════════════════════════════════
  // 5. BROKERS
  // ═══════════════════════════════════════════════════════════
  const brokerDefs = [
    { name: 'Kenyan Alliance Insurance Brokers', contact: 'John Mutua',     phone: '+254722111000', email: 'john@kaib.co.ke',   first: 15, renew: 10 },
    { name: 'Minet Kenya',                       contact: 'Alice Njeri',    phone: '+254733222000', email: 'alice@minet.co.ke', first: 12, renew: 8  },
    { name: 'AON Kenya',                         contact: 'Charles Otieno', phone: '+254711333000', email: 'charles@aon.co.ke', first: 18, renew: 12 },
  ]
  const brokers: string[] = []
  for (const b of brokerDefs) {
    const existing = await prisma.broker.findFirst({ where: { tenantId: tenant.id, name: b.name } })
    if (existing) { brokers.push(existing.id); continue }
    const broker = await prisma.broker.create({
      data: {
        tenantId: tenant.id, name: b.name, contactPerson: b.contact,
        phone: b.phone, email: b.email, licenseNumber: `IRA/${Math.floor(1000+Math.random()*9000)}`,
        firstYearCommissionPct: b.first, renewalCommissionPct: b.renew, status: 'ACTIVE',
      },
    })
    brokers.push(broker.id)
  }
  console.log(`✅ Brokers: ${brokers.length}`)

  // Broker portal user — linked to KAIB (brokers[0])
  const brokerUserExists = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: 'broker@kaib.co.ke' } })
  if (!brokerUserExists) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'broker@kaib.co.ke',
        firstName: 'John',
        lastName: 'Mutua',
        role: 'BROKER_USER',
        passwordHash: pw,
        isActive: true,
        brokerId: brokers[0],
      },
    })
    console.log('✅ Broker portal user: broker@kaib.co.ke')
  }

  // ═══════════════════════════════════════════════════════════
  // 6. GROUPS — Safaricom has 3 benefit tiers
  // ═══════════════════════════════════════════════════════════
  const [essentialPkg, premierPkg, executivePkg] = packages

  // Safaricom — multi-tier group
  const safaricomExisting = await prisma.group.findFirst({ where: { tenantId: tenant.id, name: 'Safaricom PLC' } })
  const safaricom = safaricomExisting ?? await prisma.group.create({
    data: {
      tenantId: tenant.id, name: 'Safaricom PLC', industry: 'Telecommunications',
      registrationNumber: 'PVT-107227',
      contactPersonName: 'Emily Wambui', contactPersonPhone: '+254700100100', contactPersonEmail: 'hr@safaricom.co.ke',
      county: 'Nairobi', packageId: executivePkg.id, packageVersionId: executivePkg.versionId,
      brokerId: brokers[0],
      paymentFrequency: 'ANNUAL', contributionRate: executivePkg.contrib,
      effectiveDate: new Date('2024-01-01'), renewalDate: new Date('2025-01-01'), status: 'ACTIVE',
    },
  })

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: 'emily.wambui@safaricom.co.ke' } },
    update: {
      passwordHash: pw,
      isActive: true,
      role: 'HR_MANAGER',
      groupId: safaricom.id,
    },
    create: {
      tenantId,
      email: 'emily.wambui@safaricom.co.ke',
      firstName: 'Emily',
      lastName: 'Wambui',
      role: 'HR_MANAGER',
      passwordHash: pw,
      isActive: true,
      groupId: safaricom.id,
    },
  })
  console.log('✅ HR portal user: emily.wambui@safaricom.co.ke')

  // Create benefit tiers for Safaricom
  const tierExisting = await prisma.groupBenefitTier.findFirst({ where: { groupId: safaricom.id } })
  let executiveTier: { id: string } | null = null
  let managementTier: { id: string } | null = null
  let staffTier: { id: string } | null = null

  if (!tierExisting) {
    executiveTier = await prisma.groupBenefitTier.create({
      data: {
        groupId: safaricom.id, name: 'Executive', packageId: executivePkg.id,
        contributionRate: 150000, description: 'C-suite and Senior VP — unlimited consultations, global cover rider',
        isDefault: false,
      },
    })
    managementTier = await prisma.groupBenefitTier.create({
      data: {
        groupId: safaricom.id, name: 'Management', packageId: premierPkg.id,
        contributionRate: 75000, description: 'Managers and team leads — comprehensive cover including mental health',
        isDefault: true,
      },
    })
    staffTier = await prisma.groupBenefitTier.create({
      data: {
        groupId: safaricom.id, name: 'Staff', packageId: essentialPkg.id,
        contributionRate: 30000, description: 'All permanent staff — essential inpatient and outpatient cover',
        isDefault: false,
      },
    })
    console.log(`  ↳ Benefit tiers created for Safaricom PLC`)
  } else {
    const tiers = await prisma.groupBenefitTier.findMany({ where: { groupId: safaricom.id }, orderBy: { createdAt: 'asc' } })
    executiveTier  = tiers[0] ?? null
    managementTier = tiers[1] ?? null
    staffTier      = tiers[2] ?? null
  }

  // Other groups — flat package
  const otherGroupDefs = [
    { name: 'KCB Group',              industry: 'Banking & Finance',      contact: 'Moses Kiptoo',  phone: '+254700200200', email: 'hr@kcb.co.ke',     pkgIdx: 1, county: 'Nairobi',  brokerIdx: 1 },
    { name: 'East African Breweries', industry: 'Manufacturing',           contact: 'Anne Chebet',   phone: '+254700300300', email: 'hr@eabl.co.ke',    pkgIdx: 1, county: 'Nairobi',  brokerIdx: null },
    { name: 'Bamburi Cement',         industry: 'Construction',            contact: 'Samuel Njoroge',phone: '+254700400400', email: 'hr@bamburi.co.ke', pkgIdx: 0, county: 'Mombasa',  brokerIdx: 2 },
    { name: 'Twiga Foods',            industry: 'Agriculture & Logistics', contact: 'Lucy Akinyi',   phone: '+254700500500', email: 'hr@twiga.com',     pkgIdx: 0, county: 'Nairobi',  brokerIdx: null },
  ]
  const otherGroups: string[] = []
  for (const g of otherGroupDefs) {
    const pkg = packages[g.pkgIdx]
    const existing = await prisma.group.findFirst({ where: { tenantId: tenant.id, name: g.name } })
    if (existing) { otherGroups.push(existing.id); continue }
    const grp = await prisma.group.create({
      data: {
        tenantId: tenant.id, name: g.name, industry: g.industry,
        registrationNumber: `PVT-${Math.floor(100000+Math.random()*900000)}`,
        contactPersonName: g.contact, contactPersonPhone: g.phone, contactPersonEmail: g.email,
        county: g.county, packageId: pkg.id, packageVersionId: pkg.versionId,
        brokerId: g.brokerIdx !== null ? brokers[g.brokerIdx] : null,
        paymentFrequency: 'ANNUAL', contributionRate: pkg.contrib,
        effectiveDate: new Date('2024-01-01'), renewalDate: new Date('2025-01-01'), status: 'ACTIVE',
      },
    })
    otherGroups.push(grp.id)
  }
  const [kcbId, eablId, bamburiId, twigaId] = otherGroups
  console.log(`✅ Groups: 5 (Safaricom with 3 benefit tiers, 4 flat-package groups)`)

  // ═══════════════════════════════════════════════════════════
  // 7. MEMBERS — Safaricom members spread across tiers
  // ═══════════════════════════════════════════════════════════
  const existingMembers = await prisma.member.findMany({ where: { tenantId }, select: { id: true } })
  let members: { id: string; groupId: string }[] = []

  if (existingMembers.length === 0) {
    let num = 1
    const mk = (data: object) => prisma.member.create({ data: data as never, select: { id: true, groupId: true } })

    // Safaricom — Executive tier (Executive package)
    const saf_ceo = await mk({
      tenantId, groupId: safaricom.id, benefitTierId: executiveTier?.id,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Wanjiru', lastName: 'Kamau', gender: 'FEMALE', dateOfBirth: new Date('1975-03-15'),
      relationship: 'PRINCIPAL', packageId: executivePkg.id, packageVersionId: executivePkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    const saf_ceo_spouse = await mk({
      tenantId, groupId: safaricom.id, benefitTierId: executiveTier?.id,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Kenneth', lastName: 'Kamau', gender: 'MALE', dateOfBirth: new Date('1973-07-20'),
      relationship: 'SPOUSE', principalId: saf_ceo.id, packageId: executivePkg.id, packageVersionId: executivePkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    await mk({
      tenantId, groupId: safaricom.id, benefitTierId: executiveTier?.id,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Brian', lastName: 'Karanja', gender: 'MALE', dateOfBirth: new Date('1978-01-05'),
      relationship: 'PRINCIPAL', packageId: executivePkg.id, packageVersionId: executivePkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    void saf_ceo_spouse

    // Safaricom — Management tier (Premier package)
    const saf_mgr1 = await mk({
      tenantId, groupId: safaricom.id, benefitTierId: managementTier?.id,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Kevin', lastName: 'Odera', gender: 'MALE', dateOfBirth: new Date('1985-07-22'),
      relationship: 'PRINCIPAL', packageId: premierPkg.id, packageVersionId: premierPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    await mk({
      tenantId, groupId: safaricom.id, benefitTierId: managementTier?.id,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Mercy', lastName: 'Odera', gender: 'FEMALE', dateOfBirth: new Date('1987-11-10'),
      relationship: 'SPOUSE', principalId: saf_mgr1.id, packageId: premierPkg.id, packageVersionId: premierPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    await mk({
      tenantId, groupId: safaricom.id, benefitTierId: managementTier?.id,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Diana', lastName: 'Njoroge', gender: 'FEMALE', dateOfBirth: new Date('1988-06-18'),
      relationship: 'PRINCIPAL', packageId: premierPkg.id, packageVersionId: premierPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })

    // Safaricom — Staff tier (Essential package)
    await mk({
      tenantId, groupId: safaricom.id, benefitTierId: staffTier?.id,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Felix', lastName: 'Wekesa', gender: 'MALE', dateOfBirth: new Date('1995-11-03'),
      relationship: 'PRINCIPAL', packageId: essentialPkg.id, packageVersionId: essentialPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    await mk({
      tenantId, groupId: safaricom.id, benefitTierId: staffTier?.id,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Sharon', lastName: 'Auma', gender: 'FEMALE', dateOfBirth: new Date('1998-04-12'),
      relationship: 'PRINCIPAL', packageId: essentialPkg.id, packageVersionId: essentialPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })

    // KCB — Premier, flat
    const kcb_p1 = await mk({
      tenantId, groupId: kcbId,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Joseph', lastName: 'Mwangi', gender: 'MALE', dateOfBirth: new Date('1980-12-20'),
      relationship: 'PRINCIPAL', packageId: premierPkg.id, packageVersionId: premierPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    await mk({
      tenantId, groupId: kcbId,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Agnes', lastName: 'Mwangi', gender: 'FEMALE', dateOfBirth: new Date('1983-04-14'),
      relationship: 'SPOUSE', principalId: kcb_p1.id, packageId: premierPkg.id, packageVersionId: premierPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    await mk({
      tenantId, groupId: kcbId,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Cynthia', lastName: 'Adhiambo', gender: 'FEMALE', dateOfBirth: new Date('1995-08-30'),
      relationship: 'PRINCIPAL', packageId: premierPkg.id, packageVersionId: premierPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    await mk({
      tenantId, groupId: kcbId,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Patrick', lastName: 'Kibet', gender: 'MALE', dateOfBirth: new Date('1978-02-17'),
      relationship: 'PRINCIPAL', packageId: premierPkg.id, packageVersionId: premierPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'SUSPENDED',
    })

    // EABL — Premier
    await mk({
      tenantId, groupId: eablId,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'George', lastName: 'Onyango', gender: 'MALE', dateOfBirth: new Date('1987-05-12'),
      relationship: 'PRINCIPAL', packageId: premierPkg.id, packageVersionId: premierPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    await mk({
      tenantId, groupId: eablId,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Esther', lastName: 'Wairimu', gender: 'FEMALE', dateOfBirth: new Date('1991-07-16'),
      relationship: 'PRINCIPAL', packageId: premierPkg.id, packageVersionId: premierPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })

    // Bamburi — Essential
    await mk({
      tenantId, groupId: bamburiId,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Hassan', lastName: 'Mohamed', gender: 'MALE', dateOfBirth: new Date('1982-06-08'),
      relationship: 'PRINCIPAL', packageId: essentialPkg.id, packageVersionId: essentialPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    await mk({
      tenantId, groupId: bamburiId,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Elizabeth', lastName: 'Nduta', gender: 'FEMALE', dateOfBirth: new Date('1996-12-05'),
      relationship: 'PRINCIPAL', packageId: essentialPkg.id, packageVersionId: essentialPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })

    // Twiga — Essential
    await mk({
      tenantId, groupId: twigaId,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Daniel', lastName: 'Njuguna', gender: 'MALE', dateOfBirth: new Date('1994-10-11'),
      relationship: 'PRINCIPAL', packageId: essentialPkg.id, packageVersionId: essentialPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), activationDate: new Date('2024-02-01'), status: 'ACTIVE',
    })
    await mk({
      tenantId, groupId: twigaId,
      memberNumber: `AVH-2024-${String(num++).padStart(5,'0')}`,
      firstName: 'Winnie', lastName: 'Cherop', gender: 'FEMALE', dateOfBirth: new Date('1992-02-14'),
      relationship: 'PRINCIPAL', packageId: essentialPkg.id, packageVersionId: essentialPkg.versionId,
      enrollmentDate: new Date('2024-01-15'), status: 'PENDING_ACTIVATION',
    })

    members = await prisma.member.findMany({ where: { tenantId }, select: { id: true, groupId: true } })
    console.log(`✅ Members: ${members.length} (Safaricom split across 3 tiers)`)
  } else {
    members = await prisma.member.findMany({ where: { tenantId }, select: { id: true, groupId: true } })
    console.log(`✅ Members: ${members.length} (already seeded)`)
  }

  // ═══════════════════════════════════════════════════════════
  // 8. ICD-10 & CPT CODES
  // ═══════════════════════════════════════════════════════════
  const icdCodes = [
    // ── Infectious & Parasitic ───────────────────────────────────────────────
    { code: 'A00.9',  description: 'Cholera, unspecified',                                        category: 'Infectious',         standardCharge: 15000 },
    { code: 'A01.0',  description: 'Typhoid fever',                                               category: 'Infectious',         standardCharge: 12000 },
    { code: 'A01.1',  description: 'Paratyphoid fever A',                                         category: 'Infectious',         standardCharge: 10000 },
    { code: 'A02.0',  description: 'Salmonella enteritis',                                        category: 'Infectious',         standardCharge: 6000  },
    { code: 'A05.9',  description: 'Bacterial foodborne intoxication, unspecified',               category: 'Infectious',         standardCharge: 5500  },
    { code: 'A06.0',  description: 'Acute amoebic dysentery',                                    category: 'Infectious',         standardCharge: 7000  },
    { code: 'A09',    description: 'Infectious gastroenteritis and colitis, unspecified',          category: 'Infectious',         standardCharge: 6000  },
    { code: 'A15.0',  description: 'Tuberculosis of lung, confirmed by sputum microscopy',       category: 'Infectious',         standardCharge: 20000 },
    { code: 'A16.9',  description: 'Respiratory tuberculosis, unspecified',                       category: 'Infectious',         standardCharge: 18000 },
    { code: 'A41.9',  description: 'Sepsis, unspecified organism',                               category: 'Infectious',         standardCharge: 120000},
    { code: 'A46',    description: 'Erysipelas',                                                  category: 'Infectious',         standardCharge: 8000  },
    { code: 'A90',    description: 'Dengue fever',                                                category: 'Infectious',         standardCharge: 9000  },
    { code: 'B00.9',  description: 'Herpesviral infection, unspecified',                         category: 'Infectious',         standardCharge: 4500  },
    { code: 'B01.9',  description: 'Varicella (chickenpox) without complication',                category: 'Infectious',         standardCharge: 5000  },
    { code: 'B05.9',  description: 'Measles without complication',                               category: 'Infectious',         standardCharge: 6000  },
    { code: 'B15.9',  description: 'Acute hepatitis A without hepatic coma',                     category: 'Infectious',         standardCharge: 12000 },
    { code: 'B16.9',  description: 'Acute hepatitis B without delta-agent and without coma',     category: 'Infectious',         standardCharge: 15000 },
    { code: 'B18.1',  description: 'Chronic viral hepatitis B without delta-agent',              category: 'Infectious',         standardCharge: 8000  },
    { code: 'B19.9',  description: 'Unspecified viral hepatitis without hepatic coma',           category: 'Infectious',         standardCharge: 10000 },
    { code: 'B20',    description: 'Human immunodeficiency virus disease (HIV)',                  category: 'Infectious',         standardCharge: 6000  },
    { code: 'B34.9',  description: 'Viral infection, unspecified',                               category: 'Infectious',         standardCharge: 4000  },
    { code: 'B37.0',  description: 'Candidal stomatitis (oral thrush)',                          category: 'Infectious',         standardCharge: 3000  },
    { code: 'B50.0',  description: 'Plasmodium falciparum malaria with cerebral complications',  category: 'Infectious',         standardCharge: 45000 },
    { code: 'B50.9',  description: 'Plasmodium falciparum malaria, unspecified',                category: 'Infectious',         standardCharge: 12000 },
    { code: 'B54',    description: 'Malaria, unspecified',                                       category: 'Infectious',         standardCharge: 8000  },
    { code: 'B65.9',  description: 'Schistosomiasis, unspecified',                              category: 'Infectious',         standardCharge: 5000  },
    { code: 'B76.9',  description: 'Hookworm disease, unspecified',                             category: 'Infectious',         standardCharge: 2500  },

    // ── Neoplasms ────────────────────────────────────────────────────────────
    { code: 'C18.9',  description: 'Malignant neoplasm of colon, unspecified',                  category: 'Neoplasms',          standardCharge: 200000},
    { code: 'C34.9',  description: 'Malignant neoplasm of bronchus and lung, unspecified',      category: 'Neoplasms',          standardCharge: 250000},
    { code: 'C50.9',  description: 'Malignant neoplasm of breast, unspecified',                 category: 'Neoplasms',          standardCharge: 180000},
    { code: 'C53.9',  description: 'Malignant neoplasm of cervix uteri, unspecified',           category: 'Neoplasms',          standardCharge: 150000},
    { code: 'C61',    description: 'Malignant neoplasm of prostate',                            category: 'Neoplasms',          standardCharge: 200000},
    { code: 'C67.9',  description: 'Malignant neoplasm of bladder, unspecified',                category: 'Neoplasms',          standardCharge: 180000},
    { code: 'C80.1',  description: 'Malignant neoplasm, unspecified',                           category: 'Neoplasms',          standardCharge: 150000},
    { code: 'D25.9',  description: 'Leiomyoma of uterus, unspecified',                          category: 'Neoplasms',          standardCharge: 80000 },
    { code: 'D50.9',  description: 'Iron deficiency anaemia, unspecified',                      category: 'Neoplasms',          standardCharge: 3500  },

    // ── Endocrine & Metabolic ────────────────────────────────────────────────
    { code: 'E03.9',  description: 'Hypothyroidism, unspecified',                               category: 'Endocrine',          standardCharge: 4000  },
    { code: 'E05.9',  description: 'Thyrotoxicosis, unspecified',                               category: 'Endocrine',          standardCharge: 5000  },
    { code: 'E10.9',  description: 'Type 1 diabetes mellitus without complications',            category: 'Endocrine',          standardCharge: 6000  },
    { code: 'E11.0',  description: 'Type 2 diabetes mellitus with hyperosmolarity',             category: 'Endocrine',          standardCharge: 45000 },
    { code: 'E11.9',  description: 'Type 2 diabetes mellitus, unspecified',                     category: 'Endocrine',          standardCharge: 5000  },
    { code: 'E14.9',  description: 'Unspecified diabetes mellitus without complications',       category: 'Endocrine',          standardCharge: 5000  },
    { code: 'E46',    description: 'Unspecified protein-energy malnutrition',                   category: 'Endocrine',          standardCharge: 8000  },
    { code: 'E66.9',  description: 'Obesity, unspecified',                                      category: 'Endocrine',          standardCharge: 3500  },
    { code: 'E78.5',  description: 'Hyperlipidaemia, unspecified',                              category: 'Endocrine',          standardCharge: 3500  },
    { code: 'E87.1',  description: 'Hypo-osmolality and hyponatraemia',                         category: 'Endocrine',          standardCharge: 6000  },

    // ── Mental & Behavioural ─────────────────────────────────────────────────
    { code: 'F10.1',  description: 'Alcohol abuse, uncomplicated',                              category: 'Mental health',      standardCharge: 8000  },
    { code: 'F20.9',  description: 'Schizophrenia, unspecified',                                category: 'Mental health',      standardCharge: 15000 },
    { code: 'F32.9',  description: 'Depressive episode, unspecified',                           category: 'Mental health',      standardCharge: 6000  },
    { code: 'F33.9',  description: 'Recurrent depressive disorder, unspecified',                category: 'Mental health',      standardCharge: 6500  },
    { code: 'F40.9',  description: 'Phobic anxiety disorder, unspecified',                      category: 'Mental health',      standardCharge: 5500  },
    { code: 'F41.1',  description: 'Generalized anxiety disorder',                              category: 'Mental health',      standardCharge: 5500  },
    { code: 'F41.9',  description: 'Anxiety disorder, unspecified',                             category: 'Mental health',      standardCharge: 5000  },
    { code: 'F43.1',  description: 'Post-traumatic stress disorder',                            category: 'Mental health',      standardCharge: 6500  },
    { code: 'F90.0',  description: 'Attention-deficit hyperactivity disorder, inattentive type',category: 'Mental health',      standardCharge: 5500  },

    // ── Nervous System ───────────────────────────────────────────────────────
    { code: 'G20',    description: 'Parkinson\'s disease',                                      category: 'Neurological',       standardCharge: 12000 },
    { code: 'G35',    description: 'Multiple sclerosis',                                         category: 'Neurological',       standardCharge: 25000 },
    { code: 'G40.9',  description: 'Epilepsy, unspecified',                                     category: 'Neurological',       standardCharge: 10000 },
    { code: 'G43.9',  description: 'Migraine, unspecified',                                     category: 'Neurological',       standardCharge: 5000  },
    { code: 'G45.9',  description: 'Transient cerebral ischaemic attack, unspecified',          category: 'Neurological',       standardCharge: 35000 },
    { code: 'G51.0',  description: 'Bell\'s palsy',                                             category: 'Neurological',       standardCharge: 6000  },
    { code: 'G62.9',  description: 'Polyneuropathy, unspecified',                               category: 'Neurological',       standardCharge: 8000  },

    // ── Eye & Adnexa ─────────────────────────────────────────────────────────
    { code: 'H10.9',  description: 'Conjunctivitis, unspecified',                               category: 'Eye disorders',      standardCharge: 2500  },
    { code: 'H25.9',  description: 'Age-related cataract, unspecified',                         category: 'Eye disorders',      standardCharge: 60000 },
    { code: 'H26.9',  description: 'Cataract, unspecified',                                     category: 'Eye disorders',      standardCharge: 55000 },
    { code: 'H35.0',  description: 'Background retinopathy and retinal vascular changes',       category: 'Eye disorders',      standardCharge: 12000 },
    { code: 'H40.9',  description: 'Glaucoma, unspecified',                                     category: 'Eye disorders',      standardCharge: 15000 },
    { code: 'H52.1',  description: 'Myopia',                                                    category: 'Eye disorders',      standardCharge: 3000  },
    { code: 'H52.4',  description: 'Presbyopia',                                                category: 'Eye disorders',      standardCharge: 3000  },
    { code: 'H66.9',  description: 'Otitis media, unspecified',                                 category: 'Eye disorders',      standardCharge: 4000  },

    // ── Circulatory ──────────────────────────────────────────────────────────
    { code: 'I10',    description: 'Essential hypertension',                                    category: 'Circulatory',        standardCharge: 4500  },
    { code: 'I11.9',  description: 'Hypertensive heart disease without heart failure',          category: 'Circulatory',        standardCharge: 8000  },
    { code: 'I20.9',  description: 'Angina pectoris, unspecified',                              category: 'Circulatory',        standardCharge: 20000 },
    { code: 'I21.0',  description: 'Acute transmural MI of anterior wall',                      category: 'Circulatory',        standardCharge: 180000},
    { code: 'I21.9',  description: 'Acute myocardial infarction, unspecified',                 category: 'Circulatory',        standardCharge: 150000},
    { code: 'I25.9',  description: 'Chronic ischaemic heart disease, unspecified',             category: 'Circulatory',        standardCharge: 25000 },
    { code: 'I26.9',  description: 'Pulmonary embolism without acute cor pulmonale',           category: 'Circulatory',        standardCharge: 80000 },
    { code: 'I42.9',  description: 'Cardiomyopathy, unspecified',                              category: 'Circulatory',        standardCharge: 30000 },
    { code: 'I48.9',  description: 'Atrial fibrillation and flutter, unspecified',             category: 'Circulatory',        standardCharge: 20000 },
    { code: 'I50.9',  description: 'Heart failure, unspecified',                               category: 'Circulatory',        standardCharge: 50000 },
    { code: 'I63.9',  description: 'Cerebral infarction, unspecified',                         category: 'Circulatory',        standardCharge: 90000 },
    { code: 'I64',    description: 'Stroke, not specified as haemorrhage or infarction',       category: 'Circulatory',        standardCharge: 85000 },
    { code: 'I70.9',  description: 'Generalised and unspecified atherosclerosis',              category: 'Circulatory',        standardCharge: 15000 },
    { code: 'I83.9',  description: 'Varicose veins of lower extremities without ulcer',       category: 'Circulatory',        standardCharge: 40000 },
    { code: 'I84.9',  description: 'Haemorrhoids, unspecified',                               category: 'Circulatory',        standardCharge: 25000 },

    // ── Respiratory ──────────────────────────────────────────────────────────
    { code: 'J00',    description: 'Acute nasopharyngitis (common cold)',                       category: 'Respiratory',        standardCharge: 2500  },
    { code: 'J02.9',  description: 'Acute pharyngitis, unspecified',                           category: 'Respiratory',        standardCharge: 3000  },
    { code: 'J03.9',  description: 'Acute tonsillitis, unspecified',                           category: 'Respiratory',        standardCharge: 4000  },
    { code: 'J04.0',  description: 'Acute laryngitis',                                         category: 'Respiratory',        standardCharge: 3500  },
    { code: 'J06.9',  description: 'Acute upper respiratory infection, unspecified',           category: 'Respiratory',        standardCharge: 3500  },
    { code: 'J18.1',  description: 'Lobar pneumonia, unspecified organism',                    category: 'Respiratory',        standardCharge: 40000 },
    { code: 'J18.9',  description: 'Pneumonia, unspecified organism',                          category: 'Respiratory',        standardCharge: 35000 },
    { code: 'J20.9',  description: 'Acute bronchitis, unspecified',                            category: 'Respiratory',        standardCharge: 4500  },
    { code: 'J22',    description: 'Unspecified acute lower respiratory infection',            category: 'Respiratory',        standardCharge: 5000  },
    { code: 'J44.1',  description: 'Chronic obstructive pulmonary disease with acute exacerbation', category: 'Respiratory',  standardCharge: 25000 },
    { code: 'J45.9',  description: 'Asthma, uncomplicated',                                   category: 'Respiratory',        standardCharge: 8000  },
    { code: 'J45.41', description: 'Moderate persistent asthma with acute exacerbation',      category: 'Respiratory',        standardCharge: 15000 },
    { code: 'J93.9',  description: 'Pneumothorax, unspecified',                               category: 'Respiratory',        standardCharge: 50000 },
    { code: 'J96.0',  description: 'Acute respiratory failure',                               category: 'Respiratory',        standardCharge: 100000},

    // ── Digestive ────────────────────────────────────────────────────────────
    { code: 'K01.1',  description: 'Impacted teeth',                                           category: 'Dental',             standardCharge: 15000 },
    { code: 'K02.9',  description: 'Dental caries, unspecified',                               category: 'Dental',             standardCharge: 3000  },
    { code: 'K04.0',  description: 'Pulpitis',                                                 category: 'Dental',             standardCharge: 5000  },
    { code: 'K08.1',  description: 'Loss of teeth due to accident, extraction or local periodontal disease', category: 'Dental', standardCharge: 4000 },
    { code: 'K21.0',  description: 'Gastro-oesophageal reflux disease with oesophagitis',     category: 'Digestive',          standardCharge: 5500  },
    { code: 'K25.9',  description: 'Gastric ulcer, unspecified',                              category: 'Digestive',          standardCharge: 12000 },
    { code: 'K27.9',  description: 'Peptic ulcer, site unspecified, unspecified',             category: 'Digestive',          standardCharge: 10000 },
    { code: 'K29.7',  description: 'Gastritis, unspecified',                                  category: 'Digestive',          standardCharge: 5000  },
    { code: 'K35.9',  description: 'Acute appendicitis, unspecified',                         category: 'Digestive',          standardCharge: 95000 },
    { code: 'K40.9',  description: 'Unilateral inguinal hernia without obstruction',          category: 'Digestive',          standardCharge: 60000 },
    { code: 'K42.9',  description: 'Umbilical hernia without obstruction',                    category: 'Digestive',          standardCharge: 45000 },
    { code: 'K43.9',  description: 'Ventral hernia without obstruction',                      category: 'Digestive',          standardCharge: 55000 },
    { code: 'K57.3',  description: 'Diverticular disease of large intestine without perforation', category: 'Digestive',      standardCharge: 20000 },
    { code: 'K59.0',  description: 'Constipation, unspecified',                               category: 'Digestive',          standardCharge: 3000  },
    { code: 'K70.3',  description: 'Alcoholic cirrhosis of liver',                            category: 'Digestive',          standardCharge: 40000 },
    { code: 'K72.9',  description: 'Hepatic failure, unspecified',                            category: 'Digestive',          standardCharge: 80000 },
    { code: 'K74.6',  description: 'Other and unspecified cirrhosis of liver',                category: 'Digestive',          standardCharge: 40000 },
    { code: 'K80.2',  description: 'Calculus of gallbladder without cholecystitis',           category: 'Digestive',          standardCharge: 70000 },
    { code: 'K85.9',  description: 'Acute pancreatitis, unspecified',                         category: 'Digestive',          standardCharge: 60000 },
    { code: 'K92.1',  description: 'Melaena (gastrointestinal haemorrhage)',                  category: 'Digestive',          standardCharge: 25000 },

    // ── Skin & Subcutaneous ──────────────────────────────────────────────────
    { code: 'L01.0',  description: 'Impetigo',                                                 category: 'Dermatology',        standardCharge: 3500  },
    { code: 'L02.9',  description: 'Cutaneous abscess, unspecified',                          category: 'Dermatology',        standardCharge: 5000  },
    { code: 'L03.9',  description: 'Cellulitis, unspecified',                                 category: 'Dermatology',        standardCharge: 8000  },
    { code: 'L20.9',  description: 'Atopic dermatitis, unspecified',                          category: 'Dermatology',        standardCharge: 4000  },
    { code: 'L30.9',  description: 'Dermatitis, unspecified',                                 category: 'Dermatology',        standardCharge: 3500  },
    { code: 'L40.0',  description: 'Plaque psoriasis',                                        category: 'Dermatology',        standardCharge: 6000  },
    { code: 'L50.9',  description: 'Urticaria, unspecified',                                  category: 'Dermatology',        standardCharge: 3000  },

    // ── Musculoskeletal ──────────────────────────────────────────────────────
    { code: 'M06.9',  description: 'Rheumatoid arthritis, unspecified',                       category: 'Musculoskeletal',    standardCharge: 8000  },
    { code: 'M10.9',  description: 'Gout, unspecified',                                       category: 'Musculoskeletal',    standardCharge: 5000  },
    { code: 'M16.9',  description: 'Osteoarthritis of hip, unspecified',                      category: 'Musculoskeletal',    standardCharge: 12000 },
    { code: 'M17.9',  description: 'Osteoarthritis of knee, unspecified',                     category: 'Musculoskeletal',    standardCharge: 12000 },
    { code: 'M19.9',  description: 'Osteoarthritis, unspecified',                             category: 'Musculoskeletal',    standardCharge: 8000  },
    { code: 'M47.9',  description: 'Spondylosis, unspecified',                                category: 'Musculoskeletal',    standardCharge: 8000  },
    { code: 'M48.0',  description: 'Spinal stenosis',                                         category: 'Musculoskeletal',    standardCharge: 15000 },
    { code: 'M54.4',  description: 'Lumbago with sciatica',                                   category: 'Musculoskeletal',    standardCharge: 5500  },
    { code: 'M54.5',  description: 'Low back pain',                                           category: 'Musculoskeletal',    standardCharge: 4000  },
    { code: 'M75.1',  description: 'Rotator cuff syndrome',                                   category: 'Musculoskeletal',    standardCharge: 10000 },
    { code: 'M79.3',  description: 'Panniculitis, unspecified',                               category: 'Musculoskeletal',    standardCharge: 4000  },
    { code: 'M80.9',  description: 'Osteoporosis with pathological fracture, unspecified',    category: 'Musculoskeletal',    standardCharge: 20000 },
    { code: 'M81.0',  description: 'Age-related osteoporosis without pathological fracture',  category: 'Musculoskeletal',    standardCharge: 6000  },

    // ── Genitourinary ────────────────────────────────────────────────────────
    { code: 'N03.9',  description: 'Chronic nephritic syndrome, unspecified',                 category: 'Genitourinary',      standardCharge: 20000 },
    { code: 'N04.9',  description: 'Nephrotic syndrome, unspecified',                         category: 'Genitourinary',      standardCharge: 18000 },
    { code: 'N17.9',  description: 'Acute kidney failure, unspecified',                       category: 'Genitourinary',      standardCharge: 70000 },
    { code: 'N18.9',  description: 'Chronic kidney disease, unspecified',                     category: 'Genitourinary',      standardCharge: 25000 },
    { code: 'N20.0',  description: 'Calculus of kidney (renal stone)',                        category: 'Genitourinary',      standardCharge: 30000 },
    { code: 'N23',    description: 'Unspecified renal colic',                                 category: 'Genitourinary',      standardCharge: 8000  },
    { code: 'N30.0',  description: 'Acute cystitis',                                          category: 'Genitourinary',      standardCharge: 4000  },
    { code: 'N39.0',  description: 'Urinary tract infection, site not specified',             category: 'Genitourinary',      standardCharge: 5000  },
    { code: 'N40',    description: 'Enlarged prostate (benign prostatic hypertrophy)',        category: 'Genitourinary',      standardCharge: 15000 },
    { code: 'N73.9',  description: 'Female pelvic inflammatory disease, unspecified',        category: 'Genitourinary',      standardCharge: 8000  },
    { code: 'N83.2',  description: 'Other and unspecified ovarian cysts',                    category: 'Genitourinary',      standardCharge: 20000 },
    { code: 'N92.0',  description: 'Excessive and frequent menstruation with regular cycle', category: 'Genitourinary',      standardCharge: 5000  },
    { code: 'N93.9',  description: 'Abnormal uterine and vaginal bleeding, unspecified',     category: 'Genitourinary',      standardCharge: 5000  },

    // ── Pregnancy & Childbirth ───────────────────────────────────────────────
    { code: 'O00.9',  description: 'Ectopic pregnancy, unspecified',                          category: 'Pregnancy',          standardCharge: 80000 },
    { code: 'O03.9',  description: 'Spontaneous abortion, complete or unspecified, without complication', category: 'Pregnancy', standardCharge: 15000 },
    { code: 'O10.0',  description: 'Pre-existing essential hypertension complicating pregnancy', category: 'Pregnancy',        standardCharge: 20000 },
    { code: 'O13',    description: 'Gestational hypertension',                                category: 'Pregnancy',          standardCharge: 12000 },
    { code: 'O14.1',  description: 'Severe pre-eclampsia',                                    category: 'Pregnancy',          standardCharge: 50000 },
    { code: 'O20.0',  description: 'Threatened abortion',                                     category: 'Pregnancy',          standardCharge: 10000 },
    { code: 'O24.4',  description: 'Diabetes mellitus arising in pregnancy',                  category: 'Pregnancy',          standardCharge: 12000 },
    { code: 'O36.0',  description: 'Maternal care for rhesus isoimmunisation',                category: 'Pregnancy',          standardCharge: 8000  },
    { code: 'O42.9',  description: 'Premature rupture of membranes, unspecified',             category: 'Pregnancy',          standardCharge: 25000 },
    { code: 'O60.1',  description: 'Preterm spontaneous labour with preterm delivery',        category: 'Pregnancy',          standardCharge: 60000 },
    { code: 'O80',    description: 'Encounter for full-term uncomplicated delivery',           category: 'Pregnancy',          standardCharge: 35000 },
    { code: 'O82',    description: 'Encounter for caesarean delivery',                        category: 'Pregnancy',          standardCharge: 80000 },
    { code: 'O86.0',  description: 'Infection of obstetric surgical wound',                   category: 'Pregnancy',          standardCharge: 12000 },

    // ── Injury & Trauma ──────────────────────────────────────────────────────
    { code: 'S00.9',  description: 'Superficial injury of head, unspecified',                 category: 'Injury & Trauma',    standardCharge: 5000  },
    { code: 'S06.0',  description: 'Concussion',                                              category: 'Injury & Trauma',    standardCharge: 12000 },
    { code: 'S06.9',  description: 'Intracranial injury, unspecified',                        category: 'Injury & Trauma',    standardCharge: 50000 },
    { code: 'S12.9',  description: 'Fracture of neck, unspecified',                           category: 'Injury & Trauma',    standardCharge: 60000 },
    { code: 'S22.0',  description: 'Fracture of thoracic vertebra',                           category: 'Injury & Trauma',    standardCharge: 70000 },
    { code: 'S32.0',  description: 'Fracture of lumbar vertebra',                             category: 'Injury & Trauma',    standardCharge: 70000 },
    { code: 'S42.2',  description: 'Fracture of upper end of humerus',                        category: 'Injury & Trauma',    standardCharge: 45000 },
    { code: 'S52.5',  description: 'Fracture of lower end of radius',                         category: 'Injury & Trauma',    standardCharge: 35000 },
    { code: 'S62.3',  description: 'Fracture of other metacarpal bone',                       category: 'Injury & Trauma',    standardCharge: 20000 },
    { code: 'S72.0',  description: 'Fracture of femoral neck',                                category: 'Injury & Trauma',    standardCharge: 120000},
    { code: 'S72.9',  description: 'Fracture of femur, unspecified',                          category: 'Injury & Trauma',    standardCharge: 100000},
    { code: 'S82.1',  description: 'Fracture of upper end of tibia',                          category: 'Injury & Trauma',    standardCharge: 65000 },
    { code: 'S82.6',  description: 'Fracture of lateral malleolus',                           category: 'Injury & Trauma',    standardCharge: 40000 },
    { code: 'S93.4',  description: 'Sprain of ankle',                                         category: 'Injury & Trauma',    standardCharge: 5000  },
    { code: 'T14.0',  description: 'Superficial injury of unspecified body region',           category: 'Injury & Trauma',    standardCharge: 3000  },
    { code: 'T30.0',  description: 'Burn of unspecified body region, unspecified degree',     category: 'Injury & Trauma',    standardCharge: 20000 },
    { code: 'T39.1',  description: 'Poisoning by 4-aminophenol derivatives',                  category: 'Injury & Trauma',    standardCharge: 8000  },
    { code: 'T78.1',  description: 'Other adverse food reactions',                             category: 'Injury & Trauma',    standardCharge: 5000  },
    { code: 'T78.4',  description: 'Allergy, unspecified',                                    category: 'Injury & Trauma',    standardCharge: 4000  },

    // ── Preventive / Wellness / Z-codes ─────────────────────────────────────
    { code: 'Z00.00', description: 'Encounter for general adult examination',                  category: 'Preventive',         standardCharge: 5000  },
    { code: 'Z00.01', description: 'Encounter for general adult examination with abnormal findings', category: 'Preventive',   standardCharge: 6000  },
    { code: 'Z01.0',  description: 'Encounter for examination of eyes and vision',            category: 'Preventive',         standardCharge: 3000  },
    { code: 'Z01.1',  description: 'Encounter for examination of ears and hearing',           category: 'Preventive',         standardCharge: 3000  },
    { code: 'Z03.89', description: 'Encounter for observation for other suspected disease ruled out', category: 'Preventive',  standardCharge: 5000  },
    { code: 'Z12.1',  description: 'Encounter for screening for intestinal tumours',          category: 'Preventive',         standardCharge: 8000  },
    { code: 'Z12.3',  description: 'Encounter for screening for malignant neoplasm of breast', category: 'Preventive',        standardCharge: 6000  },
    { code: 'Z12.4',  description: 'Encounter for screening for malignant neoplasm of cervix', category: 'Preventive',        standardCharge: 4000  },
    { code: 'Z23',    description: 'Encounter for immunisation',                              category: 'Preventive',         standardCharge: 3000  },
    { code: 'Z34.9',  description: 'Encounter for supervision of normal pregnancy, unspecified', category: 'Preventive',      standardCharge: 3500  },
    { code: 'Z39.0',  description: 'Encounter for care and examination immediately after delivery', category: 'Preventive',   standardCharge: 4000  },
    { code: 'Z51.1',  description: 'Encounter for antineoplastic chemotherapy',               category: 'Preventive',         standardCharge: 80000 },
    { code: 'Z51.5',  description: 'Encounter for palliative care',                           category: 'Preventive',         standardCharge: 15000 },
    { code: 'Z76.0',  description: 'Encounter for issue of repeat prescription',              category: 'Preventive',         standardCharge: 1500  },

    // ── COVID-19 & Emerging Infections ───────────────────────────────────────
    { code: 'U07.1',  description: 'COVID-19, virus identified',                              category: 'Infectious',         standardCharge: 15000 },
    { code: 'U07.2',  description: 'COVID-19, virus not identified (clinically diagnosed)',   category: 'Infectious',         standardCharge: 12000 },
  ]
  for (const c of icdCodes) {
    await prisma.iCD10Code.upsert({ where: { code: c.code }, update: { standardCharge: c.standardCharge }, create: c })
  }

  const cptCodes = [
    { code: '99213', description: 'Office visit, established patient, low complexity',       category: 'Evaluation and Management', serviceCategory: 'CONSULTATION', averageCost: 2500  },
    { code: '99214', description: 'Office visit, established patient, moderate complexity',  category: 'Evaluation and Management', serviceCategory: 'CONSULTATION', averageCost: 4000  },
    { code: '99231', description: 'Subsequent hospital care, low complexity',                category: 'Evaluation and Management', serviceCategory: 'CONSULTATION', averageCost: 3500  },
    { code: '99291', description: 'Critical care, first hour',                              category: 'Evaluation and Management', serviceCategory: 'CONSULTATION', averageCost: 20000 },
    { code: '85025', description: 'Complete blood count (CBC)',                             category: 'Pathology & Laboratory',    serviceCategory: 'LABORATORY',   averageCost: 1200  },
    { code: '80061', description: 'Lipid panel',                                            category: 'Pathology & Laboratory',    serviceCategory: 'LABORATORY',   averageCost: 2500  },
    { code: '82947', description: 'Blood glucose, quantitative',                            category: 'Pathology & Laboratory',    serviceCategory: 'LABORATORY',   averageCost: 700   },
    { code: '83036', description: 'Hemoglobin A1C',                                         category: 'Pathology & Laboratory',    serviceCategory: 'LABORATORY',   averageCost: 2000  },
    { code: '87207', description: 'Smear, primary source, special stain (malaria)',         category: 'Pathology & Laboratory',    serviceCategory: 'LABORATORY',   averageCost: 900   },
    { code: '87635', description: 'Infectious agent SARS-CoV-2 (COVID-19)',                category: 'Pathology & Laboratory',    serviceCategory: 'LABORATORY',   averageCost: 5000  },
    { code: '71046', description: 'Radiologic examination, chest; 2 views',                category: 'Radiology',                 serviceCategory: 'IMAGING',      averageCost: 4000  },
    { code: '76700', description: 'Ultrasound, abdominal, real time with image',           category: 'Radiology',                 serviceCategory: 'IMAGING',      averageCost: 6500  },
    { code: '70553', description: 'MRI brain with and without contrast',                   category: 'Radiology',                 serviceCategory: 'IMAGING',      averageCost: 30000 },
    { code: '93000', description: 'Electrocardiogram routine with interpretation',         category: 'Cardiology',                serviceCategory: 'PROCEDURE',    averageCost: 3000  },
    { code: '59510', description: 'Cesarean delivery, routine postpartum care',            category: 'Surgery',                   serviceCategory: 'PROCEDURE',    averageCost: 90000 },
    { code: '44950', description: 'Appendectomy',                                          category: 'Surgery',                   serviceCategory: 'PROCEDURE',    averageCost: 110000},
    { code: '92004', description: 'Ophthalmological exam, new patient',                    category: 'Ophthalmology',             serviceCategory: 'CONSULTATION', averageCost: 3000  },
    { code: '92340', description: 'Fitting spectacle frames',                              category: 'Ophthalmology',             serviceCategory: 'OTHER',        averageCost: 8000  },
  ]
  for (const c of cptCodes) {
    await prisma.cPTCode.upsert({ where: { code: c.code }, update: {}, create: c })
  }
  console.log(`✅ ICD-10 codes: ${icdCodes.length} | CPT codes: ${cptCodes.length}`)

  // ═══════════════════════════════════════════════════════════
  // 8b. GL — seed chart of accounts BEFORE claims (GL posts need accounts)
  // ═══════════════════════════════════════════════════════════
  await GLService.seedChartOfAccounts(tenant.id)
  console.log(`✅ Chart of Accounts: 24 standard accounts seeded (incl. 1150 Co-Contribution Receivable)`)

  // ═══════════════════════════════════════════════════════════
  // 9. CLAIMS — structured lines by category
  // ═══════════════════════════════════════════════════════════
  const activeMembers = await prisma.member.findMany({ where: { tenantId, status: 'ACTIVE' }, take: 12 })
  if (activeMembers.length > 0 && await prisma.claim.count({ where: { tenantId } }) === 0) {
    const m = activeMembers

    // CLAIM 1 — Outpatient, malaria, multi-line, APPROVED + GL posted
    const clm1 = await prisma.claim.create({ data: {
      tenantId, claimNumber: 'CLM-2024-00001', memberId: m[0].id, providerId: providers[0],
      serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
      dateOfService: new Date('2024-03-10'), attendingDoctor: 'Dr. Kariuki Mbugua',
      diagnoses: [{ icdCode: 'B54', description: 'Malaria, unspecified', isPrimary: true }],
      procedures: [], billedAmount: 5700, approvedAmount: 5700, status: 'APPROVED',
      decidedAt: new Date('2024-03-10'), receivedAt: new Date('2024-03-10'),
      claimLines: { create: [
        { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'General Consultation', cptCode: '99213', quantity: 1, unitCost: 2500, billedAmount: 2500, approvedAmount: 2500 },
        { lineNumber: 2, serviceCategory: 'LABORATORY',   description: 'Malaria Test (RDT)',   cptCode: '87207', quantity: 1, unitCost: 800,  billedAmount: 800,  approvedAmount: 800  },
        { lineNumber: 3, serviceCategory: 'LABORATORY',   description: 'Full Blood Count',     cptCode: '85025', quantity: 1, unitCost: 1200, billedAmount: 1200, approvedAmount: 1200 },
        { lineNumber: 4, serviceCategory: 'PHARMACY',     description: 'Antimalarial drugs',   cptCode: null,    quantity: 1, unitCost: 1200, billedAmount: 1200, approvedAmount: 1200 },
      ]},
    }})

    // CLAIM 2 — Inpatient, pneumonia, UNDER_REVIEW, multi-category lines
    const clm2 = await prisma.claim.create({ data: {
      tenantId, claimNumber: 'CLM-2024-00002', memberId: m[1].id, providerId: providers[0],
      serviceType: 'INPATIENT', benefitCategory: 'INPATIENT',
      dateOfService: new Date('2024-03-18'), admissionDate: new Date('2024-03-18'), dischargeDate: new Date('2024-03-21'),
      attendingDoctor: 'Dr. Anne Ochieng',
      diagnoses: [
        { icdCode: 'J18.9', description: 'Pneumonia, unspecified organism', isPrimary: true  },
        { icdCode: 'I10',   description: 'Essential hypertension',          isPrimary: false },
      ],
      procedures: [], billedAmount: 78500, status: 'UNDER_REVIEW',
      claimLines: { create: [
        { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Specialist Consultation',    cptCode: '99214', quantity: 1, unitCost: 4500,  billedAmount: 4500  },
        { lineNumber: 2, serviceCategory: 'CONSULTATION', description: 'Daily Ward Round x3 days',  cptCode: '99231', quantity: 3, unitCost: 3500,  billedAmount: 10500 },
        { lineNumber: 3, serviceCategory: 'LABORATORY',   description: 'Full Blood Count',           cptCode: '85025', quantity: 1, unitCost: 1200,  billedAmount: 1200  },
        { lineNumber: 4, serviceCategory: 'IMAGING',      description: 'Chest X-Ray (2 views)',      cptCode: '71046', quantity: 1, unitCost: 3500,  billedAmount: 3500  },
        { lineNumber: 5, serviceCategory: 'PHARMACY',     description: 'IV Antibiotics (amoxicillin)',cptCode: null,   quantity: 3, unitCost: 4500,  billedAmount: 13500 },
        { lineNumber: 6, serviceCategory: 'PHARMACY',     description: 'Antihypertensive medication', cptCode: null,  quantity: 1, unitCost: 1800,  billedAmount: 1800  },
        { lineNumber: 7, serviceCategory: 'OTHER',        description: 'Ward fees (3 nights)',        cptCode: null,  quantity: 3, unitCost: 14500, billedAmount: 43500 },
      ]},
    }})

    // CLAIM 3 — APPROVED with exception (manual rate override)
    const clm3 = await prisma.claim.create({ data: {
      tenantId, claimNumber: 'CLM-2024-00003', memberId: m[2]?.id ?? m[0].id, providerId: providers[2],
      serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
      dateOfService: new Date('2024-04-05'), attendingDoctor: 'Dr. Waweru',
      diagnoses: [{ icdCode: 'E11.9', description: 'Type 2 diabetes mellitus, unspecified', isPrimary: true }],
      procedures: [], billedAmount: 12800, approvedAmount: 9500, status: 'APPROVED',
      hasException: true, decidedAt: new Date('2024-04-06'), receivedAt: new Date('2024-04-05'),
      claimLines: { create: [
        { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Specialist Consultation (Endocrinologist)', cptCode: '99214', quantity: 1, unitCost: 5500, billedAmount: 5500, approvedAmount: 4500, isException: true, exceptionRef: 'EX-2024-001' },
        { lineNumber: 2, serviceCategory: 'LABORATORY',   description: 'HbA1c',                                    cptCode: '83036', quantity: 1, unitCost: 2000, billedAmount: 2000, approvedAmount: 1800 },
        { lineNumber: 3, serviceCategory: 'LABORATORY',   description: 'Lipid Profile',                            cptCode: '80061', quantity: 1, unitCost: 2500, billedAmount: 2500, approvedAmount: 2200 },
        { lineNumber: 4, serviceCategory: 'PHARMACY',     description: 'Metformin 500mg x 60 tabs',                cptCode: null,    quantity: 1, unitCost: 2800, billedAmount: 2800, approvedAmount: 1000 },
      ]},
    }})

    // Exception log on claim 3
    await prisma.exceptionLog.create({ data: {
      tenantId, entityType: 'CLAIM', entityId: clm3.id, entityRef: 'CLM-2024-00003', claimId: clm3.id,
      exceptionCode: 'MANUAL_OVERRIDE',
      reason: 'Provider billed above agreed tariff for specialist consultation. Approved at contracted rate.',
      notes: 'Nairobi Hospital charged KES 5,500 vs contracted KES 4,500. Rate dispute resolved. Pharmacy also reduced to formulary rate.',
      raisedById: users['CLAIMS_OFFICER'],
      status: 'APPROVED',
      resolvedById: users['SUPER_ADMIN'],
      resolvedAt: new Date('2024-04-07'),
      resolutionNote: 'Confirmed contracted rates applied. Provider notified to bill correctly.',
    }})

    // CLAIM 4 — Pending exception
    const clm4 = await prisma.claim.create({ data: {
      tenantId, claimNumber: 'CLM-2024-00004', memberId: m[3]?.id ?? m[0].id, providerId: providers[1],
      serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
      dateOfService: new Date('2024-05-12'), attendingDoctor: 'Dr. Jane Muthee',
      diagnoses: [{ icdCode: 'M54.5', description: 'Low back pain', isPrimary: true }],
      procedures: [], billedAmount: 6500, status: 'RECEIVED',
      hasException: true,
      claimLines: { create: [
        { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'General Consultation', cptCode: '99213', quantity: 1, unitCost: 2500, billedAmount: 2500 },
        { lineNumber: 2, serviceCategory: 'IMAGING',      description: 'Lumbar Spine X-Ray',   cptCode: '71046', quantity: 1, unitCost: 4000, billedAmount: 4000 },
      ]},
    }})
    await prisma.exceptionLog.create({ data: {
      tenantId, entityType: 'CLAIM', entityId: clm4.id, entityRef: 'CLM-2024-00004', claimId: clm4.id,
      exceptionCode: 'LATE_SUBMISSION',
      reason: 'Claim submitted 45 days after date of service. Policy allows 30 days.',
      raisedById: users['CLAIMS_OFFICER'], status: 'PENDING',
    }})

    // CLAIM 5 — DECLINED
    await prisma.claim.create({ data: {
      tenantId, claimNumber: 'CLM-2024-00005', memberId: m[4]?.id ?? m[0].id, providerId: providers[3],
      serviceType: 'OUTPATIENT', benefitCategory: 'DENTAL',
      dateOfService: new Date('2024-05-20'), attendingDoctor: 'Dr. Otieno',
      diagnoses: [{ icdCode: 'K21.0', description: 'GERD', isPrimary: true }],
      procedures: [], billedAmount: 3500, approvedAmount: 0, status: 'DECLINED',
      declineReasonCode: 'WAITING_PERIOD',
      declineNotes: 'Member enrolled on 15-Jan-2024. Dental waiting period is 90 days. Date of service 20-May is within the waiting period.',
      decidedAt: new Date('2024-05-22'), receivedAt: new Date('2024-05-21'),
      claimLines: { create: [
        { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Dental Consultation', quantity: 1, unitCost: 3500, billedAmount: 3500 },
      ]},
    }})

    // CLAIM 6 — Maternity (C-Section), APPROVED
    const clm6 = await prisma.claim.create({ data: {
      tenantId, claimNumber: 'CLM-2024-00006', memberId: m[5]?.id ?? m[0].id, providerId: providers[0],
      serviceType: 'INPATIENT', benefitCategory: 'MATERNITY',
      dateOfService: new Date('2024-06-15'), admissionDate: new Date('2024-06-15'), dischargeDate: new Date('2024-06-18'),
      attendingDoctor: 'Dr. Achieng',
      diagnoses: [{ icdCode: 'O82', description: 'Encounter for cesarean delivery', isPrimary: true }],
      procedures: [], billedAmount: 135000, approvedAmount: 120000, status: 'APPROVED',
      decidedAt: new Date('2024-06-20'), receivedAt: new Date('2024-06-19'),
      claimLines: { create: [
        { lineNumber: 1, serviceCategory: 'PROCEDURE',    description: 'Caesarean Section',       cptCode: '59510', quantity: 1, unitCost: 85000, billedAmount: 85000, approvedAmount: 85000 },
        { lineNumber: 2, serviceCategory: 'CONSULTATION', description: 'Anaesthesiologist fee',   cptCode: '99291', quantity: 1, unitCost: 15000, billedAmount: 15000, approvedAmount: 12000 },
        { lineNumber: 3, serviceCategory: 'PHARMACY',     description: 'Theatre consumables',     cptCode: null,    quantity: 1, unitCost: 12000, billedAmount: 12000, approvedAmount: 10000 },
        { lineNumber: 4, serviceCategory: 'OTHER',        description: 'Ward (private room 3 nights)', cptCode: null,quantity: 3, unitCost: 7667,  billedAmount: 23000, approvedAmount: 13000 },
      ]},
    }})

    // Adjudication logs
    await prisma.adjudicationLog.createMany({ data: [
      { claimId: clm1.id, userId: users['CLAIMS_OFFICER'], action: 'APPROVED', fromStatus: 'RECEIVED', toStatus: 'APPROVED', amount: 5700,   notes: 'All line items within tariff. Approved in full.' },
      { claimId: clm2.id, userId: users['CLAIMS_OFFICER'], action: 'REVIEW_STARTED', fromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW', notes: 'Awaiting discharge summary and lab results.' },
      { claimId: clm3.id, userId: users['CLAIMS_OFFICER'], action: 'APPROVED', fromStatus: 'RECEIVED', toStatus: 'APPROVED', amount: 9500,   notes: 'Approved at contracted rates. Exception logged for rate dispute.' },
      { claimId: clm6.id, userId: users['MEDICAL_OFFICER'], action: 'APPROVED', fromStatus: 'RECEIVED', toStatus: 'APPROVED', amount: 120000, notes: 'Maternity benefit. C-section approved. Theatre consumables capped at formulary.' },
    ]})

    // GL entries for approved claims
    await GLService.postClaimApproved(tenant.id, { sourceId: clm1.id, reference: 'CLM-2024-00001', amount: 5700,   postedById: users['CLAIMS_OFFICER'] })
    await GLService.postClaimApproved(tenant.id, { sourceId: clm3.id, reference: 'CLM-2024-00003', amount: 9500,   postedById: users['CLAIMS_OFFICER'] })
    await GLService.postClaimApproved(tenant.id, { sourceId: clm6.id, reference: 'CLM-2024-00006', amount: 120000, postedById: users['MEDICAL_OFFICER'] })

    console.log(`✅ Claims: 6 (multi-line, with exceptions and GL entries)`)
  } else {
    // Claims already exist — ensure claim GL entries are posted (idempotent: skip if already exist)
    const approvedClaims = await prisma.claim.findMany({
      where: { tenantId, status: 'APPROVED', claimNumber: { in: ['CLM-2024-00001', 'CLM-2024-00003', 'CLM-2024-00006'] } },
      select: { id: true, claimNumber: true, approvedAmount: true },
    })
    for (const clm of approvedClaims) {
      const already = await prisma.journalEntry.findFirst({ where: { tenantId: tenant.id, sourceId: clm.id } })
      if (!already && clm.approvedAmount) {
        await GLService.postClaimApproved(tenant.id, {
          sourceId: clm.id, reference: clm.claimNumber,
          amount: Number(clm.approvedAmount),
          postedById: users['CLAIMS_OFFICER'],
        })
      }
    }
    console.log(`✅ Claims: already seeded (${approvedClaims.length} claim GL entries ensured)`)
  }

  // ═══════════════════════════════════════════════════════════
  // 10. PRE-AUTHORIZATIONS (3)
  // ═══════════════════════════════════════════════════════════
  if (activeMembers.length > 0 && await prisma.preAuthorization.count({ where: { tenantId } }) === 0) {
    const m = activeMembers
    await prisma.preAuthorization.createMany({ data: [
      {
        tenantId, preauthNumber: 'PA-2024-00001', memberId: m[0].id, providerId: providers[0],
        serviceType: 'INPATIENT', benefitCategory: 'SURGICAL', submittedBy: 'PROVIDER',
        diagnoses: [{ icdCode: 'K35.9', description: 'Acute appendicitis', isPrimary: true }],
        procedures: [{ cptCode: '44950', description: 'Appendectomy', estimatedCost: 110000 }],
        estimatedCost: 120000, clinicalNotes: 'Acute abdomen. CT confirmed appendicitis. Emergency surgery required.',
        status: 'APPROVED', approvedAmount: 120000, approvedBy: users['MEDICAL_OFFICER'],
        approvedAt: new Date('2024-07-01'), validFrom: new Date('2024-07-01'), validUntil: new Date('2024-07-08'),
      },
      {
        tenantId, preauthNumber: 'PA-2024-00002', memberId: m[1]?.id ?? m[0].id, providerId: providers[3],
        serviceType: 'INPATIENT', benefitCategory: 'INPATIENT', submittedBy: 'MEMBER',
        diagnoses: [{ icdCode: 'I21.9', description: 'Acute myocardial infarction', isPrimary: true }],
        procedures: [{ cptCode: '99291', description: 'Critical care', estimatedCost: 180000 }],
        estimatedCost: 250000, clinicalNotes: 'STEMI confirmed. Admitted for cardiac monitoring and intervention.',
        status: 'UNDER_REVIEW', benefitRemaining: 1800000,
      },
      {
        tenantId, preauthNumber: 'PA-2024-00003', memberId: m[2]?.id ?? m[0].id, providerId: providers[1],
        serviceType: 'OUTPATIENT', benefitCategory: 'OPTICAL', submittedBy: 'MEMBER',
        diagnoses: [{ icdCode: 'H52.1', description: 'Myopia', isPrimary: true }],
        procedures: [{ cptCode: '92004', description: 'Eye examination', estimatedCost: 3000 }],
        estimatedCost: 16000, status: 'SUBMITTED', benefitRemaining: 40000,
      },
    ]})
    console.log(`✅ Pre-authorizations: 3`)
  }

  // ═══════════════════════════════════════════════════════════
  // 11. ENDORSEMENTS (4 types including TIER_CHANGE)
  // ═══════════════════════════════════════════════════════════
  if (await prisma.endorsement.count({ where: { tenantId } }) === 0) {
    const safaricomMember = await prisma.member.findFirst({ where: { groupId: safaricom.id, status: 'ACTIVE' } })
    await prisma.endorsement.createMany({ data: [
      {
        tenantId, endorsementNumber: 'END-2024-00001', groupId: safaricom.id,
        type: 'MEMBER_ADDITION', status: 'APPLIED', effectiveDate: new Date('2024-03-01'),
        changeDetails: { firstName: 'Aisha', lastName: 'Mwangi', dob: '1999-04-20', gender: 'FEMALE', relationship: 'CHILD', tierId: staffTier?.id },
        proratedAmount: 1875, previousPremium: 0, newPremium: 1875, premiumDelta: 1875,
        appliedAt: new Date('2024-03-01'), appliedBy: users['UNDERWRITER'],
      },
      {
        tenantId, endorsementNumber: 'END-2024-00002', groupId: safaricom.id,
        memberId: safaricomMember?.id,
        type: 'TIER_CHANGE', status: 'APPROVED', effectiveDate: new Date('2024-04-01'),
        changeDetails: { fromTier: 'Staff', toTier: 'Management', reason: 'Promotion to team lead' },
        proratedAmount: 33750, previousPremium: 30000, newPremium: 75000, premiumDelta: 45000,
        reviewedBy: users['UNDERWRITER'], reviewedAt: new Date('2024-03-28'),
      },
      {
        tenantId, endorsementNumber: 'END-2024-00003', groupId: otherGroups[0],
        type: 'PACKAGE_UPGRADE', status: 'SUBMITTED', effectiveDate: new Date('2024-07-01'),
        changeDetails: { fromPackage: 'Avenue Premier', toPackage: 'Avenue Executive', reason: 'Group renewal upgrade' },
        proratedAmount: 75000, previousPremium: 75000, newPremium: 150000, premiumDelta: 75000,
      },
      {
        tenantId, endorsementNumber: 'END-2024-00004', groupId: otherGroups[2],
        type: 'MEMBER_DELETION', status: 'APPLIED', effectiveDate: new Date('2024-05-31'),
        changeDetails: { reason: 'Resignation', lastDay: '2024-05-31', refundEligible: false },
        proratedAmount: -2500,
        appliedAt: new Date('2024-06-01'), appliedBy: users['CUSTOMER_SERVICE'],
      },
    ]})
    console.log(`✅ Endorsements: 4 (incl. TIER_CHANGE)`)
  }

  // ═══════════════════════════════════════════════════════════
  // 12. INVOICES & PAYMENTS (with GL auto-posting)
  // ═══════════════════════════════════════════════════════════
  if (await prisma.invoice.count({ where: { tenantId } }) === 0) {
    const inv1 = await prisma.invoice.create({ data: {
      tenantId, invoiceNumber: 'INV-2024-00001', groupId: safaricom.id,
      period: '2024-01', memberCount: 9, ratePerMember: 85000,
      totalAmount: 765000, paidAmount: 765000, balance: 0,
      dueDate: new Date('2024-01-31'), status: 'PAID', sentAt: new Date('2024-01-05'),
    }})
    await prisma.payment.create({ data: {
      groupId: safaricom.id, invoiceId: inv1.id,
      amount: 765000, paymentDate: new Date('2024-01-20'),
      paymentMethod: 'BANK_TRANSFER', referenceNumber: 'TRF-20240120-001',
    }})

    const inv2 = await prisma.invoice.create({ data: {
      tenantId, invoiceNumber: 'INV-2024-00002', groupId: otherGroups[0],
      period: '2024-01', memberCount: 4, ratePerMember: 75000,
      totalAmount: 300000, paidAmount: 150000, balance: 150000,
      dueDate: new Date('2024-01-31'), status: 'PARTIALLY_PAID', sentAt: new Date('2024-01-05'),
    }})
    await prisma.payment.create({ data: {
      groupId: otherGroups[0], invoiceId: inv2.id,
      amount: 150000, paymentDate: new Date('2024-01-25'),
      paymentMethod: 'BANK_TRANSFER', referenceNumber: 'TRF-20240125-001',
    }})

    await prisma.invoice.create({ data: {
      tenantId, invoiceNumber: 'INV-2024-00003', groupId: otherGroups[1],
      period: '2024-01', memberCount: 2, ratePerMember: 75000,
      totalAmount: 150000, paidAmount: 0, balance: 150000,
      dueDate: new Date('2024-01-31'), status: 'OVERDUE', sentAt: new Date('2024-01-05'),
    }})

    await prisma.invoice.create({ data: {
      tenantId, invoiceNumber: 'INV-2024-00004', groupId: otherGroups[2],
      period: '2024-01', memberCount: 2, ratePerMember: 30000,
      totalAmount: 60000, paidAmount: 0, balance: 60000,
      dueDate: new Date('2024-02-15'), status: 'DRAFT',
    }})

    // GL: post the sent invoices and payments
    await GLService.postInvoiceIssued(tenant.id, { sourceId: inv1.id, reference: 'INV-2024-00001', amount: 765000, postedById: users['FINANCE_OFFICER'] })
    await GLService.postPremiumReceived(tenant.id, { sourceId: inv1.id, reference: 'INV-2024-00001', amount: 765000, method: 'BANK_TRANSFER', postedById: users['FINANCE_OFFICER'] })
    await GLService.postInvoiceIssued(tenant.id, { sourceId: inv2.id, reference: 'INV-2024-00002', amount: 300000, postedById: users['FINANCE_OFFICER'] })
    await GLService.postPremiumReceived(tenant.id, { sourceId: inv2.id, reference: 'INV-2024-00002', amount: 150000, method: 'BANK_TRANSFER', postedById: users['FINANCE_OFFICER'] })

    console.log(`✅ Invoices: 4, Payments: 2 (with GL postings)`)
  }

  // ═══════════════════════════════════════════════════════════
  // 13. QUOTATIONS (3)
  // ═══════════════════════════════════════════════════════════
  if (await prisma.quotation.count({ where: { tenantId } }) === 0) {
    await prisma.quotation.createMany({ data: [
      {
        tenantId, quoteNumber: 'QUO-2024-00001', createdBy: users['UNDERWRITER'],
        prospectName: 'Standard Chartered Bank Kenya', prospectEmail: 'hr@stanbic.co.ke',
        prospectIndustry: 'Banking & Finance', memberCount: 320, dependentCount: 180,
        packageId: packages[2].id, ratePerMember: 142000,
        loadings: { claimsHistory: 10, industry: 5 },
        discounts: { groupSize: -8, loyalty: 0 },
        annualPremium: 45440000, finalPremium: 44089600,
        validUntil: new Date('2024-09-30'), status: 'SENT',
        pricingNotes: 'Age-banded analysis shows 68% of members between 30-45. Claims history from current insurer shows 74% loss ratio.',
      },
      {
        tenantId, quoteNumber: 'QUO-2024-00002', createdBy: users['UNDERWRITER'],
        brokerId: brokers[1],
        prospectName: 'Kenya Power & Lighting Co.', prospectEmail: 'hr@kplc.co.ke',
        prospectIndustry: 'Energy & Utilities', memberCount: 850, dependentCount: 620,
        packageId: packages[1].id, ratePerMember: 72000,
        loadings: { claimsHistory: 15, industry: 0 },
        discounts: { groupSize: -12, multiYear: -3 },
        annualPremium: 61200000, finalPremium: 57528000,
        validUntil: new Date('2024-08-15'), status: 'ACCEPTED',
        pricingNotes: 'Large group — preferred pricing. 3-year contract proposed.',
      },
      {
        tenantId, quoteNumber: 'QUO-2024-00003', createdBy: users['UNDERWRITER'],
        prospectName: 'Sendy Logistics Ltd', prospectEmail: 'ops@sendy.co.ke',
        prospectIndustry: 'Technology & Logistics', memberCount: 45, dependentCount: 30,
        packageId: packages[0].id, ratePerMember: 31500,
        loadings: { claimsHistory: 5 },
        discounts: {},
        annualPremium: 1417500, finalPremium: 1488375,
        validUntil: new Date('2024-07-31'), status: 'EXPIRED',
        pricingNotes: 'Small tech startup. Essential package only. No prior claims history.',
      },
    ]})
    console.log(`✅ Quotations: 3`)
  }

  // ═══════════════════════════════════════════════════════════
  // 14a. HISTORICAL MONTHLY INVOICES — Safaricom (repricing workbench)
  // ═══════════════════════════════════════════════════════════
  {
    const existing = await prisma.invoice.count({ where: { tenantId, groupId: safaricom.id } })
    if (existing < 6) {
      const months = [
        '2024-02','2024-03','2024-04','2024-05','2024-06',
        '2024-07','2024-08','2024-09','2024-10','2024-11','2024-12',
        '2025-01','2025-02','2025-03',
      ]
      for (const period of months) {
        const [yr, mo] = period.split('-').map(Number)
        const dueDate = new Date(yr, mo, 15)
        const sentAt  = new Date(yr, mo - 1, 5)
        await prisma.invoice.create({ data: {
          tenantId,
          invoiceNumber: `INV-SAF-${period.replace('-','')}`,
          groupId: safaricom.id,
          period, memberCount: 9, ratePerMember: 85000,
          totalAmount: 765000, paidAmount: 765000, balance: 0,
          dueDate, sentAt, status: 'PAID',
        }})
      }
      console.log(`✅ Safaricom monthly invoices: 14 months added (repricing workbench)`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 14b. HISTORICAL CLAIMS (Jun 2024 – Mar 2025) — repricing + chronic disease
  // ═══════════════════════════════════════════════════════════
  {
    const exists = await prisma.claim.findFirst({ where: { tenantId, claimNumber: 'CLM-HIST-001' } })
    if (!exists && activeMembers.length >= 4) {
      const m = activeMembers
      type HistClaim = {
        num: string; member: typeof m[0]; providerId: string
        date: string; icd: string; icdLabel: string
        cat: 'OUTPATIENT'|'INPATIENT'; benCat: 'OUTPATIENT'|'INPATIENT'|'CHRONIC_DISEASE'|'MENTAL_HEALTH'
        billed: number; approved: number
      }
      const histClaims: HistClaim[] = [
        { num:'001', member:m[0], providerId:providers[0], date:'2024-06-12', icd:'E11.9', icdLabel:'Type 2 diabetes mellitus, unspecified',       cat:'OUTPATIENT', benCat:'CHRONIC_DISEASE', billed:8500,   approved:7800  },
        { num:'002', member:m[1], providerId:providers[0], date:'2024-07-08', icd:'I10',   icdLabel:'Essential hypertension',                      cat:'OUTPATIENT', benCat:'OUTPATIENT',      billed:5200,   approved:5200  },
        { num:'003', member:m[2], providerId:providers[0], date:'2024-08-15', icd:'E11.9', icdLabel:'Type 2 diabetes mellitus, unspecified',       cat:'OUTPATIENT', benCat:'CHRONIC_DISEASE', billed:11200,  approved:10000 },
        { num:'004', member:m[3], providerId:providers[1], date:'2024-08-28', icd:'J18.9', icdLabel:'Pneumonia, unspecified organism',              cat:'INPATIENT',  benCat:'INPATIENT',       billed:55000,  approved:52000 },
        { num:'005', member:m[0], providerId:providers[0], date:'2024-09-20', icd:'E11.9', icdLabel:'Type 2 diabetes mellitus, unspecified',       cat:'OUTPATIENT', benCat:'CHRONIC_DISEASE', billed:7800,   approved:7800  },
        { num:'006', member:m[1], providerId:providers[2], date:'2024-10-10', icd:'I10',   icdLabel:'Essential hypertension',                      cat:'OUTPATIENT', benCat:'OUTPATIENT',      billed:12000,  approved:11500 },
        { num:'007', member:m[2], providerId:providers[0], date:'2024-10-28', icd:'F32.9', icdLabel:'Depressive episode, unspecified',             cat:'OUTPATIENT', benCat:'MENTAL_HEALTH',   billed:9000,   approved:9000  },
        { num:'008', member:m[3], providerId:providers[0], date:'2024-11-15', icd:'J45.9', icdLabel:'Asthma, uncomplicated',                       cat:'OUTPATIENT', benCat:'OUTPATIENT',      billed:6500,   approved:6500  },
        { num:'009', member:m[0], providerId:providers[1], date:'2024-12-05', icd:'M17.9', icdLabel:'Osteoarthritis of knee, unspecified',         cat:'OUTPATIENT', benCat:'OUTPATIENT',      billed:15000,  approved:14000 },
        { num:'010', member:m[1], providerId:providers[0], date:'2024-12-20', icd:'E11.9', icdLabel:'Type 2 diabetes mellitus, unspecified',       cat:'OUTPATIENT', benCat:'CHRONIC_DISEASE', billed:8200,   approved:8200  },
        { num:'011', member:m[2], providerId:providers[0], date:'2025-01-14', icd:'I10',   icdLabel:'Essential hypertension',                      cat:'OUTPATIENT', benCat:'OUTPATIENT',      billed:4800,   approved:4800  },
        { num:'012', member:m[3], providerId:providers[0], date:'2025-02-10', icd:'G40.9', icdLabel:'Epilepsy, unspecified',                       cat:'OUTPATIENT', benCat:'CHRONIC_DISEASE', billed:12500,  approved:12500 },
        { num:'013', member:m[0], providerId:providers[0], date:'2025-02-25', icd:'E11.9', icdLabel:'Type 2 diabetes mellitus, unspecified',       cat:'OUTPATIENT', benCat:'CHRONIC_DISEASE', billed:9100,   approved:9100  },
        { num:'014', member:m[1], providerId:providers[0], date:'2025-03-18', icd:'F41.9', icdLabel:'Anxiety disorder, unspecified',               cat:'OUTPATIENT', benCat:'MENTAL_HEALTH',   billed:6200,   approved:6200  },
      ]
      for (const hc of histClaims) {
        const d = new Date(hc.date)
        await prisma.claim.create({ data: {
          tenantId, claimNumber: `CLM-HIST-${hc.num}`,
          memberId: hc.member.id, providerId: hc.providerId,
          serviceType: hc.cat, benefitCategory: hc.benCat,
          dateOfService: d, createdAt: d,
          diagnoses: [{ icdCode: hc.icd, description: hc.icdLabel, isPrimary: true }],
          procedures: [], billedAmount: hc.billed, approvedAmount: hc.approved,
          status: 'APPROVED', decidedAt: d, receivedAt: d,
          claimLines: { create: [{
            lineNumber: 1, serviceCategory: 'CONSULTATION',
            description: 'Consultation', quantity: 1,
            unitCost: hc.billed, billedAmount: hc.billed, approvedAmount: hc.approved,
          }]},
        }})
      }
      console.log(`✅ Historical claims: ${histClaims.length} (Jun 2024–Mar 2025, chronic disease + repricing)`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 14c. BENEFIT USAGE — member utilisation tab + /api/v1/benefits
  // ═══════════════════════════════════════════════════════════
  {
    const usageCount = await prisma.benefitUsage.count()
    if (usageCount === 0 && activeMembers.length >= 2) {
      // Get benefit config IDs for Essential and Premier packages
      const essVersion = await prisma.packageVersion.findFirst({ where: { packageId: essentialPkg.id }, include: { benefits: true } })
      const premVersion = await prisma.packageVersion.findFirst({ where: { packageId: premierPkg.id }, include: { benefits: true } })
      const periodStart = new Date('2024-01-01')
      const periodEnd   = new Date('2024-12-31')

      // member[0] — Executive package member; member[6] (KCB) — Premier package member
      // Use members from activeMembers that match essential/premier packages
      const essMembers = activeMembers.filter(m => m.groupId === bamburiId || m.groupId === twigaId)
      const premMembers = activeMembers.filter(m => m.groupId === kcbId || m.groupId === eablId)

      if (essVersion && essMembers[0]) {
        const benInpatient  = essVersion.benefits.find(b => b.category === 'INPATIENT')
        const benOutpatient = essVersion.benefits.find(b => b.category === 'OUTPATIENT')
        const benDental     = essVersion.benefits.find(b => b.category === 'DENTAL')
        if (benInpatient)  await prisma.benefitUsage.create({ data: { memberId: essMembers[0].id, benefitConfigId: benInpatient.id,  periodStart, periodEnd, amountUsed: 320000, claimCount: 1 } })
        if (benOutpatient) await prisma.benefitUsage.create({ data: { memberId: essMembers[0].id, benefitConfigId: benOutpatient.id, periodStart, periodEnd, amountUsed: 45000,  claimCount: 4 } })
        if (benDental)     await prisma.benefitUsage.create({ data: { memberId: essMembers[0].id, benefitConfigId: benDental.id,     periodStart, periodEnd, amountUsed: 8500,   claimCount: 1 } })
      }
      if (premVersion && premMembers[0]) {
        const benInpatient  = premVersion.benefits.find(b => b.category === 'INPATIENT')
        const benOutpatient = premVersion.benefits.find(b => b.category === 'OUTPATIENT')
        const benMental     = premVersion.benefits.find(b => b.category === 'MENTAL_HEALTH')
        if (benInpatient)  await prisma.benefitUsage.create({ data: { memberId: premMembers[0].id, benefitConfigId: benInpatient.id,  periodStart, periodEnd, amountUsed: 850000, claimCount: 2 } })
        if (benOutpatient) await prisma.benefitUsage.create({ data: { memberId: premMembers[0].id, benefitConfigId: benOutpatient.id, periodStart, periodEnd, amountUsed: 125000, claimCount: 8 } })
        if (benMental)     await prisma.benefitUsage.create({ data: { memberId: premMembers[0].id, benefitConfigId: benMental.id,     periodStart, periodEnd, amountUsed: 62000,  claimCount: 3 } })
      }
      console.log(`✅ BenefitUsage: seeded for 2 members (utilisation tab + benefits API)`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 14d. FRAUD ALERTS — fraud dashboard
  // ═══════════════════════════════════════════════════════════
  {
    const fraudCount = await prisma.claimFraudAlert.count({ where: { tenantId } })
    if (fraudCount === 0) {
      const allClaims = await prisma.claim.findMany({ where: { tenantId }, select: { id: true }, take: 3 })
      if (allClaims.length >= 2) {
        await prisma.claimFraudAlert.createMany({ data: [
          {
            tenantId, claimId: allClaims[0].id,
            rule: 'Velocity Check',
            score: 87,
            severity: 'HIGH',
            notes: 'Member submitted 3 outpatient claims at the same provider within 5 days. Average claim value 4.2× group norm.',
          },
          {
            tenantId, claimId: allClaims[1].id,
            rule: 'Provider Billing Anomaly',
            score: 62,
            severity: 'MEDIUM',
            notes: 'Provider billed identical itemised line amounts across 6 different members in same week. Pattern inconsistent with normal clinical variation.',
          },
          {
            tenantId, claimId: allClaims[2]?.id ?? allClaims[0].id,
            rule: 'Amount Threshold Exceeded',
            score: 44,
            severity: 'LOW',
            notes: 'Single outpatient claim of KES 78,500 — 3× the 90th-percentile outpatient benchmark.',
            resolved: true,
            resolvedBy: users['SUPER_ADMIN'],
            resolvedAt: new Date('2024-08-10'),
          },
        ]})
        console.log(`✅ Fraud alerts: 3 (HIGH, MEDIUM, LOW/resolved)`)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 14e. COMPLAINTS — complaints management page
  // ═══════════════════════════════════════════════════════════
  {
    const complaintCount = await prisma.complaint.count({ where: { tenantId } })
    if (complaintCount === 0) {
      const complaintMember = activeMembers[0]
      await prisma.complaint.createMany({ data: [
        {
          tenantId, memberId: complaintMember?.id,
          subject: 'Claim reimbursement delayed beyond SLA',
          type: 'BILLING',
          description: 'Member submitted outpatient claim CLM-2024-00003 on 5 April 2024. As at 30 April, no payment received. SLA is 14 working days. Member is distressed.',
          status: 'INVESTIGATING',
        },
        {
          tenantId,
          subject: 'Aga Khan Hospital refused to accept Avenue card',
          type: 'FACILITY',
          description: 'Member presented at AKUH on 12 June 2024 for specialist visit. Front desk refused direct billing and demanded payment upfront. Member had to pay out of pocket and seek reimbursement.',
          status: 'OPEN',
        },
        {
          tenantId, memberId: activeMembers[1]?.id,
          subject: 'Wrong dental benefit applied — waiting period dispute',
          type: 'SERVICE',
          description: 'Member believes the dental waiting period was incorrectly calculated. Enrolled 1 Jan 2024, waiting period should end 31 Mar 2024, but claim on 2 Apr was declined.',
          status: 'RESOLVED',
          resolution: 'Reviewed enrollment date. Waiting period correctly applied (90 days). Member educated on benefit terms. No change to decision.',
          resolvedAt: new Date('2024-09-15'),
        },
        {
          tenantId,
          subject: 'SMS notifications not being received',
          type: 'SERVICE',
          description: 'Multiple members from KCB Group report not receiving claim status SMS notifications. Issue started after the October 2024 system migration.',
          status: 'DISMISSED',
          resolution: 'Investigated — members had opted out of SMS via the app. No system fault found.',
          resolvedAt: new Date('2024-11-03'),
        },
      ]})
      console.log(`✅ Complaints: 4 (OPEN, INVESTIGATING, RESOLVED, DISMISSED)`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 14f. SMART CARD ISSUANCE — card tab on member profile
  // ═══════════════════════════════════════════════════════════
  {
    const cardMember = await prisma.member.findFirst({ where: { tenantId, smartCardNumber: null, status: 'ACTIVE' } })
    if (cardMember) {
      await prisma.member.update({
        where: { id: cardMember.id },
        data: { smartCardNumber: `SC-2024-${String(cardMember.memberNumber).slice(-5)}` },
      })
      await prisma.activityLog.create({ data: {
        entityType: 'MEMBER', entityId: cardMember.id, memberId: cardMember.id,
        action: 'CARD_ISSUED',
        description: `SMART card issued: SC-2024-${String(cardMember.memberNumber).slice(-5)}`,
        userId: users['CUSTOMER_SERVICE'],
        metadata: { cardNumber: `SC-2024-${String(cardMember.memberNumber).slice(-5)}`, isReissue: false },
      }})
    }
    // A second member with a re-issued card
    const cardMember2 = await prisma.member.findFirst({ where: { tenantId, smartCardNumber: null, status: 'ACTIVE', id: { not: cardMember?.id } } })
    if (cardMember2) {
      const oldCard = `SC-2023-${String(cardMember2.memberNumber).slice(-5)}`
      const newCard = `SC-2024-${String(cardMember2.memberNumber).slice(-5)}R`
      await prisma.member.update({ where: { id: cardMember2.id }, data: { smartCardNumber: newCard } })
      await prisma.activityLog.createMany({ data: [
        {
          entityType: 'MEMBER', entityId: cardMember2.id, memberId: cardMember2.id,
          action: 'CARD_ISSUED',
          description: `SMART card issued: ${oldCard}`,
          userId: users['CUSTOMER_SERVICE'],
          metadata: { cardNumber: oldCard, isReissue: false },
        },
        {
          entityType: 'MEMBER', entityId: cardMember2.id, memberId: cardMember2.id,
          action: 'CARD_ISSUED',
          description: `SMART card re-issued. New card: ${newCard} (previously: ${oldCard})`,
          userId: users['CUSTOMER_SERVICE'],
          metadata: { cardNumber: newCard, isReissue: true },
        },
      ]})
    }
    console.log(`✅ Smart card issuance: 2 members with cards + activity history`)
  }

  // ═══════════════════════════════════════════════════════════
  // 14g. DOCUMENTS — document upload feature on claims/preauths
  // ═══════════════════════════════════════════════════════════
  {
    const docCount = await prisma.document.count()
    if (docCount === 0) {
      const seedClaim   = await prisma.claim.findFirst({ where: { tenantId }, select: { id: true } })
      const seedPreauth = await prisma.preAuthorization.findFirst({ where: { tenantId }, select: { id: true } })
      const seedGroup   = safaricom
      const uploader    = users['CLAIMS_OFFICER']
      await prisma.document.createMany({ data: [
        {
          fileName: 'discharge_summary_CLM-2024-00006.pdf', mimeType: 'application/pdf', fileSize: 284512,
          fileUrl: '/seed-docs/discharge_summary_CLM-2024-00006.pdf',
          category: 'DISCHARGE_SUMMARY', uploadedBy: uploader,
          claimId: seedClaim?.id,
        },
        {
          fileName: 'lab_results_CLM-2024-00001.pdf', mimeType: 'application/pdf', fileSize: 102400,
          fileUrl: '/seed-docs/lab_results_CLM-2024-00001.pdf',
          category: 'LAB_RESULT', uploadedBy: uploader,
          claimId: seedClaim?.id,
        },
        {
          fileName: 'preauth_clinical_notes_PA-2024-00001.pdf', mimeType: 'application/pdf', fileSize: 156800,
          fileUrl: '/seed-docs/preauth_clinical_notes_PA-2024-00001.pdf',
          category: 'CLAIM_SUPPORT', uploadedBy: uploader,
          preauthId: seedPreauth?.id,
        },
        {
          fileName: 'Safaricom_Group_Contract_2024.pdf', mimeType: 'application/pdf', fileSize: 512000,
          fileUrl: '/seed-docs/Safaricom_Group_Contract_2024.pdf',
          category: 'AGREEMENT', uploadedBy: users['UNDERWRITER'],
          groupId: seedGroup.id,
        },
      ]})
      console.log(`✅ Documents: 4 (discharge summary, lab results, clinical notes, group contract)`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 14h. ACTIVITY LOGS — member activity log tab
  // ═══════════════════════════════════════════════════════════
  {
    const logCount = await prisma.activityLog.count({ where: { entityType: 'MEMBER' } })
    if (logCount < 3 && activeMembers.length >= 2) {
      const m0 = activeMembers[0]
      const m1 = activeMembers[1]
      await prisma.activityLog.createMany({ data: [
        { entityType:'MEMBER', entityId:m0.id, memberId:m0.id, action:'MEMBER_ACTIVATED', description:'Member activated after premium confirmed.', userId: users['CUSTOMER_SERVICE'] },
        { entityType:'MEMBER', entityId:m0.id, memberId:m0.id, action:'CLAIM_SUBMITTED',  description:'Claim CLM-2024-00001 submitted by member at Avenue Hospital Parklands.', userId: users['CLAIMS_OFFICER'] },
        { entityType:'MEMBER', entityId:m0.id, memberId:m0.id, action:'CLAIM_APPROVED',   description:'Claim CLM-2024-00001 approved — KES 5,700 authorised.', userId: users['CLAIMS_OFFICER'] },
        { entityType:'MEMBER', entityId:m1.id, memberId:m1.id, action:'MEMBER_ACTIVATED', description:'Member activated after group enrollment confirmation.', userId: users['CUSTOMER_SERVICE'] },
        { entityType:'MEMBER', entityId:m1.id, memberId:m1.id, action:'PREAUTH_REQUESTED',description:'Pre-authorisation PA-2024-00002 submitted for cardiac inpatient admission.', userId: users['CLAIMS_OFFICER'] },
        { entityType:'MEMBER', entityId:m1.id, memberId:m1.id, action:'STATUS_CHANGED',   description:'Member status changed from PENDING_ACTIVATION to ACTIVE.', userId: users['SUPER_ADMIN'] },
      ]})
      console.log(`✅ Activity logs: 6 member entries`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 14i. FRAUD RULE DEMONSTRATIONS — one claim per new detection rule
  //      Each claim is seeded with its corresponding ClaimFraudAlert so the
  //      fraud dashboard shows every new rule firing with realistic evidence.
  // ═══════════════════════════════════════════════════════════
  {
    const exists = await prisma.claim.findFirst({ where: { tenantId, claimNumber: 'CLM-FRAUD-001' } })
    if (!exists && activeMembers.length >= 2) {
      const parklands = providers[0] // Avenue Hospital - Parklands (has CPT 99213 @ 2,500)
      const nairobi   = providers[2] // Nairobi Hospital            (has CPT 99213 @ 3,000)

      // Need a guaranteed MALE member for the gender-mismatch scenario
      const maleMember  = activeMembers.find(m => m.gender === 'MALE') ?? activeMembers[0]
      const anyMember   = activeMembers.find(m => m.id !== maleMember.id) ?? activeMembers[0]

      // ── RULE-TEMP-001: Discharge before admission (CRITICAL) ─────────────
      // dischargeDate (2025-01-28) is before dateOfService/admission (2025-02-01)
      const f1 = await prisma.claim.create({ data: {
        tenantId, claimNumber: 'CLM-FRAUD-001',
        memberId: anyMember.id, providerId: nairobi,
        serviceType: 'INPATIENT', benefitCategory: 'INPATIENT',
        dateOfService:  new Date('2025-02-01'), // admission
        dischargeDate:  new Date('2025-01-28'), // ← before admission — impossible
        lengthOfStay: 3,
        diagnoses:  [{ icdCode: 'J18.9', description: 'Pneumonia, unspecified organism', isPrimary: true }],
        procedures: [],
        billedAmount: 48500, approvedAmount: 0,
        status: 'UNDER_REVIEW',
        claimLines: { create: [
          { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Admission consultation', quantity: 1, unitCost: 3500,  billedAmount: 3500,  approvedAmount: 0 },
          { lineNumber: 2, serviceCategory: 'PROCEDURE',    description: 'Inpatient ward — 4 days @ KES 8,500/day', quantity: 4, unitCost: 8500, billedAmount: 34000, approvedAmount: 0 },
          { lineNumber: 3, serviceCategory: 'PHARMACY',     description: 'IV antibiotics course', quantity: 1, unitCost: 11000, billedAmount: 11000, approvedAmount: 0 },
        ]},
      }})
      await prisma.claimFraudAlert.create({ data: {
        tenantId, claimId: f1.id,
        rule: 'Discharge Date Before Admission Date',
        score: 95, severity: 'CRITICAL',
        notes: 'Discharge (2025-01-28) is before admission (2025-02-01). Chronologically impossible — likely a date entry error or deliberate manipulation to obscure the service window.',
      }})

      // ── RULE-CLIN-001: Gender-procedure mismatch (CRITICAL) ──────────────
      // CPT 58150 = Total abdominal hysterectomy (female-only) on a MALE member
      const f2 = await prisma.claim.create({ data: {
        tenantId, claimNumber: 'CLM-FRAUD-002',
        memberId: maleMember.id, providerId: nairobi,
        serviceType: 'INPATIENT', benefitCategory: 'SURGICAL',
        dateOfService: new Date('2025-03-05'),
        diagnoses:  [{ icdCode: 'N83.2', description: 'Other and unspecified ovarian cysts', isPrimary: true }],
        procedures: [{ cptCode: '58150', description: 'Total abdominal hysterectomy', qty: 1, total: 145000 }],
        billedAmount: 145000, approvedAmount: 0,
        status: 'UNDER_REVIEW',
        claimLines: { create: [
          { lineNumber: 1, serviceCategory: 'PROCEDURE',    description: 'Total Abdominal Hysterectomy (CPT 58150)', cptCode: '58150', quantity: 1, unitCost: 120000, billedAmount: 120000, approvedAmount: 0 },
          { lineNumber: 2, serviceCategory: 'CONSULTATION', description: 'Pre-operative surgical assessment',        quantity: 1, unitCost:  8000, billedAmount:   8000, approvedAmount: 0 },
          { lineNumber: 3, serviceCategory: 'PHARMACY',     description: 'Post-operative medication pack',           quantity: 1, unitCost: 17000, billedAmount:  17000, approvedAmount: 0 },
        ]},
      }})
      await prisma.claimFraudAlert.create({ data: {
        tenantId, claimId: f2.id,
        rule: 'Gender-Procedure Mismatch',
        score: 98, severity: 'CRITICAL',
        notes: `CPT 58150 (female-only: Total abdominal hysterectomy) billed on a MALE member. The diagnosis code N83.2 (ovarian cysts) also cannot apply to a male patient. Requires immediate clinical review — either the CPT/ICD codes are wrong or the member record is wrong.`,
      }})

      // ── RULE-BILL-003: Billed amount exceeds contracted tariff >15% (HIGH)
      // CPT 99213 agreed rate at Parklands = KES 2,500 — billed at KES 4,200 (+68%)
      // CPT 87207 (malaria RDT) agreed rate at Parklands = KES 800 — billed at KES 1,400 (+75%)
      const f3 = await prisma.claim.create({ data: {
        tenantId, claimNumber: 'CLM-FRAUD-003',
        memberId: anyMember.id, providerId: parklands,
        serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
        dateOfService: new Date('2025-03-12'),
        diagnoses:  [{ icdCode: 'J06.9', description: 'Acute upper respiratory infection, unspecified', isPrimary: true }],
        procedures: [{ cptCode: '99213', description: 'Office visit', qty: 1, total: 4200 }],
        billedAmount: 9900, approvedAmount: 0,
        status: 'RECEIVED',
        claimLines: { create: [
          { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'General Consultation (CPT 99213)', cptCode: '99213', quantity: 1, unitCost: 4200, billedAmount: 4200, approvedAmount: 0, tariffRate: 2500 },
          { lineNumber: 2, serviceCategory: 'PHARMACY',     description: 'Antibiotics + antihistamines (5-day pack)',    quantity: 1, unitCost: 4300, billedAmount: 4300, approvedAmount: 0 },
          { lineNumber: 3, serviceCategory: 'LABORATORY',   description: 'Malaria RDT (CPT 87207)',          cptCode: '87207', quantity: 1, unitCost: 1400, billedAmount: 1400, approvedAmount: 0, tariffRate:  800 },
        ]},
      }})
      await prisma.claimFraudAlert.create({ data: {
        tenantId, claimId: f3.id,
        rule: 'Billed Amount Exceeds Contracted Tariff',
        score: 75, severity: 'HIGH',
        notes: 'Line 1 (CPT 99213): billed KES 4,200 vs agreed KES 2,500 — 68% over tariff. Line 3 (CPT 87207): billed KES 1,400 vs agreed KES 800 — 75% over tariff. Provider is operating significantly outside contracted rates.',
      }})

      // ── RULE-BILL-004: Round-number clustering (MEDIUM) ──────────────────
      // All 4 lines are exact KES 1,000 multiples — unusual for real clinical bills
      const f4 = await prisma.claim.create({ data: {
        tenantId, claimNumber: 'CLM-FRAUD-004',
        memberId: maleMember.id, providerId: nairobi,
        serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
        dateOfService: new Date('2025-03-20'),
        diagnoses:  [{ icdCode: 'M54.5', description: 'Low back pain', isPrimary: true }],
        procedures: [],
        billedAmount: 28000, approvedAmount: 0,
        status: 'RECEIVED',
        claimLines: { create: [
          { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Specialist orthopaedic consultation', quantity: 1, unitCost:  5000, billedAmount:  5000, approvedAmount: 0 },
          { lineNumber: 2, serviceCategory: 'IMAGING',      description: 'Lumbar spine X-Ray (2 views)',         quantity: 1, unitCost:  8000, billedAmount:  8000, approvedAmount: 0 },
          { lineNumber: 3, serviceCategory: 'PROCEDURE',    description: 'Physiotherapy (initial session)',       quantity: 1, unitCost:  7000, billedAmount:  7000, approvedAmount: 0 },
          { lineNumber: 4, serviceCategory: 'PHARMACY',     description: 'Analgesics + muscle relaxants',        quantity: 1, unitCost:  8000, billedAmount:  8000, approvedAmount: 0 },
        ]},
      }})
      await prisma.claimFraudAlert.create({ data: {
        tenantId, claimId: f4.id,
        rule: 'Round-Number Billing Pattern',
        score: 55, severity: 'MEDIUM',
        notes: '4 of 4 claim lines billed at exact KES 1,000 multiples (KES 5,000 / 8,000 / 7,000 / 8,000). Real clinical bills — especially pharmacy and lab — typically include odd amounts. Possible use of estimated rather than actual charges.',
      }})

      // ── RULE-TEMP-004: Duplicate claim (HIGH on the later submission) ─────
      // CLM-FRAUD-005 was approved. CLM-FRAUD-006 is a near-duplicate (2.6% amount diff)
      const dupDate = new Date('2025-01-22')
      const f5a = await prisma.claim.create({ data: {
        tenantId, claimNumber: 'CLM-FRAUD-005',
        memberId: anyMember.id, providerId: parklands,
        serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
        dateOfService: dupDate,
        diagnoses:  [{ icdCode: 'I10', description: 'Essential hypertension', isPrimary: true }],
        procedures: [],
        billedAmount: 7500, approvedAmount: 7500,
        status: 'APPROVED', decidedAt: new Date('2025-01-24'),
        claimLines: { create: [
          { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Specialist cardiology consultation', quantity: 1, unitCost: 4500, billedAmount: 4500, approvedAmount: 4500 },
          { lineNumber: 2, serviceCategory: 'PHARMACY',     description: 'Antihypertensives — 30-day supply',  quantity: 1, unitCost: 3000, billedAmount: 3000, approvedAmount: 3000 },
        ]},
      }})
      const f5b = await prisma.claim.create({ data: {
        tenantId, claimNumber: 'CLM-FRAUD-006',
        memberId: anyMember.id, providerId: parklands,
        serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
        dateOfService: dupDate, // identical date
        diagnoses:  [{ icdCode: 'I10', description: 'Essential hypertension', isPrimary: true }],
        procedures: [],
        billedAmount: 7700, approvedAmount: 0, // KES 200 difference — within 5% duplicate tolerance
        status: 'UNDER_REVIEW',
        claimLines: { create: [
          { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Specialist cardiology consultation', quantity: 1, unitCost: 4700, billedAmount: 4700, approvedAmount: 0 },
          { lineNumber: 2, serviceCategory: 'PHARMACY',     description: 'Antihypertensives — 30-day supply',  quantity: 1, unitCost: 3000, billedAmount: 3000, approvedAmount: 0 },
        ]},
      }})
      void f5a
      await prisma.claimFraudAlert.create({ data: {
        tenantId, claimId: f5b.id,
        rule: 'Probable Duplicate Claim',
        score: 90, severity: 'HIGH',
        notes: `Near-identical to CLM-FRAUD-005 (same member, same provider, same service date 2025-01-22). Billed amounts differ by only KES 200 (2.6%) — within the 5% duplicate tolerance. CLM-FRAUD-005 was already approved and paid. One claim should be voided.`,
      }})

      // ── RULE-FIN-004: Split billing (MEDIUM on the second claim) ─────────
      // Two outpatient claims same member + same provider + same day
      const splitDate = new Date('2025-02-14')
      const f6a = await prisma.claim.create({ data: {
        tenantId, claimNumber: 'CLM-FRAUD-007',
        memberId: maleMember.id, providerId: nairobi,
        serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
        dateOfService: splitDate,
        diagnoses:  [{ icdCode: 'E11.9', description: 'Type 2 diabetes mellitus, unspecified', isPrimary: true }],
        procedures: [],
        billedAmount: 12000, approvedAmount: 0,
        status: 'RECEIVED',
        claimLines: { create: [
          { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Endocrinology consultation', quantity: 1, unitCost: 5500, billedAmount:  5500, approvedAmount: 0 },
          { lineNumber: 2, serviceCategory: 'LABORATORY',   description: 'HbA1c + fasting glucose',   quantity: 1, unitCost: 6500, billedAmount:  6500, approvedAmount: 0 },
        ]},
      }})
      void f6a
      const f6b = await prisma.claim.create({ data: {
        tenantId, claimNumber: 'CLM-FRAUD-008',
        memberId: maleMember.id, providerId: nairobi,
        serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
        dateOfService: splitDate, // same day as CLM-FRAUD-007
        diagnoses:  [{ icdCode: 'E11.65', description: 'Type 2 diabetes mellitus with hyperglycaemia', isPrimary: true }],
        procedures: [],
        billedAmount: 9500, approvedAmount: 0,
        status: 'RECEIVED',
        claimLines: { create: [
          { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Diabetic follow-up visit',           quantity: 1, unitCost: 3500, billedAmount: 3500, approvedAmount: 0 },
          { lineNumber: 2, serviceCategory: 'PHARMACY',     description: 'Insulin + metformin — 3-month pack', quantity: 1, unitCost: 6000, billedAmount: 6000, approvedAmount: 0 },
        ]},
      }})
      await prisma.claimFraudAlert.create({ data: {
        tenantId, claimId: f6b.id,
        rule: 'Probable Split Billing',
        score: 72, severity: 'MEDIUM',
        notes: `2 outpatient claims from the same member at Nairobi Hospital on 2025-02-14 (CLM-FRAUD-007 KES 12,000 + CLM-FRAUD-008 KES 9,500 = KES 21,500 combined). Services appear related — submitting as two claims may be deliberate to stay below single-visit review thresholds.`,
      }})

      console.log('✅ Fraud demonstrations: 8 claims covering 6 new detection rules (TEMP-001, CLIN-001, BILL-003, BILL-004, TEMP-004, FIN-004)')
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 15. CO-CONTRIBUTION RULES & CAPS
  // ═══════════════════════════════════════════════════════════
  //
  // Demonstrates the full rules hierarchy:
  //   Essential  — outpatient 10% (all tiers) + Dental KES 500 fixed (Tier 2/3)
  //                + annual individual cap KES 8,000 / family KES 20,000
  //   Premier    — outpatient 5% Tier 2/3, free at own (NONE Tier 1)
  //                + Dental KES 1,000 fixed Tier 3
  //                + annual individual cap KES 15,000
  //   Executive  — no co-contribution on any tier (NONE global)
  //
  // After rules, creates sample CoContributionTransactions on existing claims
  // to show each collection status: PENDING, COLLECTED (M-Pesa), WAIVED.
  {
    const existingRule = await prisma.coContributionRule.findFirst({
      where: { tenantId, packageId: packages[0]!.id },
    })

    if (!existingRule) {
      const essentialPkg = packages.find(p => p.name === 'Avenue Essential')!
      const premierPkg   = packages.find(p => p.name === 'Avenue Premier')!
      const execPkg      = packages.find(p => p.name === 'Avenue Executive')!

      // ── Essential: outpatient 10% applies to all network tiers ───────────
      for (const tier of ['TIER_1', 'TIER_2', 'TIER_3'] as const) {
        await prisma.coContributionRule.create({ data: {
          tenantId, packageId: essentialPkg.id,
          benefitCategory: 'OUTPATIENT', networkTier: tier,
          type: 'PERCENTAGE', percentage: 10,
          perVisitCap: null, effectiveFrom: new Date('2024-01-01'),
        }})
      }
      // Essential: Dental — fixed KES 500 on partner/panel tiers, free at own
      await prisma.coContributionRule.create({ data: {
        tenantId, packageId: essentialPkg.id,
        benefitCategory: 'DENTAL', networkTier: 'TIER_1',
        type: 'NONE', effectiveFrom: new Date('2024-01-01'),
      }})
      await prisma.coContributionRule.create({ data: {
        tenantId, packageId: essentialPkg.id,
        benefitCategory: 'DENTAL', networkTier: 'TIER_2',
        type: 'FIXED_AMOUNT', fixedAmount: 500, perVisitCap: 500,
        effectiveFrom: new Date('2024-01-01'),
      }})
      await prisma.coContributionRule.create({ data: {
        tenantId, packageId: essentialPkg.id,
        benefitCategory: 'DENTAL', networkTier: 'TIER_3',
        type: 'FIXED_AMOUNT', fixedAmount: 800, perVisitCap: 800,
        effectiveFrom: new Date('2024-01-01'),
      }})

      // Essential: Annual cap
      await prisma.annualCoContributionCap.upsert({
        where: { packageId: essentialPkg.id },
        update: {},
        create: { tenantId, packageId: essentialPkg.id, individualCap: 8000, familyCap: 20000 },
      })

      // ── Premier: Outpatient — free at Tier 1, 5% at Tier 2, 10% at Tier 3 ─
      await prisma.coContributionRule.create({ data: {
        tenantId, packageId: premierPkg.id,
        benefitCategory: 'OUTPATIENT', networkTier: 'TIER_1',
        type: 'NONE', effectiveFrom: new Date('2024-01-01'),
      }})
      await prisma.coContributionRule.create({ data: {
        tenantId, packageId: premierPkg.id,
        benefitCategory: 'OUTPATIENT', networkTier: 'TIER_2',
        type: 'PERCENTAGE', percentage: 5, perVisitCap: 2000,
        effectiveFrom: new Date('2024-01-01'),
      }})
      await prisma.coContributionRule.create({ data: {
        tenantId, packageId: premierPkg.id,
        benefitCategory: 'OUTPATIENT', networkTier: 'TIER_3',
        type: 'PERCENTAGE', percentage: 10, perVisitCap: 3000,
        effectiveFrom: new Date('2024-01-01'),
      }})
      // Premier: Dental — fixed KES 1,000 for Tier 3 only
      await prisma.coContributionRule.create({ data: {
        tenantId, packageId: premierPkg.id,
        benefitCategory: 'DENTAL', networkTier: 'TIER_3',
        type: 'FIXED_AMOUNT', fixedAmount: 1000,
        effectiveFrom: new Date('2024-01-01'),
      }})

      // Premier: Annual individual cap only
      await prisma.annualCoContributionCap.upsert({
        where: { packageId: premierPkg.id },
        update: {},
        create: { tenantId, packageId: premierPkg.id, individualCap: 15000, familyCap: null },
      })

      // ── Executive: No co-contribution on anything ─────────────────────────
      for (const tier of ['TIER_1', 'TIER_2', 'TIER_3'] as const) {
        await prisma.coContributionRule.create({ data: {
          tenantId, packageId: execPkg.id,
          benefitCategory: null, networkTier: tier,
          type: 'NONE', effectiveFrom: new Date('2024-01-01'),
        }})
      }

      console.log('✅ Co-contribution rules: Essential (10% OPD + Dental tiers) + Premier (tiered OPD) + Executive (none)')

      // ── Sample transactions on existing claims ────────────────────────────
      // CLM-001: PENDING (member owes KES 800 on a KES 8,000 outpatient visit)
      const clm1 = await prisma.claim.findFirst({ where: { tenantId, claimNumber: 'CLM-001' } })
      if (clm1) {
        const existing = await prisma.coContributionTransaction.findUnique({ where: { claimId: clm1.id } })
        if (!existing) {
          const rule1 = await prisma.coContributionRule.findFirst({
            where: { tenantId, packageId: essentialPkg.id, benefitCategory: 'OUTPATIENT', networkTier: 'TIER_1' },
          })
          await prisma.coContributionTransaction.create({ data: {
            tenantId, claimId: clm1.id, memberId: clm1.memberId,
            coContributionRuleId: rule1?.id,
            serviceCost: clm1.billedAmount,
            calculatedAmount: 800, cappedAmount: 800, finalAmount: 800,
            planShare: Number(clm1.billedAmount) - 800,
            annualCapApplied: false, capsApplied: [],
            collectionStatus: 'PENDING',
          }})
          await prisma.memberAnnualCoContribution.upsert({
            where: { memberId_membershipYear: { memberId: clm1.memberId, membershipYear: 2025 } },
            update: {},
            create: { tenantId, memberId: clm1.memberId, membershipYear: 2025, totalCoContribution: 800, capReached: false },
          })
        }
      }

      // CLM-002: COLLECTED via M-Pesa (KES 400 collected)
      const clm2 = await prisma.claim.findFirst({ where: { tenantId, claimNumber: 'CLM-002' } })
      if (clm2) {
        const existing = await prisma.coContributionTransaction.findUnique({ where: { claimId: clm2.id } })
        if (!existing) {
          const rule2 = await prisma.coContributionRule.findFirst({
            where: { tenantId, packageId: essentialPkg.id, benefitCategory: 'OUTPATIENT', networkTier: 'TIER_1' },
          })
          await prisma.coContributionTransaction.create({ data: {
            tenantId, claimId: clm2.id, memberId: clm2.memberId,
            coContributionRuleId: rule2?.id,
            serviceCost: clm2.billedAmount,
            calculatedAmount: 400, cappedAmount: 400, finalAmount: 400,
            planShare: Number(clm2.billedAmount) - 400,
            annualCapApplied: false, capsApplied: [],
            collectionStatus: 'COLLECTED',
            amountCollected: 400,
            paymentMethod: 'MPESA',
            mpesaTransactionRef: 'QHX9872KAB',
            collectedAt: new Date('2025-03-10T09:15:00Z'),
          }})
          await prisma.memberAnnualCoContribution.upsert({
            where: { memberId_membershipYear: { memberId: clm2.memberId, membershipYear: 2025 } },
            update: { totalCoContribution: { increment: 400 } },
            create: { tenantId, memberId: clm2.memberId, membershipYear: 2025, totalCoContribution: 400, capReached: false },
          })
        }
      }

      // CLM-003: WAIVED (senior member, financial hardship documented)
      const clm3 = await prisma.claim.findFirst({ where: { tenantId, claimNumber: 'CLM-003' } })
      if (clm3) {
        const existing = await prisma.coContributionTransaction.findUnique({ where: { claimId: clm3.id } })
        if (!existing) {
          const rule3 = await prisma.coContributionRule.findFirst({
            where: { tenantId, packageId: premierPkg.id, benefitCategory: 'OUTPATIENT', networkTier: 'TIER_1' },
          })
          await prisma.coContributionTransaction.create({ data: {
            tenantId, claimId: clm3.id, memberId: clm3.memberId,
            coContributionRuleId: rule3?.id,
            serviceCost: clm3.billedAmount,
            calculatedAmount: 0, cappedAmount: 0, finalAmount: 0,
            planShare: clm3.billedAmount,
            annualCapApplied: false, capsApplied: [],
            collectionStatus: 'WAIVED',
            waiverReason: 'Member is 68 years old with documented financial hardship — waiver approved per senior citizen policy.',
            waiverApprovedBy: 'Dr. Sarah Achieng (Medical Officer)',
          }})
        }
      }

      console.log('✅ Co-contribution transactions: CLM-001 (PENDING KES 800), CLM-002 (COLLECTED M-Pesa), CLM-003 (WAIVED — hardship)')
    } else {
      console.log('✅ Co-contribution rules: already seeded')
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 16. PHASE A–D FEATURE DEMONSTRATIONS
  // ═══════════════════════════════════════════════════════════
  {
    const demoExists = await prisma.approvalMatrix.findFirst({ where: { tenantId } })

    if (!demoExists) {

      // ── 16a. Kenyan statutory tax rates ───────────────────────────────────
      for (const tax of [
        { taxType: 'STAMP_DUTY'    as const, flatAmount: 40,     percentage: null, effectiveFrom: new Date('2024-01-01') },
        { taxType: 'TRAINING_LEVY' as const, flatAmount: null,   percentage: 0.002, effectiveFrom: new Date('2024-01-01') },
        { taxType: 'PHCF'          as const, flatAmount: null,   percentage: 0.0025, effectiveFrom: new Date('2024-01-01') },
      ]) {
        await prisma.taxRate.upsert({
          where: { tenantId_taxType_effectiveFrom: { tenantId, taxType: tax.taxType, effectiveFrom: tax.effectiveFrom } },
          update: {},
          create: { tenantId, ...tax },
        })
      }
      console.log('✅ Tax rates: Stamp Duty (KES 40), Training Levy (0.2%), PHCF (0.25%)')

      // ── 16b. Approval matrix ──────────────────────────────────────────────
      // Rule 1: Inpatient claims > KES 200k require UNDERWRITER
      await prisma.approvalMatrix.create({ data: {
        tenantId, serviceType: 'INPATIENT', claimValueMin: 200000, claimValueMax: null,
        benefitCategory: null, requiredRole: 'UNDERWRITER', requiresDual: true,
        effectiveFrom: new Date('2024-01-01'),
      }})
      // Rule 2: Surgical > KES 150k require MEDICAL_OFFICER
      await prisma.approvalMatrix.create({ data: {
        tenantId, serviceType: null, claimValueMin: 150000, claimValueMax: 199999,
        benefitCategory: 'SURGICAL', requiredRole: 'MEDICAL_OFFICER', requiresDual: false,
        effectiveFrom: new Date('2024-01-01'),
      }})
      // Rule 3: All claims > KES 50k require CLAIMS_OFFICER or above
      await prisma.approvalMatrix.create({ data: {
        tenantId, serviceType: null, claimValueMin: 50000, claimValueMax: 149999,
        benefitCategory: null, requiredRole: 'CLAIMS_OFFICER', requiresDual: false,
        effectiveFrom: new Date('2024-01-01'),
      }})
      console.log('✅ Approval matrix: 3 rules (inpatient >200k dual-approval, surgical >150k, general >50k)')

      // ── 16c. Individual client ─────────────────────────────────────────────
      // Patricia Wanjiru — self-pay individual enrolled on Executive package
      const indivExists = await prisma.group.findFirst({ where: { tenantId, clientType: 'INDIVIDUAL' } })
      if (!indivExists) {
        const indivGroup = await prisma.group.create({ data: {
          tenantId, name: 'Patricia Wanjiru', clientType: 'INDIVIDUAL',
          fundingMode: 'INSURED', registrationNumber: 'IND-00001',
          contactPersonName: 'Patricia Wanjiru', contactPersonPhone: '+254711000001', contactPersonEmail: 'patricia@email.com',
          packageId: executivePkg.id, packageVersionId: executivePkg.versionId,
          contributionRate: executivePkg.contrib,
          effectiveDate: new Date('2024-03-01'), renewalDate: new Date('2025-03-01'), status: 'ACTIVE',
        }})
        const memberCount = await prisma.member.count({ where: { tenantId } })
        await prisma.member.create({ data: {
          tenantId, groupId: indivGroup.id, packageId: executivePkg.id, packageVersionId: executivePkg.versionId,
          memberNumber: `AVH-2024-${String(memberCount + 1).padStart(5,'0')}`,
          firstName: 'Patricia', lastName: 'Wanjiru', gender: 'FEMALE',
          dateOfBirth: new Date('1982-09-21'), relationship: 'PRINCIPAL',
          enrollmentDate: new Date('2024-03-01'), activationDate: new Date('2024-03-01'), status: 'ACTIVE',
          idNumber: '28459671', phone: '+254711000001', email: 'patricia@email.com',
          smartCardNumber: 'AV-IND-00001',
        }})
        console.log('✅ Individual client: Patricia Wanjiru (clientType=INDIVIDUAL, Executive package)')
      }

      // ── 16d. Self-funded schemes ──────────────────────────────────────────
      // Scheme 1: East African Breweries — healthy fund, multi-category claims
      const eabl = await prisma.group.findFirst({ where: { tenantId, name: 'East African Breweries' } })
      if (eabl && eabl.fundingMode === 'INSURED') {
        const fundAdminUser = await prisma.user.findFirst({ where: { tenantId, email: 'fund@avenue.co.ke' } })
        await prisma.group.update({ where: { id: eabl.id }, data: {
          fundingMode: 'SELF_FUNDED', adminFeeMethod: 'FLAT_PER_INSURED', adminFeeRate: 2000,
          fundAdministrators: fundAdminUser ? { connect: { id: fundAdminUser.id } } : undefined,
        }})

        // Get EABL members to attach claims to
        const eablMembers = await prisma.member.findMany({
          where: { tenantId, groupId: eabl.id, status: 'ACTIVE' },
          select: { id: true, firstName: true, lastName: true },
        })
        const eablMember1 = eablMembers[0]
        const eablMember2 = eablMembers[1] ?? eablMembers[0]

        // Create real EABL claims so the dashboard has fund deductions with claimIds
        type ClaimSeed = {
          claimNumber: string; memberId: string; providerId: string
          serviceType: string; benefitCategory: string; dateOfService: Date
          billedAmount: number; approvedAmount: number; status: string
          diagnoses: object; procedures: object
        }
        const eablClaims: ClaimSeed[] = []
        if (eablMember1) {
          const clmBase = await prisma.claim.count({ where: { tenantId } })
          // Inpatient — large claim to show in large-claims table
          const clm1 = await prisma.claim.create({ data: {
            tenantId, claimNumber: `CLM-EABL-${String(clmBase + 1).padStart(5,'0')}`,
            memberId: eablMember1.id, providerId: providers[2],
            serviceType: 'INPATIENT', benefitCategory: 'INPATIENT',
            dateOfService: new Date('2025-02-10'),
            admissionDate: new Date('2025-02-10'), dischargeDate: new Date('2025-02-14'), lengthOfStay: 4,
            billedAmount: 220000, approvedAmount: 210000, status: 'APPROVED',
            decidedAt: new Date('2025-02-15'), receivedAt: new Date('2025-02-15'),
            diagnoses: [{ icdCode: 'J18.9', description: 'Pneumonia', isPrimary: true }],
            procedures: [],
          }})
          eablClaims.push(clm1 as unknown as ClaimSeed)

          // Outpatient — medium claim
          const clm2 = await prisma.claim.create({ data: {
            tenantId, claimNumber: `CLM-EABL-${String(clmBase + 2).padStart(5,'0')}`,
            memberId: eablMember1.id, providerId: providers[0],
            serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
            dateOfService: new Date('2025-03-05'),
            billedAmount: 18500, approvedAmount: 17000, status: 'APPROVED',
            decidedAt: new Date('2025-03-05'), receivedAt: new Date('2025-03-05'),
            diagnoses: [{ icdCode: 'E11.9', description: 'Type 2 diabetes', isPrimary: true }],
            procedures: [],
            claimLines: { create: [
              { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Specialist Consultation', cptCode: '99214', quantity: 1, unitCost: 4500, billedAmount: 4500, approvedAmount: 4500 },
              { lineNumber: 2, serviceCategory: 'LABORATORY',   description: 'HbA1c',                  cptCode: '83036', quantity: 1, unitCost: 2000, billedAmount: 2000, approvedAmount: 2000 },
              { lineNumber: 3, serviceCategory: 'PHARMACY',     description: 'Metformin + supplements', cptCode: null,    quantity: 1, unitCost: 12000, billedAmount: 12000, approvedAmount: 10500 },
            ]},
          }})
          eablClaims.push(clm2 as unknown as ClaimSeed)
        }
        if (eablMember2 && eablMember2.id !== eablMember1?.id) {
          const clmBase2 = await prisma.claim.count({ where: { tenantId } })
          // Surgical — large, triggers large-claims table
          const clm3 = await prisma.claim.create({ data: {
            tenantId, claimNumber: `CLM-EABL-${String(clmBase2 + 1).padStart(5,'0')}`,
            memberId: eablMember2.id, providerId: providers[2],
            serviceType: 'INPATIENT', benefitCategory: 'SURGICAL',
            dateOfService: new Date('2025-01-20'),
            billedAmount: 185000, approvedAmount: 175000, status: 'PAID',
            decidedAt: new Date('2025-01-22'), receivedAt: new Date('2025-01-22'),
            paidAt: new Date('2025-02-01'),
            diagnoses: [{ icdCode: 'K35.9', description: 'Acute appendicitis', isPrimary: true }],
            procedures: [{ cptCode: '44950', description: 'Appendectomy', quantity: 1, unitCost: 110000 }],
          }})
          eablClaims.push(clm3 as unknown as ClaimSeed)

          // Dental
          const clmBase3 = await prisma.claim.count({ where: { tenantId } })
          const clm4 = await prisma.claim.create({ data: {
            tenantId, claimNumber: `CLM-EABL-${String(clmBase3 + 1).padStart(5,'0')}`,
            memberId: eablMember2.id, providerId: providers[0],
            serviceType: 'OUTPATIENT', benefitCategory: 'DENTAL',
            dateOfService: new Date('2025-03-18'),
            billedAmount: 22000, approvedAmount: 20000, status: 'APPROVED',
            decidedAt: new Date('2025-03-18'), receivedAt: new Date('2025-03-18'),
            diagnoses: [{ icdCode: 'K02.9', description: 'Dental caries', isPrimary: true }],
            procedures: [],
          }})
          eablClaims.push(clm4 as unknown as ClaimSeed)
        }

        // Build fund account: running balance from real claim amounts
        let runningBalance = 5_000_000
        const claimTotal = eablClaims.reduce((s, c) => s + (c as unknown as { approvedAmount: number }).approvedAmount, 0)
        runningBalance -= claimTotal
        runningBalance -= 150_000 // admin fee

        const sfAccount = await prisma.selfFundedAccount.create({ data: {
          tenantId, groupId: eabl.id,
          balance: runningBalance,
          totalDeposited: 5_000_000,
          totalClaims: claimTotal,
          totalAdminFees: 150_000,
          minimumBalance: 500_000,
          periodStartDate: new Date('2025-01-01'), periodEndDate: new Date('2025-12-31'),
        }})

        // Fund ledger: deposit → each individual claim deduction → admin fee
        let ledgerBalance = 0
        const claimDeductions: { amount: number; balance: number; claimId: string; description: string; postedAt: Date }[] = []

        // Opening deposit
        ledgerBalance = 5_000_000
        await prisma.fundTransaction.create({ data: {
          tenantId, selfFundedAccountId: sfAccount.id,
          type: 'DEPOSIT', amount: 5_000_000, balanceAfter: ledgerBalance,
          description: 'Opening fund deposit — 2025 policy year', referenceNumber: 'EFT-EABL-2025-001',
          postedAt: new Date('2025-01-02'),
        }})

        // Individual claim deductions (with real claimIds — powers the category breakdown)
        for (const clm of eablClaims) {
          const c = clm as unknown as { id: string; approvedAmount: number; benefitCategory: string; dateOfService: Date }
          ledgerBalance -= c.approvedAmount
          claimDeductions.push({
            amount: c.approvedAmount,
            balance: ledgerBalance,
            claimId: c.id,
            description: `Claim deduction — ${c.benefitCategory.replace(/_/g,' ')} — KES ${c.approvedAmount.toLocaleString()}`,
            postedAt: new Date(c.dateOfService.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days after service
          })
        }
        for (const d of claimDeductions) {
          await prisma.fundTransaction.create({ data: {
            tenantId, selfFundedAccountId: sfAccount.id,
            type: 'CLAIM_DEDUCTION', amount: d.amount, balanceAfter: d.balance,
            description: d.description, claimId: d.claimId, postedAt: d.postedAt,
          }})
        }

        // Admin fee
        ledgerBalance -= 150_000
        await prisma.fundTransaction.create({ data: {
          tenantId, selfFundedAccountId: sfAccount.id,
          type: 'ADMIN_FEE', amount: 150_000, balanceAfter: ledgerBalance,
          description: 'Admin fee Q1 2025 — KES 2,000 × 75 insured', referenceNumber: 'ADM-EABL-2025-Q1',
          postedAt: new Date('2025-04-01'),
        }})

        console.log(`✅ Self-funded scheme 1: East African Breweries — KES ${runningBalance.toLocaleString()} balance, ${eablClaims.length} claims wired to fund`)
      }

      // Scheme 2: Bamburi Cement — LOW balance, triggers alert demonstration
      const bamburi = await prisma.group.findFirst({ where: { tenantId, name: 'Bamburi Cement' } })
      const bamburiSfExists = await prisma.selfFundedAccount.findFirst({ where: { group: { name: 'Bamburi Cement' } } })
      if (bamburi && !bamburiSfExists) {
        const fundAdminUser = await prisma.user.findFirst({ where: { tenantId, email: 'fund@avenue.co.ke' } })
        await prisma.group.update({ where: { id: bamburi.id }, data: {
          fundingMode: 'SELF_FUNDED', adminFeeMethod: 'PCT_OF_CLAIMS', adminFeeRate: 5,
          fundAdministrators: fundAdminUser ? { connect: { id: fundAdminUser.id } } : undefined,
        }})
        // Deliberately seeded with balance BELOW minimum to demo the low-balance alert
        let bal = 2_000_000
        const sfAccount2 = await prisma.selfFundedAccount.create({ data: {
          tenantId, groupId: bamburi.id,
          balance: 380_000,           // ← below minimumBalance of 500k → triggers alert
          totalDeposited: 2_000_000,
          totalClaims: 1_470_000,
          totalAdminFees: 150_000,
          minimumBalance: 500_000,
          periodStartDate: new Date('2025-01-01'), periodEndDate: new Date('2025-12-31'),
        }})
        for (const txn of [
          { type: 'DEPOSIT' as const,          amount: 2_000_000, balanceAfter: (bal = 2_000_000),            description: 'Opening deposit 2025',              referenceNumber: 'EFT-BAM-2025-001', postedAt: new Date('2025-01-03') },
          { type: 'CLAIM_DEDUCTION' as const,  amount:   450_000, balanceAfter: (bal -= 450_000,   bal),      description: 'Claims deductions Jan 2025',         referenceNumber: null,                postedAt: new Date('2025-02-01') },
          { type: 'CLAIM_DEDUCTION' as const,  amount:   520_000, balanceAfter: (bal -= 520_000,   bal),      description: 'Claims deductions Feb 2025',         referenceNumber: null,                postedAt: new Date('2025-03-01') },
          { type: 'ADMIN_FEE' as const,        amount:    75_000, balanceAfter: (bal -= 75_000,    bal),      description: 'Admin fee Q1 — 5% of KES 1.5M',     referenceNumber: 'ADM-BAM-Q1',        postedAt: new Date('2025-04-01') },
          { type: 'CLAIM_DEDUCTION' as const,  amount:   500_000, balanceAfter: (bal -= 500_000,   bal),      description: 'Claims deductions Mar 2025',         referenceNumber: null,                postedAt: new Date('2025-04-05') },
          { type: 'CLAIM_DEDUCTION' as const,  amount:    75_000, balanceAfter: (bal -= 75_000,    bal),      description: 'Claims deductions Apr 2025 (partial)',referenceNumber: null,                postedAt: new Date('2025-04-20') },
          { type: 'ADMIN_FEE' as const,        amount:    75_000, balanceAfter: (bal -= 75_000,    bal),      description: 'Admin fee Q2 — 5% of KES 1.5M',     referenceNumber: 'ADM-BAM-Q2',        postedAt: new Date('2025-04-25') },
        ]) {
          await prisma.fundTransaction.create({ data: { tenantId, selfFundedAccountId: sfAccount2.id, ...txn } })
        }
        console.log(`✅ Self-funded scheme 2: Bamburi Cement — KES 380k balance (BELOW minimum KES 500k → low-balance demo)`)
      }

      // ── 16e. Invoices with Kenyan taxes ────────────────────────────────────
      // Update the first existing invoice to carry the statutory taxes
      const firstInvoice = await prisma.invoice.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } })
      if (firstInvoice && Number(firstInvoice.stampDuty) === 0) {
        const basic    = Number(firstInvoice.totalAmount)
        const sdAmount = 40
        const tlAmount = Math.round(basic * 0.002)
        const pcAmount = Math.round(basic * 0.0025)
        await prisma.invoice.update({ where: { id: firstInvoice.id }, data: {
          stampDuty: sdAmount, trainingLevy: tlAmount, phcf: pcAmount,
          taxTotal: sdAmount + tlAmount + pcAmount,
        }})
        console.log(`✅ Invoice taxes: ${firstInvoice.invoiceNumber} — SD KES ${sdAmount}, TL KES ${tlAmount}, PHCF KES ${pcAmount}`)
      }

      // ── 16f. Claims in INCURRED and CAPTURED states ────────────────────────
      const activeMs = await prisma.member.findMany({ where: { tenantId, status: 'ACTIVE' }, take: 5 })
      if (activeMs.length >= 2) {
        const clmCount = await prisma.claim.count({ where: { tenantId } })
        // INCURRED claim — notified of discharge, waiting for documents
        await prisma.claim.create({ data: {
          tenantId, claimNumber: `CLM-${new Date().getFullYear()}-${String(clmCount + 1).padStart(5,'0')}`,
          memberId: activeMs[0].id, providerId: providers[2],
          serviceType: 'INPATIENT', benefitCategory: 'INPATIENT',
          dateOfService: new Date('2025-04-01'),
          admissionDate: new Date('2025-03-28'), dischargeDate: new Date('2025-04-01'),
          billedAmount: 85000, status: 'INCURRED', lengthOfStay: 4,
          invoiceNumber: 'NH-INV-2025-0341',
          diagnoses: [{ icdCode: 'J18.9', description: 'Pneumonia, unspecified organism', isPrimary: true }],
          procedures: [],
        }})
        // CAPTURED claim — data entry complete, pending adjudication
        await prisma.claim.create({ data: {
          tenantId, claimNumber: `CLM-${new Date().getFullYear()}-${String(clmCount + 2).padStart(5,'0')}`,
          memberId: activeMs[1].id, providerId: providers[0],
          serviceType: 'OUTPATIENT', benefitCategory: 'DENTAL',
          dateOfService: new Date('2025-04-05'),
          billedAmount: 18500, status: 'CAPTURED',
          invoiceNumber: 'PKL-INV-2025-0892',
          diagnoses: [{ icdCode: 'K02.9', description: 'Dental caries, unspecified', isPrimary: true }],
          procedures: [],
          claimLines: { create: [
            { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Dental Examination', cptCode: '92004', quantity: 1, unitCost: 2500, billedAmount: 2500 },
            { lineNumber: 2, serviceCategory: 'PROCEDURE',    description: 'Root Canal Treatment', cptCode: null,   quantity: 1, unitCost: 12000, billedAmount: 12000 },
            { lineNumber: 3, serviceCategory: 'PHARMACY',     description: 'Antibiotics', cptCode: null,            quantity: 1, unitCost: 4000,  billedAmount: 4000  },
          ]},
        }})
        console.log('✅ New claim states: 1× INCURRED (Nairobi Hospital, pneumonia) + 1× CAPTURED (dental, ready for adjudication)')
      }

      // ── 16g. Reimbursement claim ───────────────────────────────────────────
      if (activeMs.length >= 3) {
        const rmbCount = await prisma.claim.count({ where: { tenantId } })
        await prisma.claim.create({ data: {
          tenantId, claimNumber: `CLM-RMB-${new Date().getFullYear()}-${String(rmbCount + 1).padStart(5,'0')}`,
          memberId: activeMs[2].id, providerId: providers[4],
          source: 'REIMBURSEMENT', serviceType: 'OUTPATIENT', benefitCategory: 'OPTICAL',
          dateOfService: new Date('2025-03-20'),
          billedAmount: 13500, status: 'RECEIVED',
          isReimbursement: true, invoiceNumber: 'EYE-INV-2025-0178',
          reimbursementMpesaPhone: '+254722555888',
          attendingDoctor: 'Dr. Amina Hassan',
          diagnoses: [{ icdCode: 'Z01.0', description: 'Eye examination', isPrimary: true }],
          procedures: [],
          claimLines: { create: [
            { lineNumber: 1, serviceCategory: 'CONSULTATION', description: 'Eye Examination',     cptCode: '92004', quantity: 1, unitCost: 2500, billedAmount: 2500 },
            { lineNumber: 2, serviceCategory: 'OTHER',        description: 'Spectacle Frames',    cptCode: '92341', quantity: 1, unitCost: 5000, billedAmount: 5000 },
            { lineNumber: 3, serviceCategory: 'OTHER',        description: 'Spectacle Lenses',    cptCode: '92340', quantity: 1, unitCost: 6000, billedAmount: 6000 },
          ]},
        }})
        console.log('✅ Reimbursement claim: CLM-RMB-* — optical, member paid provider (M-Pesa +254722555888)')
      }

      // ── 16h. Pre-auth with escalation threshold ───────────────────────────
      if (activeMs.length >= 4) {
        const paCount = await prisma.preAuthorization.count({ where: { tenantId } })
        const escalationUser = await prisma.user.findFirst({ where: { tenantId, role: 'MEDICAL_OFFICER' } })
        await prisma.preAuthorization.create({ data: {
          tenantId, preauthNumber: `PA-ESC-${new Date().getFullYear()}-${String(paCount + 1).padStart(5,'0')}`,
          memberId: activeMs[3].id, providerId: providers[2],
          submittedBy: 'PROVIDER', status: 'SUBMITTED',
          serviceType: 'INPATIENT', benefitCategory: 'SURGICAL',
          estimatedCost: 250000,
          escalationThresholdHours: 4,
          escalatedToId: escalationUser?.id ?? null,
          diagnoses: [{ icdCode: 'K35.9', description: 'Acute appendicitis', isPrimary: true }],
          procedures: [{ cptCode: '44950', description: 'Appendectomy', quantity: 1, unitCost: 110000 }],
          clinicalNotes: 'Patient presents with acute appendicitis requiring emergency surgical intervention. Pre-auth required — escalation set to 4-hour SLA.',
          expectedDateOfService: new Date('2025-04-15'),
        }})
        console.log('✅ Pre-auth with escalation: PA-ESC-* — appendectomy, 4h escalation threshold → Medical Officer')
      }

      // ── 16i. SCHEME_TRANSFER endorsement ─────────────────────────────────
      // Move a KCB member to EABL (career move scenario)
      const kcbGroup  = await prisma.group.findFirst({ where: { tenantId, name: 'KCB Group' } })
      const eablGroup = await prisma.group.findFirst({ where: { tenantId, name: 'East African Breweries' } })
      if (kcbGroup && eablGroup) {
        const kcbMember = await prisma.member.findFirst({
          where: { tenantId, groupId: kcbGroup.id, status: 'ACTIVE', relationship: 'PRINCIPAL' },
        })
        if (kcbMember) {
          const endCount = await prisma.endorsement.count({ where: { tenantId } })
          await prisma.endorsement.create({ data: {
            tenantId, endorsementNumber: `END-TRANSFER-${String(endCount + 1).padStart(5,'0')}`,
            groupId: kcbGroup.id, toGroupId: eablGroup.id, memberId: kcbMember.id,
            type: 'SCHEME_TRANSFER', status: 'APPROVED',
            effectiveDate: new Date('2025-04-01'),
            changeDetails: { reason: 'Career change — member joined East African Breweries on 1 April 2025', fromGroupId: kcbGroup.id, toGroupId: eablGroup.id },
            reviewedBy: users['SUPER_ADMIN'], reviewedAt: new Date('2025-03-28'),
          }})
          console.log(`✅ Scheme transfer endorsement: ${kcbMember.firstName} ${kcbMember.lastName} — KCB → EABL`)
        }
      }

      // ── 16j. TIER_CHANGE endorsement ─────────────────────────────────────
      // Promote a Safaricom Staff member to Management tier
      const staffMember = await prisma.member.findFirst({
        where: { tenantId, groupId: safaricom.id, relationship: 'PRINCIPAL', status: 'ACTIVE',
                 benefitTier: { name: 'Staff' } },
      })
      const mgmtTier = await prisma.groupBenefitTier.findFirst({
        where: { groupId: safaricom.id, name: 'Management' },
      })
      if (staffMember && mgmtTier) {
        const endCount2 = await prisma.endorsement.count({ where: { tenantId } })
        await prisma.endorsement.create({ data: {
          tenantId, endorsementNumber: `END-TIER-${String(endCount2 + 1).padStart(5,'0')}`,
          groupId: safaricom.id, memberId: staffMember.id, toBenefitTierId: mgmtTier.id,
          type: 'TIER_CHANGE', status: 'APPROVED',
          effectiveDate: new Date('2025-03-01'),
          changeDetails: { reason: 'Promotion to Team Lead — eligible for Management tier', fromTierId: staffMember.benefitTierId, toBenefitTierId: mgmtTier.id },
          reviewedBy: users['UNDERWRITER'], reviewedAt: new Date('2025-02-28'),
        }})
        console.log(`✅ Tier change endorsement: ${staffMember.firstName} ${staffMember.lastName} — Staff → Management (Safaricom)`)
      }

      // ── 16k. Smart-card replacement ───────────────────────────────────────
      if (activeMs.length >= 1) {
        const cardMember = activeMs[0]
        // First give them a card
        await prisma.member.update({ where: { id: cardMember.id }, data: { smartCardNumber: 'AV-2024-00001' } })
        // Then log a replacement request
        const replacementInvCount = await prisma.invoice.count({ where: { tenantId } })
        const replInvoice = await prisma.invoice.create({ data: {
          tenantId, invoiceNumber: `INV-CARD-${new Date().getFullYear()}-${String(replacementInvCount + 1).padStart(5,'0')}`,
          groupId: cardMember.groupId,
          period: '2025-04', memberCount: 1, ratePerMember: 500,
          totalAmount: 500, paidAmount: 0, balance: 500,
          stampDuty: 0, trainingLevy: 0, phcf: 0, taxTotal: 0,
          dueDate: new Date('2025-05-01'),
          notes: `Card replacement fee — ${cardMember.firstName} ${cardMember.lastName}. Reason: Lost card`,
        }})
        await prisma.activityLog.create({ data: {
          entityType: 'MEMBER', entityId: cardMember.id, memberId: cardMember.id,
          action: 'CARD_REPLACEMENT_REQUESTED',
          description: `Card replacement requested. Reason: Lost card. Fee invoice ${replInvoice.invoiceNumber} raised (KES 500).`,
          userId: users['SUPER_ADMIN'],
          metadata: { reason: 'Lost card', invoiceId: replInvoice.id, fee: 500 },
        }})
        console.log(`✅ Smart-card replacement: ${cardMember.firstName} ${cardMember.lastName} — INV-CARD raised, KES 500 fee`)
      }

      // ── 16l. BenefitUsage for exceeded-limits report ──────────────────────
      // Seed usage records so the exceeded-limits report shows realistic data
      const benefitConfigs = await prisma.benefitConfig.findMany({
        where: { packageVersion: { package: { tenantId } } },
        select: { id: true, category: true, annualSubLimit: true },
        take: 10,
      })
      const allActiveMembers = await prisma.member.findMany({
        where: { tenantId, status: 'ACTIVE' }, take: 6,
      })
      const usageScenarios = [
        { memberIdx: 0, configCat: 'OUTPATIENT',  pct: 0.92, label: '>90% outpatient' },
        { memberIdx: 1, configCat: 'DENTAL',       pct: 1.05, label: 'EXCEEDED dental' },
        { memberIdx: 2, configCat: 'INPATIENT',    pct: 0.83, label: '>80% inpatient' },
        { memberIdx: 3, configCat: 'OPTICAL',      pct: 1.0,  label: 'exactly at limit optical' },
      ]
      for (const s of usageScenarios) {
        const member = allActiveMembers[s.memberIdx]
        if (!member) continue
        const config = benefitConfigs.find(c => c.category === s.configCat)
        if (!config) continue
        const existing = await prisma.benefitUsage.findFirst({
          where: { memberId: member.id, benefitConfigId: config.id },
        })
        if (!existing) {
          await prisma.benefitUsage.create({ data: {
            memberId: member.id, benefitConfigId: config.id,
            periodStart: new Date('2025-01-01'), periodEnd: new Date('2025-12-31'),
            amountUsed: Math.round(Number(config.annualSubLimit) * s.pct),
            claimCount: Math.round(s.pct * 8),
          }})
        }
      }
      console.log('✅ Benefit usage: 4 members flagged (1× exceeded, 1× exactly at limit, 2× >80%)')

      // ── 16m. Commission records ───────────────────────────────────────────
      const allBrokers = await prisma.broker.findMany({ where: { tenantId } })
      const commExists = await prisma.commission.findFirst({ where: { broker: { tenantId } } })
      if (!commExists && allBrokers.length > 0) {
        const allGroups = await prisma.group.findMany({ where: { tenantId }, take: 3 })
        const commScenarios = [
          { brokerIdx: 0, groupIdx: 0, period: '2024-01', received: 150000, rate: 15, paid: true,   paidAt: new Date('2024-02-15'), ref: 'COMM-2024-001' },
          { brokerIdx: 0, groupIdx: 0, period: '2024-02', received: 150000, rate: 15, paid: true,   paidAt: new Date('2024-03-14'), ref: 'COMM-2024-002' },
          { brokerIdx: 0, groupIdx: 0, period: '2024-03', received: 150000, rate: 15, paid: false,  paidAt: null,                   ref: null },
          { brokerIdx: 1, groupIdx: 1, period: '2024-01', received: 225000, rate: 12, paid: true,   paidAt: new Date('2024-02-10'), ref: 'COMM-2024-003' },
          { brokerIdx: 1, groupIdx: 1, period: '2024-02', received: 225000, rate: 12, paid: false,  paidAt: null,                   ref: null },
          { brokerIdx: 2, groupIdx: 2, period: '2024-01', received: 90000,  rate: 18, paid: true,   paidAt: new Date('2024-02-20'), ref: 'COMM-2024-004' },
        ]
        for (const c of commScenarios) {
          const broker = allBrokers[c.brokerIdx]
          const group  = allGroups[c.groupIdx]
          if (!broker || !group) continue
          const commAmt = Math.round(c.received * (c.rate / 100))
          await prisma.commission.create({ data: {
            brokerId: broker.id, groupId: group.id, period: c.period,
            contributionReceived: c.received, commissionRate: c.rate, commissionAmount: commAmt,
            paymentStatus: c.paid ? 'PAID' : 'PENDING',
            paidAt: c.paidAt, paymentReference: c.ref,
          }})
        }
        console.log('✅ Commission records: 6 records across 3 brokers — 4 paid, 2 pending')
      }

      // ── 16n. Adjudication logs for claims-per-operator ────────────────────
      const existingClaims = await prisma.claim.findMany({
        where: { tenantId, status: { in: ['APPROVED', 'PARTIALLY_APPROVED', 'DECLINED'] } },
        select: { id: true, approvedAmount: true, status: true },
        take: 8,
      })
      const adjLogExists = await prisma.adjudicationLog.findFirst({ where: { claim: { tenantId } } })
      if (!adjLogExists && existingClaims.length > 0) {
        const ops  = [users['CLAIMS_OFFICER'], users['MEDICAL_OFFICER'], users['SUPER_ADMIN']]
        for (let i = 0; i < existingClaims.length; i++) {
          const cl    = existingClaims[i]!
          const op    = ops[i % ops.length]!
          const action = cl.status === 'DECLINED' ? 'DECLINED' : cl.status === 'PARTIALLY_APPROVED' ? 'PARTIALLY_APPROVED' : 'APPROVED'
          await prisma.adjudicationLog.create({ data: {
            claimId: cl.id, userId: op, action, toStatus: cl.status,
            amount: cl.approvedAmount, notes: `${action.toLowerCase().replace(/_/g,' ')} by adjudicator`,
          }})
        }
        console.log(`✅ Adjudication logs: ${existingClaims.length} logs across 3 operators (claims-per-operator report)`)
      }

      // ── 16o. Fix co-contribution claim number references ──────────────────
      // Earlier section 15 looked for 'CLM-001' which doesn't exist.
      // Re-seed co-contribution transactions using the correct claim numbers.
      for (const [clmNum, amount, status, mpesa] of [
        ['CLM-2024-00001', 570, 'PENDING',   null         ],
        ['CLM-2024-00002', 250, 'COLLECTED', 'QWE1234XYZ' ],
        ['CLM-2024-00003', 0,   'WAIVED',    null         ],
      ] as [string, number, string, string | null][]) {
        const claim = await prisma.claim.findFirst({ where: { tenantId, claimNumber: clmNum } })
        if (!claim) continue
        const already = await prisma.coContributionTransaction.findUnique({ where: { claimId: claim.id } })
        if (already) continue
        const rule = await prisma.coContributionRule.findFirst({
          where: { tenantId, benefitCategory: 'OUTPATIENT', networkTier: 'TIER_1' },
        })
        await prisma.coContributionTransaction.create({ data: {
          tenantId, claimId: claim.id, memberId: claim.memberId,
          coContributionRuleId: rule?.id,
          serviceCost: claim.billedAmount,
          calculatedAmount: amount, cappedAmount: amount, finalAmount: amount,
          planShare: Number(claim.billedAmount) - amount,
          annualCapApplied: false, capsApplied: [],
          collectionStatus: status as never,
          amountCollected: status === 'COLLECTED' ? amount : 0,
          paymentMethod: mpesa ? 'MPESA' : null,
          mpesaTransactionRef: mpesa,
          waiverReason: status === 'WAIVED' ? 'Member is elderly with documented financial hardship — approved per senior citizen policy.' : null,
          waiverApprovedBy: status === 'WAIVED' ? 'Dr. Sarah Achieng (Medical Officer)' : null,
        }})
      }
      console.log('✅ Co-contribution transactions fixed: CLM-2024-00001 (PENDING), CLM-2024-00002 (COLLECTED M-Pesa), CLM-2024-00003 (WAIVED)')

      console.log('\n✅ Phase A–D demonstrations complete.')
    } else {
      console.log('✅ Phase A–D demonstrations: already seeded')
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 17. NOTIFICATION TEMPLATES
  // ═══════════════════════════════════════════════════════════
  const notifTemplates = [
    { name: 'Welcome Email',          type: 'WELCOME',              channel: 'EMAIL', subject: 'Welcome to Avenue Healthcare',         bodyTemplate: 'Dear {{firstName}}, welcome to Avenue Healthcare. Your member number is {{memberNumber}}.' },
    { name: 'Claim Approved',         type: 'CLAIM_APPROVED',       channel: 'EMAIL', subject: 'Claim Approved — {{claimNumber}}',     bodyTemplate: 'Your claim {{claimNumber}} for KES {{approvedAmount}} has been approved.' },
    { name: 'Claim Declined',         type: 'CLAIM_DECLINED',       channel: 'EMAIL', subject: 'Claim Declined — {{claimNumber}}',     bodyTemplate: 'Your claim {{claimNumber}} has been declined. Reason: {{declineReason}}.' },
    { name: 'Renewal Reminder 30',    type: 'RENEWAL_REMINDER_30',  channel: 'EMAIL', subject: 'Policy Renewal in 30 days',            bodyTemplate: 'Your policy renews on {{renewalDate}}. Please ensure premiums are up to date.' },
    { name: 'Payment Overdue',        type: 'PAYMENT_OVERDUE',      channel: 'SMS',   subject: null,                                   bodyTemplate: 'Avenue Healthcare: Invoice {{invoiceNumber}} of KES {{balance}} is overdue. Pay now to avoid suspension.' },
    { name: 'Pre-Auth Approved SMS',  type: 'PREAUTH_STATUS',       channel: 'SMS',   subject: null,                                   bodyTemplate: 'Pre-auth {{preauthNumber}} approved for KES {{approvedAmount}}. Valid until {{validUntil}}.' },
    { name: 'Suspension Notice',      type: 'SUSPENSION_NOTICE',    channel: 'EMAIL', subject: 'Cover Suspended — Action Required',    bodyTemplate: 'Dear {{firstName}}, your cover has been suspended due to outstanding premium. Contact us immediately.' },
  ]
  for (const t of notifTemplates) {
    await prisma.notificationTemplate.upsert({
      where: { id: `seed-notif-${t.type}` },
      update: {},
      create: { id: `seed-notif-${t.type}`, tenantId: tenant.id, ...t, isActive: true },
    })
  }
  console.log(`✅ Notification templates: ${notifTemplates.length}`)

  const firstActiveMember = await prisma.member.findFirst({
    where: { tenantId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, firstName: true, lastName: true },
  })
  if (firstActiveMember) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: 'member@avenue.co.ke' } },
      update: {
        passwordHash: pw,
        isActive: true,
        role: 'MEMBER_USER',
        memberId: firstActiveMember.id,
      },
      create: {
        tenantId,
        email: 'member@avenue.co.ke',
        firstName: firstActiveMember.firstName,
        lastName: firstActiveMember.lastName,
        role: 'MEMBER_USER',
        passwordHash: pw,
        isActive: true,
        memberId: firstActiveMember.id,
      },
    })
  }

  const fundAdminUser = await prisma.user.findFirst({ where: { tenantId, email: 'fund@avenue.co.ke' } })
  if (fundAdminUser) {
    const selfFundedGroups = await prisma.group.findMany({
      where: { tenantId, fundingMode: 'SELF_FUNDED' },
      select: { id: true },
    })
    if (selfFundedGroups.length > 0) {
      await prisma.user.update({
        where: { id: fundAdminUser.id },
        data: { managedFundGroups: { connect: selfFundedGroups.map(g => ({ id: g.id })) } },
      })
    }
  }

  console.log('\n🎉 Seed complete! All features populated.\n')
  console.log('  Login: admin@avenue.co.ke / AvenueAdmin2024!')
  console.log('')
  console.log('  Core:')
  console.log('  • Safaricom — 3 benefit tiers (Executive/Management/Staff) with different packages')
  console.log('  • 5 corporate groups + 1 individual client (Patricia Wanjiru)')
  console.log('  • 6 providers with CPT tariffs + ICD-10 diagnosis tariffs')
  console.log('  • 6+ claims with structured service lines grouped by category')
  console.log('  • 2 exception logs (1 approved, 1 pending review)')
  console.log('  • GL: Chart of accounts + journal entries for invoices, payments, and claims')
  console.log('  • Pre-authorizations, endorsements, quotations in various states')
  console.log('')
  console.log('  Phase A — Schema hardening:')
  console.log('  • Tax rates: Stamp Duty KES 40, Training Levy 0.2%, PHCF 0.25%')
  console.log('  • Approval matrix: 3 rules (inpatient >200k dual-approval, surgical >150k, general >50k)')
  console.log('  • INCURRED claim: Nairobi Hospital pneumonia, invoice NH-INV-2025-0341')
  console.log('  • CAPTURED claim: Dental, all lines entered, forwarded for adjudication')
  console.log('')
  console.log('  Phase B — Claims integrity:')
  console.log('  • Reimbursement claim: optical, member paid provider (M-Pesa reimbursement)')
  console.log('  • Pre-auth with escalation: appendectomy, 4h SLA → Medical Officer')
  console.log('  • Adjudication logs: 8 records across 3 operators (claims-per-operator report)')
  console.log('')
  console.log('  Phase C — Membership completeness:')
  console.log('  • Individual client: Patricia Wanjiru (clientType=INDIVIDUAL, Executive)')
  console.log('  • Self-funded scheme 1: EABL — KES 5M deposit, 4 claims deducted by claimId, admin fee')
  console.log('  • Self-funded scheme 2: Bamburi Cement — KES 380k balance (below min → low-balance demo)')
  console.log('  • Fund admin: fund@avenue.co.ke / AvenueAdmin2024! — linked to all self-funded schemes')
  console.log('  • Member: member@avenue.co.ke / AvenueAdmin2024! — linked to an active member')
  console.log('  • Admin sidebar: Self-Funded Schemes link under Finance → /fund/dashboard')
  console.log('  • Scheme transfer endorsement: KCB member → EABL (career change)')
  console.log('  • Tier change endorsement: Safaricom Staff → Management (promotion)')
  console.log('  • Smart-card replacement: lost card, fee invoice raised (KES 500)')
  console.log('')
  console.log('  Phase D — Reports (all populated with real data):')
  console.log('  • Fraud: 8 demonstration claims (TEMP-001, CLIN-001, BILL-003, BILL-004, TEMP-004, FIN-004)')
  console.log('  • Co-contribution: Essential/Premier/Executive rules + 3 transactions (PENDING/COLLECTED/WAIVED)')
  console.log('  • Exceeded limits: 4 benefit usage records (1 exceeded, 1 at limit, 2 at >80%)')
  console.log('  • Commission statements: 6 records across 3 brokers (4 paid, 2 pending)')
  console.log('  • Levies & taxes: first invoice updated with SD/TL/PHCF amounts')
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
