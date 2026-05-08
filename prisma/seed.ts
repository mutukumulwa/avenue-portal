import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import bcrypt from 'bcryptjs'
import { GLService } from '../src/server/services/gl.service'
import { AnalyticsRefreshService } from '../src/server/services/analytics-refresh.service'

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

  const caseMixWeights = [
    { icdFamily: 'A09', label: 'Gastroenteritis and diarrhoeal disease', weight: 0.85 },
    { icdFamily: 'B54', label: 'Malaria, unspecified', weight: 0.9 },
    { icdFamily: 'E11', label: 'Type 2 diabetes mellitus', weight: 1.35 },
    { icdFamily: 'I10', label: 'Essential hypertension', weight: 1.2 },
    { icdFamily: 'J06', label: 'Acute upper respiratory infections', weight: 0.75 },
    { icdFamily: 'J18', label: 'Pneumonia', weight: 1.6 },
    { icdFamily: 'K35', label: 'Acute appendicitis', weight: 1.75 },
    { icdFamily: 'M54', label: 'Back pain', weight: 0.95 },
    { icdFamily: 'N39', label: 'Urinary tract disorders', weight: 0.9 },
    { icdFamily: 'O80', label: 'Single spontaneous delivery', weight: 1.45 },
    { icdFamily: 'R50', label: 'Fever of other and unknown origin', weight: 0.8 },
    { icdFamily: 'S09', label: 'Head injury', weight: 1.25 },
    { icdFamily: 'Z00', label: 'General examination', weight: 0.7 },
  ];
  for (const weight of caseMixWeights) {
    await prisma.caseMixWeight.upsert({
      where: { icdFamily: weight.icdFamily },
      update: { label: weight.label, weight: weight.weight, isActive: true },
      create: weight,
    });
  }
  console.log(`✅ Case Mix Weights: ${caseMixWeights.length}`);

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
    { name: 'Avenue Essential', annual: 500000, contrib: 95000, benefits: [
      { cat: 'INPATIENT' as const,           limit: 500000,  copay: 0,  wait: 30  },
      { cat: 'OUTPATIENT' as const,          limit: 100000,  copay: 10, wait: 0   },
      { cat: 'MATERNITY' as const,           limit: 80000,   copay: 0,  wait: 365 },
      { cat: 'DENTAL' as const,              limit: 20000,   copay: 20, wait: 90  },
      { cat: 'OPTICAL' as const,             limit: 15000,   copay: 20, wait: 90  },
    ]},
    { name: 'Avenue Premier', annual: 2000000, contrib: 210000, benefits: [
      { cat: 'INPATIENT' as const,           limit: 2000000, copay: 0,  wait: 0   },
      { cat: 'OUTPATIENT' as const,          limit: 300000,  copay: 5,  wait: 0   },
      { cat: 'MATERNITY' as const,           limit: 200000,  copay: 0,  wait: 270 },
      { cat: 'DENTAL' as const,              limit: 50000,   copay: 10, wait: 30  },
      { cat: 'OPTICAL' as const,             limit: 40000,   copay: 10, wait: 30  },
      { cat: 'MENTAL_HEALTH' as const,       limit: 100000,  copay: 10, wait: 90  },
      { cat: 'CHRONIC_DISEASE' as const,     limit: 300000,  copay: 0,  wait: 0   },
    ]},
    { name: 'Avenue Executive', annual: 5000000, contrib: 480000, benefits: [
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
    if (existing) {
      await prisma.package.update({
        where: { id: existing.id },
        data: { annualLimit: p.annual, contributionAmount: p.contrib, status: 'ACTIVE' },
      })
      packages.push({ id: existing.id, versionId: existing.versions[0]?.id ?? '', name: p.name, contrib: p.contrib });
      continue
    }
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
  await prisma.group.update({
    where: { id: safaricom.id },
    data: {
      contributionRate: 165000, // annual blended rate per covered life across Executive/Management/Staff tiers
      paymentFrequency: 'ANNUAL',
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
        contributionRate: 480000, description: 'C-suite and Senior VP — high-limit inpatient, executive outpatient, mental health, and surgical cover',
        isDefault: false,
      },
    })
    managementTier = await prisma.groupBenefitTier.create({
      data: {
        groupId: safaricom.id, name: 'Management', packageId: premierPkg.id,
        contributionRate: 210000, description: 'Managers and team leads — comprehensive cover including chronic and mental health benefits',
        isDefault: true,
      },
    })
    staffTier = await prisma.groupBenefitTier.create({
      data: {
        groupId: safaricom.id, name: 'Staff', packageId: essentialPkg.id,
        contributionRate: 95000, description: 'All permanent staff — essential inpatient, outpatient, dental, and optical cover',
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
  await prisma.groupBenefitTier.updateMany({ where: { groupId: safaricom.id, name: 'Executive' }, data: { packageId: executivePkg.id, contributionRate: 480000 } })
  await prisma.groupBenefitTier.updateMany({ where: { groupId: safaricom.id, name: 'Management' }, data: { packageId: premierPkg.id, contributionRate: 210000 } })
  await prisma.groupBenefitTier.updateMany({ where: { groupId: safaricom.id, name: 'Staff' }, data: { packageId: essentialPkg.id, contributionRate: 95000 } })

  // Other groups — flat package
  const otherGroupDefs = [
    { name: 'KCB Group',              industry: 'Banking & Finance',      contact: 'Moses Kiptoo',  phone: '+254700200200', email: 'hr@kcb.co.ke',     pkgIdx: 1, county: 'Nairobi',  brokerIdx: 1,    contributionRate: 225000 },
    { name: 'East African Breweries', industry: 'Manufacturing',           contact: 'Anne Chebet',   phone: '+254700300300', email: 'hr@eabl.co.ke',    pkgIdx: 1, county: 'Nairobi',  brokerIdx: null, contributionRate: 255000 },
    { name: 'Bamburi Cement',         industry: 'Construction',            contact: 'Samuel Njoroge',phone: '+254700400400', email: 'hr@bamburi.co.ke', pkgIdx: 0, county: 'Mombasa',  brokerIdx: 2,    contributionRate: 135000 },
    { name: 'Twiga Foods',            industry: 'Agriculture & Logistics', contact: 'Lucy Akinyi',   phone: '+254700500500', email: 'hr@twiga.com',     pkgIdx: 0, county: 'Nairobi',  brokerIdx: null, contributionRate: 115000 },
  ]
  const otherGroups: string[] = []
  for (const g of otherGroupDefs) {
    const pkg = packages[g.pkgIdx]
    const existing = await prisma.group.findFirst({ where: { tenantId: tenant.id, name: g.name } })
    if (existing) {
      await prisma.group.update({
        where: { id: existing.id },
        data: {
          packageId: pkg.id,
          packageVersionId: pkg.versionId,
          contributionRate: g.contributionRate,
          paymentFrequency: 'ANNUAL',
        },
      })
      otherGroups.push(existing.id);
      continue
    }
    const grp = await prisma.group.create({
      data: {
        tenantId: tenant.id, name: g.name, industry: g.industry,
        registrationNumber: `PVT-${Math.floor(100000+Math.random()*900000)}`,
        contactPersonName: g.contact, contactPersonPhone: g.phone, contactPersonEmail: g.email,
        county: g.county, packageId: pkg.id, packageVersionId: pkg.versionId,
        brokerId: g.brokerIdx !== null ? brokers[g.brokerIdx] : null,
        paymentFrequency: 'ANNUAL', contributionRate: g.contributionRate,
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

  // Demo portfolio top-up — enough covered lives for credible analytics.
  // Keeps the named seed members, then adds deterministic families across schemes.
  {
    const firstNames = [
      'Amina', 'Brian', 'Catherine', 'Dennis', 'Edith', 'Farah', 'Grace', 'Henry', 'Irene', 'Juma',
      'Kendi', 'Leonard', 'Miriam', 'Noah', 'Olive', 'Paul', 'Queen', 'Robert', 'Stella', 'Timothy',
      'Uma', 'Victor', 'Wambui', 'Xavier', 'Yvonne', 'Zachary', 'Atieno', 'Barasa', 'Chebet', 'Damaris',
    ]
    const lastNames = [
      'Otieno', 'Mwangi', 'Wekesa', 'Achieng', 'Mutiso', 'Kariuki', 'Naliaka', 'Muthoni', 'Kiptoo', 'Njoroge',
      'Adhiambo', 'Omondi', 'Wairimu', 'Karanja', 'Cherono', 'Mboya', 'Nyambura', 'Kiplagat', 'Mwaura', 'Were',
    ]
    const groupTargets = [
      { groupId: safaricom.id, code: 'SAF', target: 78, packageId: essentialPkg.id, packageVersionId: essentialPkg.versionId, tiers: [
        { tierId: executiveTier?.id ?? null, packageId: executivePkg.id, versionId: executivePkg.versionId, weight: 1 },
        { tierId: managementTier?.id ?? null, packageId: premierPkg.id, versionId: premierPkg.versionId, weight: 2 },
        { tierId: staffTier?.id ?? null, packageId: essentialPkg.id, versionId: essentialPkg.versionId, weight: 5 },
      ] },
      { groupId: kcbId, code: 'KCB', target: 52, packageId: premierPkg.id, packageVersionId: premierPkg.versionId },
      { groupId: eablId, code: 'EABL', target: 46, packageId: premierPkg.id, packageVersionId: premierPkg.versionId },
      { groupId: bamburiId, code: 'BAM', target: 38, packageId: essentialPkg.id, packageVersionId: essentialPkg.versionId },
      { groupId: twigaId, code: 'TWI', target: 32, packageId: essentialPkg.id, packageVersionId: essentialPkg.versionId },
    ]

    const pick = <T,>(items: T[], index: number) => items[index % items.length]
    const enrollmentDate = (index: number) => {
      const now = new Date()
      return new Date(now.getFullYear(), now.getMonth() - (index % 12), Math.min(25, 1 + (index % 24)))
    }
    const createIfMissing = async (data: {
      groupId: string
      memberNumber: string
      firstName: string
      lastName: string
      gender: 'MALE' | 'FEMALE'
      dateOfBirth: Date
      relationship: 'PRINCIPAL' | 'SPOUSE' | 'CHILD'
      packageId: string
      packageVersionId: string
      benefitTierId?: string | null
      principalId?: string
      enrollmentDate: Date
    }) => {
      const existing = await prisma.member.findUnique({
        where: { tenantId_memberNumber: { tenantId, memberNumber: data.memberNumber } },
        select: { id: true },
      })
      if (existing) return existing.id

      const member = await prisma.member.create({
        data: {
          tenantId,
          groupId: data.groupId,
          memberNumber: data.memberNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          gender: data.gender,
          dateOfBirth: data.dateOfBirth,
          relationship: data.relationship,
          principalId: data.principalId,
          packageId: data.packageId,
          packageVersionId: data.packageVersionId,
          benefitTierId: data.benefitTierId,
          enrollmentDate: data.enrollmentDate,
          activationDate: data.enrollmentDate,
          status: 'ACTIVE',
        },
        select: { id: true },
      })
      return member.id
    }

    let addedLives = 0
    for (const target of groupTargets) {
      let current = await prisma.member.count({ where: { tenantId, groupId: target.groupId, status: 'ACTIVE' } })
      let family = 1

      while (current < target.target) {
        const tierPool: { tierId: string | null; packageId: string; versionId: string; weight: number }[] = target.tiers
          ? target.tiers.flatMap((tier) => Array.from({ length: tier.weight }, () => tier))
          : [{ tierId: null, packageId: target.packageId, versionId: target.packageVersionId, weight: 1 }]
        const tier = pick(tierPool, family)
        const lastName = pick(lastNames, family + target.code.length)
        const principalGender = family % 2 === 0 ? 'FEMALE' as const : 'MALE' as const
        const spouseGender = principalGender === 'MALE' ? 'FEMALE' as const : 'MALE' as const
        const principalEnrollment = enrollmentDate(family)
        const principalId = await createIfMissing({
          groupId: target.groupId,
          memberNumber: `AVH-DEMO-${target.code}-${String(family).padStart(4, '0')}-P`,
          firstName: pick(firstNames, family),
          lastName,
          gender: principalGender,
          dateOfBirth: new Date(1974 + (family % 24), family % 12, 3 + (family % 20)),
          relationship: 'PRINCIPAL',
          packageId: tier.packageId,
          packageVersionId: tier.versionId,
          benefitTierId: tier.tierId,
          enrollmentDate: principalEnrollment,
        })
        current += 1
        addedLives += 1
        if (current >= target.target) break

        if (family % 2 !== 0 || target.code === 'SAF' || target.code === 'KCB') {
          await createIfMissing({
            groupId: target.groupId,
            memberNumber: `AVH-DEMO-${target.code}-${String(family).padStart(4, '0')}-S`,
            firstName: pick(firstNames, family + 7),
            lastName,
            gender: spouseGender,
            dateOfBirth: new Date(1976 + (family % 22), (family + 3) % 12, 2 + (family % 21)),
            relationship: 'SPOUSE',
            principalId,
            packageId: tier.packageId,
            packageVersionId: tier.versionId,
            benefitTierId: tier.tierId,
            enrollmentDate: principalEnrollment,
          })
          current += 1
          addedLives += 1
          if (current >= target.target) break
        }

        if (family % 3 !== 0) {
          await createIfMissing({
            groupId: target.groupId,
            memberNumber: `AVH-DEMO-${target.code}-${String(family).padStart(4, '0')}-C1`,
            firstName: pick(firstNames, family + 13),
            lastName,
            gender: family % 2 === 0 ? 'MALE' : 'FEMALE',
            dateOfBirth: new Date(2011 + (family % 11), (family + 6) % 12, 4 + (family % 18)),
            relationship: 'CHILD',
            principalId,
            packageId: tier.packageId,
            packageVersionId: tier.versionId,
            benefitTierId: tier.tierId,
            enrollmentDate: principalEnrollment,
          })
          current += 1
          addedLives += 1
          if (current >= target.target) break
        }

        if (family % 5 === 0) {
          await createIfMissing({
            groupId: target.groupId,
            memberNumber: `AVH-DEMO-${target.code}-${String(family).padStart(4, '0')}-C2`,
            firstName: pick(firstNames, family + 19),
            lastName,
            gender: family % 2 === 0 ? 'FEMALE' : 'MALE',
            dateOfBirth: new Date(2015 + (family % 7), (family + 9) % 12, 6 + (family % 16)),
            relationship: 'CHILD',
            principalId,
            packageId: tier.packageId,
            packageVersionId: tier.versionId,
            benefitTierId: tier.tierId,
            enrollmentDate: principalEnrollment,
          })
          current += 1
          addedLives += 1
        }

        family += 1
      }
    }

    members = await prisma.member.findMany({ where: { tenantId }, select: { id: true, groupId: true } })
    console.log(`✅ Demo portfolio covered lives: ${members.length} (${addedLives} top-up lives ensured across 5 schemes)`)
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
      if (eabl) {
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
        const eablClaims: { id: string; approvedAmount: unknown; benefitCategory: string; dateOfService: Date }[] = []
        if (eablMember1) {
          // Inpatient — large claim to show in large-claims table
          const clm1 = await prisma.claim.upsert({
            where: { tenantId_claimNumber: { tenantId, claimNumber: 'CLM-EABL-FUND-001' } },
            update: {
              memberId: eablMember1.id, providerId: providers[2],
              serviceType: 'INPATIENT', benefitCategory: 'INPATIENT',
              dateOfService: new Date('2025-02-10'),
              admissionDate: new Date('2025-02-10'), dischargeDate: new Date('2025-02-14'), lengthOfStay: 4,
              billedAmount: 220000, approvedAmount: 210000, status: 'APPROVED',
              decidedAt: new Date('2025-02-15'), receivedAt: new Date('2025-02-15'),
              diagnoses: [{ icdCode: 'J18.9', description: 'Pneumonia', isPrimary: true }],
              procedures: [],
            },
            create: {
            tenantId, claimNumber: 'CLM-EABL-FUND-001',
            memberId: eablMember1.id, providerId: providers[2],
            serviceType: 'INPATIENT', benefitCategory: 'INPATIENT',
            dateOfService: new Date('2025-02-10'),
            admissionDate: new Date('2025-02-10'), dischargeDate: new Date('2025-02-14'), lengthOfStay: 4,
            billedAmount: 220000, approvedAmount: 210000, status: 'APPROVED',
            decidedAt: new Date('2025-02-15'), receivedAt: new Date('2025-02-15'),
            diagnoses: [{ icdCode: 'J18.9', description: 'Pneumonia', isPrimary: true }],
            procedures: [],
          }})
          eablClaims.push(clm1)

          // Outpatient — medium claim
          const clm2 = await prisma.claim.upsert({
            where: { tenantId_claimNumber: { tenantId, claimNumber: 'CLM-EABL-FUND-002' } },
            update: {
              memberId: eablMember1.id, providerId: providers[0],
              serviceType: 'OUTPATIENT', benefitCategory: 'OUTPATIENT',
              dateOfService: new Date('2025-03-05'),
              billedAmount: 18500, approvedAmount: 17000, status: 'APPROVED',
              decidedAt: new Date('2025-03-05'), receivedAt: new Date('2025-03-05'),
              diagnoses: [{ icdCode: 'E11.9', description: 'Type 2 diabetes', isPrimary: true }],
              procedures: [],
            },
            create: {
            tenantId, claimNumber: 'CLM-EABL-FUND-002',
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
          eablClaims.push(clm2)
        }
        if (eablMember2 && eablMember2.id !== eablMember1?.id) {
          // Surgical — large, triggers large-claims table
          const clm3 = await prisma.claim.upsert({
            where: { tenantId_claimNumber: { tenantId, claimNumber: 'CLM-EABL-FUND-003' } },
            update: {
              memberId: eablMember2.id, providerId: providers[2],
              serviceType: 'INPATIENT', benefitCategory: 'SURGICAL',
              dateOfService: new Date('2025-01-20'),
              billedAmount: 185000, approvedAmount: 175000, status: 'PAID',
              decidedAt: new Date('2025-01-22'), receivedAt: new Date('2025-01-22'),
              paidAt: new Date('2025-02-01'),
              diagnoses: [{ icdCode: 'K35.9', description: 'Acute appendicitis', isPrimary: true }],
              procedures: [{ cptCode: '44950', description: 'Appendectomy', quantity: 1, unitCost: 110000 }],
            },
            create: {
            tenantId, claimNumber: 'CLM-EABL-FUND-003',
            memberId: eablMember2.id, providerId: providers[2],
            serviceType: 'INPATIENT', benefitCategory: 'SURGICAL',
            dateOfService: new Date('2025-01-20'),
            billedAmount: 185000, approvedAmount: 175000, status: 'PAID',
            decidedAt: new Date('2025-01-22'), receivedAt: new Date('2025-01-22'),
            paidAt: new Date('2025-02-01'),
            diagnoses: [{ icdCode: 'K35.9', description: 'Acute appendicitis', isPrimary: true }],
            procedures: [{ cptCode: '44950', description: 'Appendectomy', quantity: 1, unitCost: 110000 }],
          }})
          eablClaims.push(clm3)

          // Dental
          const clm4 = await prisma.claim.upsert({
            where: { tenantId_claimNumber: { tenantId, claimNumber: 'CLM-EABL-FUND-004' } },
            update: {
              memberId: eablMember2.id, providerId: providers[0],
              serviceType: 'OUTPATIENT', benefitCategory: 'DENTAL',
              dateOfService: new Date('2025-03-18'),
              billedAmount: 22000, approvedAmount: 20000, status: 'APPROVED',
              decidedAt: new Date('2025-03-18'), receivedAt: new Date('2025-03-18'),
              diagnoses: [{ icdCode: 'K02.9', description: 'Dental caries', isPrimary: true }],
              procedures: [],
            },
            create: {
            tenantId, claimNumber: 'CLM-EABL-FUND-004',
            memberId: eablMember2.id, providerId: providers[0],
            serviceType: 'OUTPATIENT', benefitCategory: 'DENTAL',
            dateOfService: new Date('2025-03-18'),
            billedAmount: 22000, approvedAmount: 20000, status: 'APPROVED',
            decidedAt: new Date('2025-03-18'), receivedAt: new Date('2025-03-18'),
            diagnoses: [{ icdCode: 'K02.9', description: 'Dental caries', isPrimary: true }],
            procedures: [],
          }})
          eablClaims.push(clm4)
        }

        // Build fund account: corporate-sized opening deposit and running balance from real claim amounts
        const eablOpeningDeposit = 32_000_000
        const eablAdminFee = 450_000
        let runningBalance = eablOpeningDeposit
        const claimTotal = eablClaims.reduce((s, c) => s + Number(c.approvedAmount), 0)
        runningBalance -= claimTotal
        runningBalance -= eablAdminFee

        const sfAccount = await prisma.selfFundedAccount.upsert({
          where: { groupId: eabl.id },
          update: {
            tenantId,
            balance: runningBalance,
            totalDeposited: eablOpeningDeposit,
            totalClaims: claimTotal,
            totalAdminFees: eablAdminFee,
            minimumBalance: 6_000_000,
            heldCategories: [],
            periodStartDate: new Date('2025-01-01'), periodEndDate: new Date('2025-12-31'),
          },
          create: {
            tenantId, groupId: eabl.id,
            balance: runningBalance,
            totalDeposited: eablOpeningDeposit,
            totalClaims: claimTotal,
            totalAdminFees: eablAdminFee,
            minimumBalance: 6_000_000,
            heldCategories: [],
            periodStartDate: new Date('2025-01-01'), periodEndDate: new Date('2025-12-31'),
          },
        })
        await prisma.fundTransaction.deleteMany({ where: { selfFundedAccountId: sfAccount.id } })

        // Fund ledger: deposit → each individual claim deduction → admin fee
        let ledgerBalance = 0
        const claimDeductions: { amount: number; balance: number; claimId: string; description: string; postedAt: Date }[] = []

        // Opening deposit
        ledgerBalance = eablOpeningDeposit
        await prisma.fundTransaction.create({ data: {
          tenantId, selfFundedAccountId: sfAccount.id,
          type: 'DEPOSIT', amount: eablOpeningDeposit, balanceAfter: ledgerBalance,
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
        ledgerBalance -= eablAdminFee
        await prisma.fundTransaction.create({ data: {
          tenantId, selfFundedAccountId: sfAccount.id,
          type: 'ADMIN_FEE', amount: eablAdminFee, balanceAfter: ledgerBalance,
          description: 'Admin fee Q1 2025 — corporate self-funded administration retainer', referenceNumber: 'ADM-EABL-2025-Q1',
          postedAt: new Date('2025-04-01'),
        }})

        console.log(`✅ Self-funded scheme 1: East African Breweries — KES ${runningBalance.toLocaleString()} balance, ${eablClaims.length} claims wired to fund`)
      }

      // Scheme 2: Bamburi Cement — LOW balance, triggers alert demonstration
      const bamburi = await prisma.group.findFirst({ where: { tenantId, name: 'Bamburi Cement' } })
      if (bamburi) {
        const fundAdminUser = await prisma.user.findFirst({ where: { tenantId, email: 'fund@avenue.co.ke' } })
        await prisma.group.update({ where: { id: bamburi.id }, data: {
          fundingMode: 'SELF_FUNDED', adminFeeMethod: 'PCT_OF_CLAIMS', adminFeeRate: 5,
          fundAdministrators: fundAdminUser ? { connect: { id: fundAdminUser.id } } : undefined,
        }})
        // Deliberately seeded with balance BELOW minimum to demo the low-balance alert
        let bal = 12_000_000
        const sfAccount2 = await prisma.selfFundedAccount.upsert({
          where: { groupId: bamburi.id },
          update: {
            tenantId,
            balance: 3_800_000,           // below minimumBalance of 5M → triggers alert without looking toy-sized
            totalDeposited: 12_000_000,
            totalClaims: 7_600_000,
            totalAdminFees: 600_000,
            minimumBalance: 5_000_000,
            heldCategories: [],
            periodStartDate: new Date('2025-01-01'), periodEndDate: new Date('2025-12-31'),
          },
          create: {
            tenantId, groupId: bamburi.id,
            balance: 3_800_000,
            totalDeposited: 12_000_000,
            totalClaims: 7_600_000,
            totalAdminFees: 600_000,
            minimumBalance: 5_000_000,
            heldCategories: [],
            periodStartDate: new Date('2025-01-01'), periodEndDate: new Date('2025-12-31'),
          },
        })
        await prisma.fundTransaction.deleteMany({ where: { selfFundedAccountId: sfAccount2.id } })
        for (const txn of [
          { type: 'DEPOSIT' as const,          amount: 12_000_000, balanceAfter: (bal = 12_000_000),          description: 'Opening deposit 2025',              referenceNumber: 'EFT-BAM-2025-001', postedAt: new Date('2025-01-03') },
          { type: 'CLAIM_DEDUCTION' as const,  amount:  1_850_000, balanceAfter: (bal -= 1_850_000, bal),      description: 'Claims deductions Jan 2025',         referenceNumber: null,                postedAt: new Date('2025-02-01') },
          { type: 'CLAIM_DEDUCTION' as const,  amount:  2_120_000, balanceAfter: (bal -= 2_120_000, bal),      description: 'Claims deductions Feb 2025',         referenceNumber: null,                postedAt: new Date('2025-03-01') },
          { type: 'ADMIN_FEE' as const,        amount:    200_000, balanceAfter: (bal -= 200_000,   bal),      description: 'Admin fee Q1 — 5% claims administration retainer', referenceNumber: 'ADM-BAM-Q1', postedAt: new Date('2025-04-01') },
          { type: 'CLAIM_DEDUCTION' as const,  amount:  2_450_000, balanceAfter: (bal -= 2_450_000, bal),      description: 'Claims deductions Mar 2025',         referenceNumber: null,                postedAt: new Date('2025-04-05') },
          { type: 'CLAIM_DEDUCTION' as const,  amount:  1_180_000, balanceAfter: (bal -= 1_180_000, bal),      description: 'Claims deductions Apr 2025 (partial)',referenceNumber: null,                postedAt: new Date('2025-04-20') },
          { type: 'ADMIN_FEE' as const,        amount:    400_000, balanceAfter: (bal -= 400_000,   bal),      description: 'Admin fee Q2 — 5% claims administration retainer', referenceNumber: 'ADM-BAM-Q2', postedAt: new Date('2025-04-25') },
        ]) {
          await prisma.fundTransaction.create({ data: { tenantId, selfFundedAccountId: sfAccount2.id, ...txn } })
        }
        console.log(`✅ Self-funded scheme 2: Bamburi Cement — KES 3.8M balance (BELOW minimum KES 5M → low-balance demo)`)
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

      // ── 16m-2. Broker Command Center demo data ───────────────────────────
      const brokerCommandCenterExists = await prisma.brokerCommissionSchedule.findFirst({
        where: { broker: { tenantId }, scheduleName: 'KAIB Corporate Standard 2026' },
      })
      if (!brokerCommandCenterExists) {
        const [kaib, minet] = await Promise.all([
          prisma.broker.findFirst({ where: { tenantId, name: 'Kenyan Alliance Insurance Brokers' } }),
          prisma.broker.findFirst({ where: { tenantId, name: 'Minet Kenya' } }),
        ])
        const safaricomGroup = await prisma.group.findFirst({ where: { tenantId, name: 'Safaricom PLC' } })
        const adminUserId = users['SUPER_ADMIN']

        if (kaib && safaricomGroup && adminUserId) {
          await prisma.broker.update({
            where: { id: kaib.id },
            data: {
              brokerCode: kaib.brokerCode ?? 'BRK-KAIB',
              legalName: 'Kenyan Alliance Insurance Brokers Limited',
              tradingName: 'KAIB',
              brokerType: 'MASTER_BROKER',
              intermediaryCategory: 'REGULATED_BROKER',
              requiresIraRegistration: true,
              canReceiveCommission: true,
              commissionBasis: 'COMMISSION',
              sourceDescription: 'Regulated master broker used for Avenue corporate business demos.',
              iraExpiryDate: new Date('2026-12-31'),
              kraPin: 'P051234567A',
              vatRegistered: true,
              vatNumber: 'VAT-KAIB-001',
              bankAccountReference: 'KCB-010012345678',
              mpesaPaybillNumber: '522522',
              approvedById: adminUserId,
              approvedAt: new Date('2024-01-05'),
            },
          })

          if (minet) {
            await prisma.broker.update({
              where: { id: minet.id },
              data: {
                brokerCode: minet.brokerCode ?? 'BRK-MINET',
                legalName: 'Minet Kenya Insurance Brokers Limited',
                brokerType: 'SUB_AGENT',
                intermediaryCategory: 'REGULATED_BROKER',
                requiresIraRegistration: true,
                canReceiveCommission: true,
                commissionBasis: 'COMMISSION',
                parentBrokerId: kaib.id,
                iraExpiryDate: new Date('2025-07-15'),
                kraPin: 'P052345678B',
              },
            })
          }

          const independentIntroducer = await prisma.broker.create({
            data: {
              tenantId,
              name: 'Nia Health Introducers',
              brokerCode: 'SRC-NIA-INTRO',
              legalName: 'Nia Health Introducers',
              tradingName: 'Nia Introducers',
              brokerType: 'INDIVIDUAL_PRODUCER',
              intermediaryCategory: 'INTRODUCER',
              requiresIraRegistration: false,
              canReceiveCommission: true,
              commissionBasis: 'REFERRAL_FEE',
              referralFeeAmount: 15000,
              sourceDescription: 'Independent non-IRA introducer that brings employer leads and is paid by approved referral fee.',
              contactPerson: 'Nia Kamau',
              phone: '+254722901100',
              email: 'nia.introducer@example.com',
              kraPin: 'A012345678N',
              bankAccountReference: 'EQUITY-010099887766',
              effectiveFrom: new Date('2024-01-01'),
              approvedById: adminUserId,
              approvedAt: new Date('2024-01-10'),
              status: 'ACTIVE',
            },
          })

          const internalSalesSource = await prisma.broker.create({
            data: {
              tenantId,
              name: 'Avenue Corporate Sales Desk',
              brokerCode: 'SRC-AVENUE-SALES',
              legalName: 'Avenue Healthcare Corporate Sales Desk',
              brokerType: 'INDIVIDUAL_PRODUCER',
              intermediaryCategory: 'INTERNAL_SALES',
              requiresIraRegistration: false,
              canReceiveCommission: false,
              commissionBasis: 'ATTRIBUTION_ONLY',
              sourceDescription: 'Internal sales attribution source. No external commission or referral payout is generated.',
              contactPerson: 'Corporate Sales Lead',
              phone: '+254700300300',
              email: 'corporate.sales@avenuehealthcare.com',
              effectiveFrom: new Date('2024-01-01'),
              approvedById: adminUserId,
              approvedAt: new Date('2024-01-10'),
              status: 'ACTIVE',
            },
          })

          await prisma.brokerKycDocument.createMany({
            data: [
              {
                brokerId: kaib.id,
                documentType: 'IRA_LICENSE',
                fileUri: '/seed-docs/brokers/kaib-ira-license-2026.pdf',
                fileName: 'KAIB IRA License 2026.pdf',
                uploadedById: adminUserId,
                verifiedAt: new Date('2024-01-05'),
                verifiedById: adminUserId,
                expiresAt: new Date('2026-12-31'),
                status: 'VERIFIED',
              },
              {
                brokerId: kaib.id,
                documentType: 'KRA_PIN_CERTIFICATE',
                fileUri: '/seed-docs/brokers/kaib-kra-pin.pdf',
                fileName: 'KAIB KRA PIN Certificate.pdf',
                uploadedById: adminUserId,
                verifiedAt: new Date('2024-01-05'),
                verifiedById: adminUserId,
                status: 'VERIFIED',
              },
              {
                brokerId: kaib.id,
                documentType: 'BANK_CONFIRMATION',
                fileUri: '/seed-docs/brokers/kaib-bank-confirmation.pdf',
                fileName: 'KAIB Bank Confirmation.pdf',
                uploadedById: adminUserId,
                status: 'PENDING_REVIEW',
                notes: 'Seeded pending review to demonstrate KYC workflow.',
              },
              {
                brokerId: independentIntroducer.id,
                documentType: 'KRA_PIN_CERTIFICATE',
                fileUri: '/seed-docs/intermediaries/nia-kra-pin.pdf',
                fileName: 'Nia Introducers KRA PIN Certificate.pdf',
                uploadedById: adminUserId,
                verifiedAt: new Date('2024-01-10'),
                verifiedById: adminUserId,
                status: 'VERIFIED',
              },
              {
                brokerId: independentIntroducer.id,
                documentType: 'REFERRAL_AGREEMENT',
                fileUri: '/seed-docs/intermediaries/nia-referral-agreement.pdf',
                fileName: 'Nia Referral Agreement.pdf',
                uploadedById: adminUserId,
                verifiedAt: new Date('2024-01-10'),
                verifiedById: adminUserId,
                expiresAt: new Date('2026-01-09'),
                status: 'VERIFIED',
              },
              {
                brokerId: independentIntroducer.id,
                documentType: 'BANK_CONFIRMATION',
                fileUri: '/seed-docs/intermediaries/nia-bank-confirmation.pdf',
                fileName: 'Nia Bank Confirmation.pdf',
                uploadedById: adminUserId,
                verifiedAt: new Date('2024-01-10'),
                verifiedById: adminUserId,
                status: 'VERIFIED',
              },
            ],
          })

          const producer = await prisma.brokerProducer.create({
            data: {
              brokerId: kaib.id,
              producerName: 'Grace Wanjiku',
              producerCode: 'PROD-KAIB-001',
              iraIndividualNumber: 'IRA-AGT-77881',
              email: 'grace.wanjiku@kaib.co.ke',
              phone: '+254722555001',
              effectiveFrom: new Date('2024-01-01'),
              status: 'ACTIVE',
              groups: { connect: [{ id: safaricomGroup.id }] },
            },
          })

          const schedule = await prisma.brokerCommissionSchedule.create({
            data: {
              brokerId: kaib.id,
              scheduleName: 'KAIB Corporate Standard 2026',
              scheduleType: 'TIERED_VOLUME',
              groupId: safaricomGroup.id,
              clientType: 'CORPORATE',
              newBusinessRate: 0.12,
              renewalRate: 0.08,
              overrideRate: minet ? 0.02 : null,
              grossCommissionCeiling: 0.15,
              payoutCycleDays: 30,
              effectiveFrom: new Date('2024-01-01'),
              status: 'ACTIVE',
              createdById: adminUserId,
              approvedById: adminUserId,
              approvedAt: new Date('2024-01-06'),
              tiers: {
                create: [
                  { tierOrder: 1, thresholdMetric: 'GROSS_CONTRIBUTION_BAND', thresholdMin: 0, thresholdMax: 250000, rate: 0.08 },
                  { tierOrder: 2, thresholdMetric: 'GROSS_CONTRIBUTION_BAND', thresholdMin: 250001, thresholdMax: 750000, rate: 0.10 },
                  { tierOrder: 3, thresholdMetric: 'GROSS_CONTRIBUTION_BAND', thresholdMin: 750001, thresholdMax: null, rate: 0.12 },
                ],
              },
            },
          })

          const ledgerRows = [
            { receipt: 'SEED-RCPT-2024-001', start: new Date('2024-01-01'), end: new Date('2024-01-31'), gross: 18000, wht: 1800, vat: 2880, levy: 36, net: 19044, state: 'PAID', paidAt: new Date('2024-02-10'), ref: 'PAY-KAIB-001' },
            { receipt: 'SEED-RCPT-2024-002', start: new Date('2024-02-01'), end: new Date('2024-02-29'), gross: 18000, wht: 1800, vat: 2880, levy: 36, net: 19044, state: 'PAYABLE', paidAt: null, ref: null },
            { receipt: 'SEED-RCPT-2024-003', start: new Date('2024-03-01'), end: new Date('2024-03-31'), gross: 0, wht: 0, vat: 0, levy: 0, net: 0, state: 'PENDING_RECONCILIATION', paidAt: null, ref: null },
          ] as const

          for (const row of ledgerRows) {
            await prisma.commissionLedgerEntry.create({
              data: {
                brokerId: kaib.id,
                scheduleId: row.state === 'PENDING_RECONCILIATION' ? null : schedule.id,
                groupId: safaricomGroup.id,
                contributionReceiptId: row.receipt,
                state: row.state,
                grossCommission: row.gross,
                withholdingTax: row.wht,
                vatAmount: row.vat,
                iraAgentLevy: row.levy,
                netPayable: row.net,
                earnedPeriodStart: row.start,
                earnedPeriodEnd: row.end,
                paidAt: row.paidAt,
                paymentReference: row.ref,
                notes: row.state === 'PENDING_RECONCILIATION' ? 'Seeded pending item for broker compliance demo.' : null,
              },
            })
          }

          const paidEntry = await prisma.commissionLedgerEntry.findFirst({
            where: { brokerId: kaib.id, contributionReceiptId: 'SEED-RCPT-2024-001' },
            select: { id: true },
          })
          if (paidEntry) {
            const batch = await prisma.commissionPayoutBatch.create({
              data: {
                batchReference: 'CPB-SEED-KAIB-001',
                batchDate: new Date('2024-02-10'),
                totalGross: 18000,
                totalWHT: 1800,
                totalVAT: 2880,
                totalLevy: 36,
                totalNet: 19044,
                status: 'COMPLETED',
                generatedById: adminUserId,
                approvedById: adminUserId,
                approvedAt: new Date('2024-02-09'),
                disbursedAt: new Date('2024-02-10'),
              },
            })
            await prisma.commissionLedgerEntry.update({
              where: { id: paidEntry.id },
              data: { payoutBatchId: batch.id },
            })
          }

          console.log(`✅ Broker/Intermediary demo: schedule, KYC, producer ${producer.producerCode}, introducer ${independentIntroducer.brokerCode}, internal source ${internalSalesSource.brokerCode}, ledger, payout batch`)
        }
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

  // ═══════════════════════════════════════════════════════════
  // 18. STRATEGIC PURCHASING ANALYTICS DEMO DATA
  // ═══════════════════════════════════════════════════════════
  {
    const demoAnchor = new Date()
    const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
    const addDays = (date: Date, days: number) => {
      const copy = new Date(date)
      copy.setDate(copy.getDate() + days)
      return copy
    }
    const addMonths = (date: Date, months: number) => {
      const copy = new Date(date)
      copy.setMonth(copy.getMonth() + months)
      return copy
    }
    const closedMonths = Array.from({ length: 16 }, (_, i) => {
      const date = monthStart(addMonths(demoAnchor, -15 + i))
      return monthKey(date)
    })

    const existingAnalyticsSnapshots = await prisma.analyticsMlrSnapshot.count({ where: { tenantId } })
    if (existingAnalyticsSnapshots > 0) {
      console.log(`✅ Strategic purchasing analytics demo: ${existingAnalyticsSnapshots} existing MLR snapshots found; skipping expensive demo regeneration`)
    } else {
    const demoGroups = await prisma.group.findMany({
      where: {
        tenantId,
        name: { in: ['Safaricom PLC', 'KCB Group', 'East African Breweries', 'Bamburi Cement', 'Twiga Foods'] },
      },
      include: {
        members: { where: { status: 'ACTIVE' }, select: { id: true, packageId: true, packageVersionId: true, benefitTierId: true } },
        broker: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    })

    const scenarioByName: Record<string, {
      code: string
      renewalOffset: number
      mlr: number
      status: 'healthy' | 'watch' | 'critical'
      providerPattern: number[]
      diseasePattern: { icd: string; label: string; benefitCategory: 'OUTPATIENT' | 'INPATIENT' | 'CHRONIC_DISEASE' | 'SURGICAL' | 'MATERNITY' | 'DENTAL' | 'OPTICAL'; serviceType: 'OUTPATIENT' | 'INPATIENT' | 'DAY_CASE' }[]
    }> = {
      'Safaricom PLC': {
        code: 'SAF', renewalOffset: 22, mlr: 0.58, status: 'healthy', providerPattern: [0, 1, 4],
        diseasePattern: [
          { icd: 'B54', label: 'Malaria, unspecified', benefitCategory: 'OUTPATIENT', serviceType: 'OUTPATIENT' },
          { icd: 'J06.9', label: 'Acute upper respiratory infection', benefitCategory: 'OUTPATIENT', serviceType: 'OUTPATIENT' },
          { icd: 'E11.9', label: 'Type 2 diabetes mellitus', benefitCategory: 'CHRONIC_DISEASE', serviceType: 'OUTPATIENT' },
        ],
      },
      'KCB Group': {
        code: 'KCB', renewalOffset: 37, mlr: 0.78, status: 'watch', providerPattern: [0, 2, 4],
        diseasePattern: [
          { icd: 'I10', label: 'Essential hypertension', benefitCategory: 'CHRONIC_DISEASE', serviceType: 'OUTPATIENT' },
          { icd: 'E11.9', label: 'Type 2 diabetes mellitus', benefitCategory: 'CHRONIC_DISEASE', serviceType: 'OUTPATIENT' },
          { icd: 'J18.9', label: 'Pneumonia, unspecified organism', benefitCategory: 'INPATIENT', serviceType: 'INPATIENT' },
        ],
      },
      'East African Breweries': {
        code: 'EABL', renewalOffset: 61, mlr: 0.94, status: 'critical', providerPattern: [2, 3, 0],
        diseasePattern: [
          { icd: 'J18.9', label: 'Pneumonia, unspecified organism', benefitCategory: 'INPATIENT', serviceType: 'INPATIENT' },
          { icd: 'K35.9', label: 'Acute appendicitis', benefitCategory: 'SURGICAL', serviceType: 'INPATIENT' },
          { icd: 'E11.9', label: 'Type 2 diabetes mellitus', benefitCategory: 'CHRONIC_DISEASE', serviceType: 'OUTPATIENT' },
        ],
      },
      'Bamburi Cement': {
        code: 'BAM', renewalOffset: 83, mlr: 1.08, status: 'critical', providerPattern: [3, 2, 5],
        diseasePattern: [
          { icd: 'K35.9', label: 'Acute appendicitis', benefitCategory: 'SURGICAL', serviceType: 'INPATIENT' },
          { icd: 'S09.9', label: 'Head injury', benefitCategory: 'INPATIENT', serviceType: 'INPATIENT' },
          { icd: 'M54.5', label: 'Low back pain', benefitCategory: 'OUTPATIENT', serviceType: 'OUTPATIENT' },
        ],
      },
      'Twiga Foods': {
        code: 'TWI', renewalOffset: 112, mlr: 0.69, status: 'watch', providerPattern: [1, 0, 4],
        diseasePattern: [
          { icd: 'A09', label: 'Gastroenteritis and diarrhoeal disease', benefitCategory: 'OUTPATIENT', serviceType: 'OUTPATIENT' },
          { icd: 'N39.0', label: 'Urinary tract infection', benefitCategory: 'OUTPATIENT', serviceType: 'OUTPATIENT' },
          { icd: 'O80', label: 'Single spontaneous delivery', benefitCategory: 'MATERNITY', serviceType: 'INPATIENT' },
        ],
      },
    }

    for (const group of demoGroups) {
      const scenario = scenarioByName[group.name]
      if (!scenario || group.members.length === 0) continue

      await prisma.group.update({
        where: { id: group.id },
        data: { renewalDate: addDays(demoAnchor, scenario.renewalOffset) },
      })

      const memberCount = group.members.length
      const annualRatePerMember = Number(group.contributionRate)
      const monthlyRatePerMember = Math.round(annualRatePerMember / 12)
      const monthlyContribution = memberCount * monthlyRatePerMember

      for (let i = 0; i < closedMonths.length; i++) {
        const period = closedMonths[i]
        const [year, month] = period.split('-').map(Number)
        const dueDate = new Date(year, month, 15)
        const invoiceNumber = `AN-${scenario.code}-${period.replace('-', '')}`
        const paidPct = i >= closedMonths.length - 1 && scenario.status === 'critical' ? 0.65 : scenario.status === 'watch' && i % 5 === 0 ? 0.82 : 1
        const totalAmount = Math.round(monthlyContribution)
        const paidAmount = Math.round(totalAmount * paidPct)
        const balance = totalAmount - paidAmount
        const invoiceStatus = balance === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'SENT'

        let invoice = await prisma.invoice.findUnique({
          where: { tenantId_invoiceNumber: { tenantId, invoiceNumber } },
        })
        if (!invoice) {
          invoice = await prisma.invoice.create({ data: {
            tenantId,
            invoiceNumber,
            groupId: group.id,
            period,
            memberCount,
            ratePerMember: monthlyRatePerMember,
            totalAmount,
            paidAmount,
            balance,
            dueDate,
            sentAt: new Date(year, month - 1, 5),
            status: invoiceStatus,
            notes: `Analytics demo invoice — ${group.name} ${period}`,
          }})
        }

        if (paidAmount > 0) {
          const paymentExists = await prisma.payment.findFirst({
            where: { invoiceId: invoice.id, referenceNumber: `PAY-${invoiceNumber}` },
          })
          if (!paymentExists) {
            await prisma.payment.create({ data: {
              groupId: group.id,
              invoiceId: invoice.id,
              amount: paidAmount,
              paymentDate: new Date(year, month - 1, Math.min(24, 12 + (i % 10))),
              paymentMethod: i % 4 === 0 ? 'MPESA' : 'BANK_TRANSFER',
              referenceNumber: `PAY-${invoiceNumber}`,
              notes: `Analytics demo payment — ${group.name} ${period}`,
            }})
          }
        }

        const seasonal = 0.86 + ((i % 6) * 0.055)
        const claimBudget = Math.round(monthlyContribution * scenario.mlr * seasonal)
        const claimCount = scenario.status === 'healthy'
          ? Math.max(6, Math.ceil(memberCount * 0.08))
          : scenario.status === 'watch'
            ? Math.max(8, Math.ceil(memberCount * 0.12))
            : Math.max(10, Math.ceil(memberCount * 0.16))
        for (let j = 0; j < claimCount; j++) {
          const member = group.members[(i + j) % group.members.length]
          const disease = scenario.diseasePattern[(i + j) % scenario.diseasePattern.length]
          const providerId = providers[scenario.providerPattern[(i + j) % scenario.providerPattern.length]] ?? providers[0]
          const claimNumber = `CLM-AN-${scenario.code}-${period.replace('-', '')}-${String(j + 1).padStart(2, '0')}`
          const exists = await prisma.claim.findUnique({
            where: { tenantId_claimNumber: { tenantId, claimNumber } },
          })
          if (exists) continue

          const dateOfService = new Date(year, month - 1, Math.min(26, 4 + j * 6))
          const approvedAmount = Math.max(2500, Math.round((claimBudget / claimCount) * (0.84 + j * 0.08)))
          const billedAmount = Math.round(approvedAmount * (1.05 + (j % 3) * 0.04))
          const memberLiability = Math.max(0, billedAmount - approvedAmount)
          await prisma.claim.create({ data: {
            tenantId,
            claimNumber,
            invoiceNumber: `PROV-${scenario.code}-${period.replace('-', '')}-${j + 1}`,
            memberId: member.id,
            providerId,
            serviceType: disease.serviceType,
            benefitCategory: disease.benefitCategory,
            dateOfService,
            receivedAt: dateOfService,
            decidedAt: addDays(dateOfService, 3),
            paidAt: j % 3 === 0 ? addDays(dateOfService, 12) : null,
            diagnoses: [{ icdCode: disease.icd, description: disease.label, isPrimary: true }],
            procedures: [],
            billedAmount,
            approvedAmount,
            paidAmount: j % 3 === 0 ? approvedAmount : 0,
            memberLiability,
            status: j % 3 === 0 ? 'PAID' : 'APPROVED',
            claimLines: { create: [
              {
                lineNumber: 1,
                serviceCategory: disease.serviceType === 'INPATIENT' ? 'PROCEDURE' : 'CONSULTATION',
                description: `${disease.label} care bundle`,
                icdCode: disease.icd,
                quantity: 1,
                unitCost: Math.round(billedAmount * 0.62),
                billedAmount: Math.round(billedAmount * 0.62),
                approvedAmount: Math.round(approvedAmount * 0.62),
              },
              {
                lineNumber: 2,
                serviceCategory: disease.benefitCategory === 'CHRONIC_DISEASE' ? 'PHARMACY' : 'LABORATORY',
                description: disease.benefitCategory === 'CHRONIC_DISEASE' ? 'Chronic medication and consumables' : 'Diagnostics and consumables',
                icdCode: disease.icd,
                quantity: 1,
                unitCost: billedAmount - Math.round(billedAmount * 0.62),
                billedAmount: billedAmount - Math.round(billedAmount * 0.62),
                approvedAmount: approvedAmount - Math.round(approvedAmount * 0.62),
              },
            ]},
          }})
        }
      }
    }

    const riskCandidates = await prisma.member.findMany({
      where: { tenantId, status: 'ACTIVE' },
      include: { package: { select: { annualLimit: true } } },
      take: 12,
    })
    const riskTiers = [
      { tier: 'LOW' as const, score: 0.18, tags: ['preventive'], pct: 0.22, claims: 2, projected: null },
      { tier: 'LOW' as const, score: 0.26, tags: ['low-acute'], pct: 0.31, claims: 3, projected: null },
      { tier: 'MODERATE' as const, score: 0.46, tags: ['hypertension'], pct: 0.54, claims: 5, projected: addDays(demoAnchor, 210) },
      { tier: 'MODERATE' as const, score: 0.58, tags: ['diabetes'], pct: 0.68, claims: 7, projected: addDays(demoAnchor, 160) },
      { tier: 'HIGH' as const, score: 0.78, tags: ['diabetes', 'inpatient-risk'], pct: 0.84, claims: 9, projected: addDays(demoAnchor, 90) },
      { tier: 'HIGH' as const, score: 0.86, tags: ['maternity', 'surgical-risk'], pct: 0.93, claims: 10, projected: addDays(demoAnchor, 60) },
      { tier: 'CRITICAL' as const, score: 0.94, tags: ['pneumonia', 'repeat-admission'], pct: 1.08, claims: 12, projected: addDays(demoAnchor, 28) },
      { tier: 'CRITICAL' as const, score: 0.98, tags: ['orthopaedic', 'cap-exceeded'], pct: 1.18, claims: 14, projected: addDays(demoAnchor, 14) },
    ]
    for (let i = 0; i < Math.min(riskCandidates.length, riskTiers.length); i++) {
      const member = riskCandidates[i]
      const risk = riskTiers[i]
      const cap = Number(member.package.annualLimit)
      await prisma.memberRiskProfile.upsert({
        where: { memberId: member.id },
        update: {
          tenantId,
          groupId: member.groupId,
          riskTier: risk.tier,
          riskScore: risk.score,
          chronicTags: risk.tags,
          utilizationToCap: risk.pct,
          projectedExceedDate: risk.projected,
          trailing12ClaimCost: Math.round(cap * Math.min(risk.pct, 1.25)),
          trailing12ClaimCount: risk.claims,
          lastCalculatedAt: demoAnchor,
        },
        create: {
          tenantId,
          groupId: member.groupId,
          memberId: member.id,
          riskTier: risk.tier,
          riskScore: risk.score,
          chronicTags: risk.tags,
          utilizationToCap: risk.pct,
          projectedExceedDate: risk.projected,
          trailing12ClaimCost: Math.round(cap * Math.min(risk.pct, 1.25)),
          trailing12ClaimCount: risk.claims,
          lastCalculatedAt: demoAnchor,
        },
      })
    }

    await prisma.analyticsAlert.deleteMany({
      where: { tenantId, context: { path: ['source'], equals: 'analytics-demo' } },
    })
    const alertGroups = await prisma.group.findMany({
      where: { tenantId, name: { in: ['East African Breweries', 'Bamburi Cement', 'KCB Group', 'Safaricom PLC'] } },
      select: { id: true, name: true, brokerId: true },
    })
    const groupByName = new Map(alertGroups.map(g => [g.name, g]))
    const providerForAlert = await prisma.provider.findFirst({ where: { tenantId, name: 'Aga Khan University Hospital' }, select: { id: true } })
    await prisma.analyticsAlert.createMany({ data: [
      {
        tenantId,
        groupId: groupByName.get('Bamburi Cement')?.id,
        intermediaryId: groupByName.get('Bamburi Cement')?.brokerId,
        type: 'MLR_DRIFT',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'Bamburi Cement MLR above pricing target',
        message: 'Trailing claims have exceeded contributions, driven by surgical and injury episodes.',
        metricKey: 'trailing12Mlr',
        metricValue: 1.08,
        thresholdValue: 0.75,
        context: { source: 'analytics-demo', driver: 'surgical spike' },
      },
      {
        tenantId,
        providerId: providerForAlert?.id,
        type: 'PROVIDER_ANOMALY',
        severity: 'WARNING',
        status: 'OPEN',
        title: 'Aga Khan adjusted cost above peer benchmark',
        message: 'Case-mix-adjusted inpatient cost is materially above Avenue-owned facilities.',
        metricKey: 'adjustedCostIndex',
        metricValue: 1.34,
        thresholdValue: 1.15,
        context: { source: 'analytics-demo', peerGroup: 'tertiary inpatient' },
      },
      {
        tenantId,
        groupId: groupByName.get('East African Breweries')?.id,
        type: 'RENEWAL_RISK',
        severity: 'CRITICAL',
        status: 'ACKNOWLEDGED',
        title: 'EABL renewal requires contribution action',
        message: 'Renewal analysis recommends an increase because trailing MLR is above target.',
        metricKey: 'recommendedAdjustmentPct',
        metricValue: 0.18,
        thresholdValue: 0.1,
        context: { source: 'analytics-demo', dueInDays: 61 },
      },
      {
        tenantId,
        groupId: groupByName.get('KCB Group')?.id,
        type: 'UTILIZATION_SPIKE',
        severity: 'WARNING',
        status: 'OPEN',
        title: 'KCB chronic disease utilization rising',
        message: 'Diabetes and hypertension claims are trending upward across the last two quarters.',
        metricKey: 'chronicClaimShare',
        metricValue: 0.42,
        thresholdValue: 0.3,
        context: { source: 'analytics-demo', driver: 'E11/I10' },
      },
      {
        tenantId,
        groupId: groupByName.get('Safaricom PLC')?.id,
        type: 'CONTRIBUTION_SHORTFALL',
        severity: 'INFO',
        status: 'RESOLVED',
        title: 'Safaricom contribution collection restored',
        message: 'Premium collection is current after a temporary delay in the last cycle.',
        metricKey: 'collectionRate',
        metricValue: 1,
        thresholdValue: 0.95,
        context: { source: 'analytics-demo', resolvedBySeed: true },
        resolvedAt: demoAnchor,
      },
    ]})
    }

    const existingAnalytics = await Promise.all([
      prisma.analyticsEncounterFact.count({ where: { tenantId } }),
      prisma.analyticsContributionFact.count({ where: { tenantId } }),
      prisma.analyticsMlrSnapshot.count({ where: { tenantId } }),
      prisma.providerScorecard.count({ where: { tenantId } }),
      prisma.memberRiskProfile.count({ where: { tenantId } }),
      prisma.renewalAnalysis.count({ where: { tenantId } }),
    ])
    const hasDemoAnalytics = existingAnalytics.every((count) => count > 0)

    if (hasDemoAnalytics) {
      console.log(
        `✅ Strategic purchasing analytics demo: existing facts/snapshots reused ` +
        `(${existingAnalytics.join('/')})`
      )
    } else {
      const analyticsResult = await AnalyticsRefreshService.refreshFoundation({ tenantId })
      console.log(
        `✅ Strategic purchasing analytics demo: ${closedMonths.length} months, ` +
        `${analyticsResult.encounterFacts.facts} encounter facts, ` +
        `${analyticsResult.contributionFacts.facts} contribution facts, ` +
        `${analyticsResult.mlrSnapshots.snapshots} MLR snapshots, ` +
        `${analyticsResult.providerScorecards.scorecards} provider scorecards, ` +
        `${analyticsResult.memberRiskProfiles.riskProfiles} member risk profiles, ` +
        `${analyticsResult.renewalAnalyses.renewalAnalyses} renewal analyses, ` +
        `${analyticsResult.analyticsAlerts.alerts} generated alerts`
      )
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 19. MEMBER EXPERIENCE DEMO PORTFOLIO — Phase 9
  // ═══════════════════════════════════════════════════════════
  {
    const demoMembers = await prisma.member.findMany({
      where: { tenantId, status: 'ACTIVE' },
      include: {
        group: true,
        package: { include: { currentVersion: { include: { benefits: true } } } },
        dependents: { where: { status: 'ACTIVE' }, select: { id: true } },
      },
      orderBy: [{ groupId: 'asc' }, { memberNumber: 'asc' }],
      take: 60,
    })

    const demoPhones = ['+254711000101', '+254711000102', '+254711000103', '+254711000104', '+254711000105']
    for (let i = 0; i < Math.min(50, demoMembers.length); i++) {
      await prisma.member.update({
        where: { id: demoMembers[i].id },
        data: { phone: `+2547111${String(i + 1).padStart(5, '0')}` },
      })
    }

    const personaDefs = [
      { email: 'member.demo.low@avenue.co.ke', index: 1, label: 'Low use family' },
      { email: 'member.demo.nearcap@avenue.co.ke', index: 2, label: 'Near cap outpatient' },
      { email: 'member.demo.family@avenue.co.ke', index: 3, label: 'Family privacy demo' },
      { email: 'member.demo.wallet@avenue.co.ke', index: 4, label: 'Wallet payment demo' },
      { email: 'member.demo.preauth@avenue.co.ke', index: 5, label: 'Preauth decision demo' },
    ]
    for (const persona of personaDefs) {
      const member = demoMembers[persona.index]
      if (!member) continue
      await prisma.member.update({ where: { id: member.id }, data: { phone: demoPhones[persona.index] } })
      await prisma.user.upsert({
        where: { tenantId_email: { tenantId, email: persona.email } },
        update: {
          passwordHash: pw,
          isActive: true,
          role: 'MEMBER_USER',
          memberId: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
        },
        create: {
          tenantId,
          email: persona.email,
          passwordHash: pw,
          firstName: member.firstName,
          lastName: member.lastName,
          role: 'MEMBER_USER',
          isActive: true,
          memberId: member.id,
        },
      })
    }

    const memberBenefitPeriod = (enrollmentDate: Date) => {
      const now = new Date()
      const enrolled = new Date(enrollmentDate)
      let periodStart = new Date(now.getFullYear(), enrolled.getMonth(), enrolled.getDate())
      if (periodStart > now) periodStart = new Date(now.getFullYear() - 1, enrolled.getMonth(), enrolled.getDate())
      const periodEnd = new Date(periodStart.getFullYear() + 1, enrolled.getMonth(), enrolled.getDate())
      return { periodStart, periodEnd }
    }
    const usageProfiles = [
      { pct: 0.08, claims: 1 },
      { pct: 0.28, claims: 3 },
      { pct: 0.54, claims: 6 },
      { pct: 0.82, claims: 9 },
      { pct: 0.96, claims: 12 },
      { pct: 1.04, claims: 14 },
    ]
    let usageUpserts = 0
    for (let i = 0; i < Math.min(50, demoMembers.length); i++) {
      const member = demoMembers[i]
      const benefits = member.package.currentVersion?.benefits ?? []
      const profile = usageProfiles[i % usageProfiles.length]
      const benefit = benefits.find(b => b.category === (i % 5 === 0 ? 'INPATIENT' : 'OUTPATIENT')) ?? benefits[0]
      if (!benefit) continue
      const limit = Number(benefit.annualSubLimit)
      const { periodStart, periodEnd } = memberBenefitPeriod(member.enrollmentDate)
      await prisma.benefitUsage.upsert({
        where: { memberId_benefitConfigId_periodStart: { memberId: member.id, benefitConfigId: benefit.id, periodStart } },
        update: {
          periodEnd,
          amountUsed: Math.round(limit * profile.pct),
          claimCount: profile.claims,
          lastUpdated: new Date(),
        },
        create: {
          memberId: member.id,
          benefitConfigId: benefit.id,
          periodStart,
          periodEnd,
          amountUsed: Math.round(limit * profile.pct),
          claimCount: profile.claims,
        },
      })
      usageUpserts += 1
    }

    const claimScenarios = [
      { icd: 'J06.9', label: 'Acute upper respiratory infection', serviceType: 'OUTPATIENT' as const, benefitCategory: 'OUTPATIENT' as const, base: 6800, status: 'PAID' as const },
      { icd: 'E11.9', label: 'Type 2 diabetes review', serviceType: 'OUTPATIENT' as const, benefitCategory: 'CHRONIC_DISEASE' as const, base: 14500, status: 'APPROVED' as const },
      { icd: 'A09', label: 'Gastroenteritis', serviceType: 'OUTPATIENT' as const, benefitCategory: 'OUTPATIENT' as const, base: 9200, status: 'PAID' as const },
      { icd: 'J18.9', label: 'Pneumonia admission', serviceType: 'INPATIENT' as const, benefitCategory: 'INPATIENT' as const, base: 78000, status: 'APPROVED' as const },
      { icd: 'F41.9', label: 'Anxiety counselling', serviceType: 'OUTPATIENT' as const, benefitCategory: 'MENTAL_HEALTH' as const, base: 12000, status: 'APPROVED' as const },
      { icd: 'O80', label: 'Maternity consultation', serviceType: 'OUTPATIENT' as const, benefitCategory: 'MATERNITY' as const, base: 18500, status: 'APPROVED' as const },
    ]
    const monthOffsets = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    const createdClaims: { id: string; claimNumber: string; memberId: string; billedAmount: number; approvedAmount: number }[] = []
    for (let i = 0; i < Math.min(36, demoMembers.length); i++) {
      const member = demoMembers[i]
      let scenario = claimScenarios[i % claimScenarios.length]
      const age = Math.floor((Date.now() - member.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      if (scenario.benefitCategory === 'MATERNITY' && (member.gender !== 'FEMALE' || age < 18 || age > 49)) {
        scenario = claimScenarios[(i + 1) % 4]
      }
      const claimNumber = `CLM-MEXP-${String(i + 1).padStart(3, '0')}`
      const existing = await prisma.claim.findUnique({ where: { tenantId_claimNumber: { tenantId, claimNumber } } })
      if (existing) {
        createdClaims.push({ id: existing.id, claimNumber, memberId: existing.memberId, billedAmount: Number(existing.billedAmount), approvedAmount: Number(existing.approvedAmount) })
        continue
      }
      const serviceDate = new Date(2025, 3 - monthOffsets[i % monthOffsets.length], Math.min(26, 5 + (i % 20)))
      const billedAmount = Math.round(scenario.base * (0.88 + (i % 5) * 0.09))
      const approvedAmount = Math.round(billedAmount * (scenario.benefitCategory === 'OUTPATIENT' ? 0.9 : 0.94))
      const claim = await prisma.claim.create({ data: {
        tenantId,
        claimNumber,
        invoiceNumber: `MEXP-INV-${String(i + 1).padStart(3, '0')}`,
        memberId: member.id,
        providerId: providers[i % providers.length],
        serviceType: scenario.serviceType,
        benefitCategory: scenario.benefitCategory,
        dateOfService: serviceDate,
        receivedAt: serviceDate,
        decidedAt: new Date(serviceDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        paidAt: scenario.status === 'PAID' ? new Date(serviceDate.getTime() + 10 * 24 * 60 * 60 * 1000) : null,
        diagnoses: [{ icdCode: scenario.icd, description: scenario.label, isPrimary: true }],
        procedures: [],
        billedAmount,
        approvedAmount,
        paidAmount: scenario.status === 'PAID' ? approvedAmount : 0,
        memberLiability: billedAmount - approvedAmount,
        status: scenario.status,
        claimLines: { create: [
          {
            lineNumber: 1,
            serviceCategory: scenario.serviceType === 'INPATIENT' ? 'PROCEDURE' : 'CONSULTATION',
            description: `${scenario.label} clinical review`,
            icdCode: scenario.icd,
            quantity: 1,
            unitCost: Math.round(billedAmount * 0.55),
            billedAmount: Math.round(billedAmount * 0.55),
            approvedAmount: Math.round(approvedAmount * 0.55),
          },
          {
            lineNumber: 2,
            serviceCategory: scenario.benefitCategory === 'CHRONIC_DISEASE' ? 'PHARMACY' : 'LABORATORY',
            description: scenario.benefitCategory === 'CHRONIC_DISEASE' ? 'Medication refill and consumables' : 'Diagnostics and consumables',
            icdCode: scenario.icd,
            quantity: 1,
            unitCost: billedAmount - Math.round(billedAmount * 0.55),
            billedAmount: billedAmount - Math.round(billedAmount * 0.55),
            approvedAmount: approvedAmount - Math.round(approvedAmount * 0.55),
          },
        ]},
      }})
      createdClaims.push({ id: claim.id, claimNumber, memberId: member.id, billedAmount, approvedAmount })
    }

    const invalidMaternityClaims = await prisma.claim.findMany({
      where: {
        tenantId,
        benefitCategory: 'MATERNITY',
        member: { OR: [{ gender: { not: 'FEMALE' } }, { relationship: 'CHILD' }] },
      },
      include: { member: { select: { id: true, groupId: true } } },
    })
    for (const claim of invalidMaternityClaims) {
      const replacement = await prisma.member.findFirst({
        where: {
          tenantId,
          groupId: claim.member.groupId,
          status: 'ACTIVE',
          gender: 'FEMALE',
          relationship: { in: ['PRINCIPAL', 'SPOUSE'] },
          dateOfBirth: { gte: new Date('1976-01-01'), lte: new Date('2007-12-31') },
        },
        orderBy: [{ relationship: 'asc' }, { memberNumber: 'asc' }],
        select: { id: true },
      })
      if (replacement) {
        await prisma.claim.update({
          where: { id: claim.id },
          data: { memberId: replacement.id },
        })
      }
    }

    const walletClaims = createdClaims.slice(0, 6)
    for (let i = 0; i < walletClaims.length; i++) {
      const claim = walletClaims[i]
      const existingTx = await prisma.coContributionTransaction.findUnique({ where: { claimId: claim.id } })
      const amount = [1250, 2400, 3600, 1800, 5200, 900][i] ?? 1500
      const status = i === 1 ? 'COLLECTED' : i === 2 ? 'PARTIAL' : i === 5 ? 'DEFERRED' : 'PENDING'
      const tx = existingTx ?? await prisma.coContributionTransaction.create({ data: {
        tenantId,
        claimId: claim.id,
        memberId: claim.memberId,
        serviceCost: claim.billedAmount,
        calculatedAmount: amount,
        cappedAmount: amount,
        finalAmount: amount,
        planShare: Math.max(0, claim.billedAmount - amount),
        annualCapApplied: false,
        capsApplied: [],
        collectionStatus: status as never,
        amountCollected: status === 'COLLECTED' ? amount : status === 'PARTIAL' ? Math.round(amount / 2) : 0,
        paymentMethod: status === 'COLLECTED' ? 'MPESA' : null,
        mpesaTransactionRef: status === 'COLLECTED' ? `MEXPMPESA${i + 1}` : null,
        mpesaPhoneNumber: demoPhones[i % demoPhones.length],
        receiptNumber: status === 'COLLECTED' ? `RCPT-MEXP-${i + 1}` : null,
        collectedAt: status === 'COLLECTED' ? new Date('2025-03-15') : null,
      }})

      const paymentStates = [
        { status: 'PENDING_CALLBACK', receipt: null, resultCode: null, desc: 'Sandbox STK prompt sent' },
        { status: 'CONFIRMED', receipt: 'RKT900001', resultCode: '0', desc: 'The service request is processed successfully.' },
        { status: 'FAILED', receipt: null, resultCode: '1', desc: 'Insufficient funds' },
        { status: 'TIMED_OUT', receipt: null, resultCode: 'TIMEOUT', desc: 'No callback received before checkout expiry' },
      ] as const
      const state = paymentStates[i % paymentStates.length]
      const checkoutRequestId = `AICARE-MEXP-${String(i + 1).padStart(3, '0')}`
      const existingPayment = await prisma.memberCoContributionPayment.findUnique({ where: { checkoutRequestId } })
      if (!existingPayment) {
        await prisma.memberCoContributionPayment.create({ data: {
          tenantId,
          memberId: claim.memberId,
          coContributionTransactionId: tx.id,
          amount,
          phoneNumber: demoPhones[i % demoPhones.length],
          status: state.status,
          idempotencyKey: `mexp-${i + 1}`,
          checkoutRequestId,
          merchantRequestId: `MR-MEXP-${String(i + 1).padStart(3, '0')}`,
          mpesaReceipt: state.receipt,
          resultCode: state.resultCode,
          resultDescription: state.desc,
          requestedAt: new Date('2025-03-10'),
          confirmedAt: state.status === 'CONFIRMED' ? new Date('2025-03-10T10:15:00') : null,
          failedAt: state.status === 'FAILED' || state.status === 'TIMED_OUT' ? new Date('2025-03-10T10:20:00') : null,
          expiresAt: new Date('2025-03-10T10:20:00'),
        }})
      }
    }

    const preauthSeeds = [
      { num: 'PA-MEXP-001', member: demoMembers[4], cpt: '99213', label: 'General consultation', cat: 'OUTPATIENT' as const, service: 'OUTPATIENT' as const, cost: 2500, status: 'APPROVED' as const, approved: 2500, notes: 'Auto-approved low-risk outpatient consultation.' },
      { num: 'PA-MEXP-002', member: demoMembers[5], cpt: '76700', label: 'Ultrasound abdomen', cat: 'OUTPATIENT' as const, service: 'OUTPATIENT' as const, cost: 6000, status: 'UNDER_REVIEW' as const, approved: null, notes: 'Routed for review due to clinical notes requiring validation.' },
      { num: 'PA-MEXP-003', member: demoMembers[6], cpt: '44950', label: 'Appendectomy', cat: 'SURGICAL' as const, service: 'INPATIENT' as const, cost: 145000, status: 'UNDER_REVIEW' as const, approved: null, notes: 'High-value surgical request awaiting medical officer review.' },
      { num: 'PA-MEXP-004', member: demoMembers[7], cpt: '92004', label: 'Eye examination', cat: 'OPTICAL' as const, service: 'OUTPATIENT' as const, cost: 16000, status: 'DECLINED' as const, approved: 0, notes: 'Optical benefit exhausted for the period.' },
    ]
    for (const item of preauthSeeds) {
      if (!item.member) continue
      const existing = await prisma.preAuthorization.findUnique({ where: { tenantId_preauthNumber: { tenantId, preauthNumber: item.num } } })
      if (existing) continue
      await prisma.preAuthorization.create({ data: {
        tenantId,
        preauthNumber: item.num,
        memberId: item.member.id,
        providerId: providers[0],
        serviceType: item.service,
        benefitCategory: item.cat,
        submittedBy: 'MEMBER',
        expectedDateOfService: new Date('2025-04-20'),
        diagnoses: [{ icdCode: 'Z00', description: item.label, isPrimary: true }],
        procedures: [{ cptCode: item.cpt, description: item.label, quantity: 1, unitCost: item.cost, total: item.cost }],
        estimatedCost: item.cost,
        approvedAmount: item.approved,
        clinicalNotes: item.notes,
        status: item.status,
        approvedBy: item.status === 'APPROVED' ? 'AUTO' : null,
        approvedAt: item.status === 'APPROVED' ? new Date('2025-04-05') : null,
        validFrom: item.status === 'APPROVED' ? new Date('2025-04-05') : null,
        validUntil: item.status === 'APPROVED' ? new Date('2025-04-19') : null,
        declineReasonCode: item.status === 'DECLINED' ? 'BENEFIT_EXHAUSTED' : null,
        declineNotes: item.status === 'DECLINED' ? 'The selected benefit does not have remaining balance for this request.' : null,
      }})
    }

    const docsToEnsure: Array<{
      fileName: string
      category: string
      url: string
      groupId?: string
      claimNumber?: string
      preauthNumber?: string
    }> = [
      { fileName: 'Avenue_Member_Benefit_Guide_2025.pdf', category: 'BENEFIT_GUIDE', groupId: safaricom.id, url: '/seed-docs/Avenue_Member_Benefit_Guide_2025.pdf' },
      { fileName: 'Safaricom_Benefit_Schedule_2025.pdf', category: 'BENEFIT_SCHEDULE', groupId: safaricom.id, url: '/seed-docs/Safaricom_Benefit_Schedule_2025.pdf' },
      { fileName: 'PA-MEXP-001_Approval_Letter.pdf', category: 'PREAUTH_APPROVAL', preauthNumber: 'PA-MEXP-001', url: '/seed-docs/PA-MEXP-001_Approval_Letter.pdf' },
      { fileName: 'CLM-MEXP-001_Claim_Support.pdf', category: 'CLAIM_SUPPORT', claimNumber: 'CLM-MEXP-001', url: '/seed-docs/CLM-MEXP-001_Claim_Support.pdf' },
    ]
    for (const doc of docsToEnsure) {
      const exists = await prisma.document.findFirst({ where: { fileName: doc.fileName } })
      if (exists) continue
      const claim = doc.claimNumber ? await prisma.claim.findUnique({ where: { tenantId_claimNumber: { tenantId, claimNumber: doc.claimNumber } }, select: { id: true } }) : null
      const preauth = doc.preauthNumber ? await prisma.preAuthorization.findUnique({ where: { tenantId_preauthNumber: { tenantId, preauthNumber: doc.preauthNumber } }, select: { id: true } }) : null
      await prisma.document.create({ data: {
        fileName: doc.fileName,
        fileUrl: doc.url,
        fileSize: 180000,
        mimeType: 'application/pdf',
        category: doc.category,
        uploadedBy: users['CUSTOMER_SERVICE'],
        groupId: doc.groupId ?? null,
        claimId: claim?.id,
        preauthId: preauth?.id,
      }})
    }

    const notificationSeeds = [
      { member: demoMembers[0], type: 'BENEFIT_ALERT' as const, title: 'You are on track', body: 'Your outpatient benefit usage is comfortably within the expected range.', href: '/member/benefits', priority: 'LOW' as const },
      { member: demoMembers[1], type: 'BENEFIT_ALERT' as const, title: 'Outpatient benefit near cap', body: 'You have used more than 90% of one benefit category this year.', href: '/member/benefits', priority: 'HIGH' as const },
      { member: demoMembers[2], type: 'CLAIM_STATUS' as const, title: 'Care event recorded', body: 'A recent outpatient visit has been added to your care history.', href: '/member/utilization', priority: 'NORMAL' as const },
      { member: demoMembers[3], type: 'PAYMENT_STATUS' as const, title: 'M-Pesa payment confirmed', body: 'Your wallet payment has been confirmed and matched to your member share.', href: '/member/wallet', priority: 'HIGH' as const },
      { member: demoMembers[4], type: 'PREAUTH_STATUS' as const, title: 'Pre-authorization approved', body: 'Your consultation pre-authorization was approved instantly.', href: '/member/preauth', priority: 'HIGH' as const },
      { member: demoMembers[0], type: 'RENEWAL_REMINDER' as const, title: 'Scheme renewal coming up', body: 'Your employer scheme renewal date is approaching.', href: '/member/dashboard', priority: 'NORMAL' as const },
      { member: demoMembers[0], type: 'DOCUMENT_AVAILABLE' as const, title: 'Benefit guide available', body: 'Your 2025 member benefit guide is available in Documents.', href: '/member/documents', priority: 'NORMAL' as const },
    ]
    for (const note of notificationSeeds) {
      if (!note.member) continue
      const exists = await prisma.memberNotification.findFirst({ where: { tenantId, memberId: note.member.id, title: note.title } })
      if (exists) continue
      await prisma.memberNotification.create({ data: {
        tenantId,
        memberId: note.member.id,
        type: note.type,
        priority: note.priority,
        title: note.title,
        body: note.body,
        href: note.href,
        metadata: { source: 'member-experience-demo' },
      }})
    }

    const healthFileSeeds = [
      { member: demoMembers[0], title: 'March full blood count', category: 'LAB_RESULT' as const, fileName: 'Wanjiru_Kamau_FBC_Mar_2026.pdf', fileUrl: '/seed-docs/Wanjiru_Kamau_FBC_Mar_2026.pdf', capturedAt: new Date('2026-03-18'), notes: 'Uploaded before annual wellness review.' },
      { member: demoMembers[0], title: 'Hypertension prescription refill', category: 'PRESCRIPTION' as const, fileName: 'Wanjiru_Kamau_Prescription_Apr_2026.jpg', fileUrl: '/seed-docs/Wanjiru_Kamau_Prescription_Apr_2026.jpg', capturedAt: new Date('2026-04-12'), notes: 'Current medication list for next consultation.' },
      { member: demoMembers[1], title: 'Chest X-ray report', category: 'RADIOLOGY' as const, fileName: 'Member_Radiology_Report_2026.pdf', fileUrl: '/seed-docs/Member_Radiology_Report_2026.pdf', capturedAt: new Date('2026-02-22'), notes: 'Follow-up imaging after respiratory symptoms.' },
      { member: demoMembers[4], title: 'Consultation referral note', category: 'REFERRAL' as const, fileName: 'PA_MEXP_Referral_Note.pdf', fileUrl: '/seed-docs/PA_MEXP_Referral_Note.pdf', capturedAt: new Date('2026-04-02'), notes: 'Shared with the pre-authorization reviewer for context.' },
    ]
    for (const item of healthFileSeeds) {
      if (!item.member) continue
      const exists = await prisma.memberHealthFile.findFirst({ where: { tenantId, memberId: item.member.id, title: item.title } })
      if (exists) continue
      await prisma.memberHealthFile.create({ data: {
        tenantId,
        memberId: item.member.id,
        uploadedByUserId: users['CUSTOMER_SERVICE'],
        title: item.title,
        category: item.category,
        fileName: item.fileName,
        fileUrl: item.fileUrl,
        fileSize: 220000,
        mimeType: item.fileName.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf',
        capturedAt: item.capturedAt,
        notes: item.notes,
      }})
    }

    const vitalSeeds = [
      { member: demoMembers[0], recordedAt: new Date('2026-04-25T08:10:00'), systolicBp: 128, diastolicBp: 82, heartRate: 76, temperatureC: 36.7, oxygenSaturation: 98, weightKg: 72.4, notes: 'Morning reading before medication.' },
      { member: demoMembers[0], recordedAt: new Date('2026-04-28T20:30:00'), systolicBp: 134, diastolicBp: 86, heartRate: 81, temperatureC: 36.9, oxygenSaturation: 97, weightKg: 72.1, notes: 'Felt light headache after work.' },
      { member: demoMembers[1], recordedAt: new Date('2026-04-27T07:45:00'), systolicBp: 118, diastolicBp: 76, heartRate: 69, temperatureC: 36.5, oxygenSaturation: 99, weightKg: 68.2, notes: 'Routine wellness check.' },
    ]
    for (const item of vitalSeeds) {
      if (!item.member) continue
      const exists = await prisma.memberVitalEntry.findFirst({ where: { tenantId, memberId: item.member.id, recordedAt: item.recordedAt } })
      if (exists) continue
      await prisma.memberVitalEntry.create({ data: {
        tenantId,
        memberId: item.member.id,
        recordedByUserId: users['CUSTOMER_SERVICE'],
        recordedAt: item.recordedAt,
        systolicBp: item.systolicBp,
        diastolicBp: item.diastolicBp,
        heartRate: item.heartRate,
        temperatureC: item.temperatureC,
        oxygenSaturation: item.oxygenSaturation,
        weightKg: item.weightKg,
        notes: item.notes,
      }})
    }

    const journalSeeds = [
      { member: demoMembers[0], entryType: 'SYMPTOM' as const, recordedAt: new Date('2026-04-28T21:00:00'), noteText: 'Mild headache in the evening. No fever. BP was slightly higher than usual.', tags: ['headache', 'blood pressure'] },
      { member: demoMembers[0], entryType: 'QUESTION' as const, recordedAt: new Date('2026-04-29T09:15:00'), noteText: 'Ask doctor whether I should adjust timing of evening medication.', tags: ['doctor question', 'medication'] },
      { member: demoMembers[1], entryType: 'NOTE' as const, recordedAt: new Date('2026-04-26T10:20:00'), noteText: 'Completed lab tests and uploaded report before review appointment.', tags: ['labs'] },
    ]
    for (const item of journalSeeds) {
      if (!item.member) continue
      const exists = await prisma.memberHealthJournalEntry.findFirst({ where: { tenantId, memberId: item.member.id, noteText: item.noteText } })
      if (exists) continue
      await prisma.memberHealthJournalEntry.create({ data: {
        tenantId,
        memberId: item.member.id,
        authorUserId: users['CUSTOMER_SERVICE'],
        entryType: item.entryType,
        noteText: item.noteText,
        tags: item.tags,
        recordedAt: item.recordedAt,
      }})
    }

    const preauthShareTarget = await prisma.preAuthorization.findUnique({
      where: { tenantId_preauthNumber: { tenantId, preauthNumber: 'PA-MEXP-001' } },
      select: { id: true, memberId: true },
    })
    const sharedFile = preauthShareTarget ? await prisma.memberHealthFile.findFirst({
      where: { tenantId, memberId: preauthShareTarget.memberId, title: 'Consultation referral note' },
      select: { id: true },
    }) : null
    if (preauthShareTarget && sharedFile) {
      const exists = await prisma.memberHealthShare.findFirst({
        where: { tenantId, memberId: preauthShareTarget.memberId, preauthId: preauthShareTarget.id, healthFileId: sharedFile.id, revokedAt: null },
      })
      if (!exists) {
        await prisma.memberHealthShare.create({ data: {
          tenantId,
          memberId: preauthShareTarget.memberId,
          sharedByUserId: users['CUSTOMER_SERVICE'],
          preauthId: preauthShareTarget.id,
          healthFileId: sharedFile.id,
        }})
      }
    }

    console.log(`✅ Member experience demo: ${demoMembers.length} lives available, ${usageUpserts} benefit usages, ${createdClaims.length} claims, ${walletClaims.length} wallet items, ${personaDefs.length} member logins`)
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
  console.log('  • Self-funded scheme 1: EABL — KES 32M deposit, real claim deductions by claimId, admin fee')
  console.log('  • Self-funded scheme 2: Bamburi Cement — KES 3.8M balance below KES 5M minimum (low-balance demo)')
  console.log('  • Fund admin: fund@avenue.co.ke / AvenueAdmin2024! — linked to all self-funded schemes')
  console.log('  • Member: member@avenue.co.ke / AvenueAdmin2024! — linked to an active member')
  console.log('  • Member demo logins: member.demo.low@avenue.co.ke, member.demo.nearcap@avenue.co.ke, member.demo.family@avenue.co.ke, member.demo.wallet@avenue.co.ke, member.demo.preauth@avenue.co.ke / AvenueAdmin2024!')
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
  console.log('')
  console.log('  Member Experience Demo:')
  console.log('  • 50 member benefit-usage profiles across low, moderate, high, near-cap, and cap-reached states')
  console.log('  • 36 recent care-history claims across the trailing 12 months')
  console.log('  • Pre-auth scenarios: auto-approved, human-review, surgical review, declined/exhausted')
  console.log('  • Wallet scenarios: pending callback, confirmed, failed, timed out, partial/deferred')
  console.log('  • Documents and notifications visible in the member portal')
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
