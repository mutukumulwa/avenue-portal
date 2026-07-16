import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..");

const TARGET_TOTAL = 2750;
const GENERATED_TARGET = {
  HOSPITAL: 205,
  CLINIC: 1110,
  PHARMACY: 620,
  LABORATORY: 360,
  DENTAL: 145,
  OPTICAL: 140,
  REHABILITATION: 95,
};

const seedCsv = `Facility Name,Location,Medical Chain Role,Large Institution Flag,Extra Metrics (Ownership / Insurance)
Mulago National Referral Hospital,Kampala,National Referral Hospital,Yes,Government / Major Insurances
Mulago Specialised Women & Neonatal Hospital,Kampala,National Referral Hospital,Yes,Government / Major Insurances
Kawempe National Referral Hospital,Kampala,National Referral Hospital,Yes,Government
Kiruddu National Referral Hospital,Kampala,National Referral Hospital,Yes,Government
Uganda Heart Institute,"Mulago, Kampala",Specialized Tertiary,Yes,Government / Major Insurances
Uganda Cancer Institute,"Mulago, Kampala",Specialized Tertiary,Yes,Government / Major Insurances
Yumbe Regional Referral Hospital,Yumbe,Regional Referral Hospital,Yes,Government
Nakasero Hospital,Kampala,General Hospital,Yes,"PFP / AAR, Jubilee, Prudential, Sanlam"
International Hospital Kampala (IHK),"Namuwongo, Kampala",General Hospital,Yes,"PFP / AAR, Jubilee, Prudential, UAP, Liberty, Sanlam"
Medipal International Hospital,"Kololo, Kampala",General Hospital,Yes,"PFP / AAR, Jubilee, Prudential"
Kampala Hospital,"Kololo, Kampala",General Hospital,Yes,"PFP / AAR, Jubilee, Prudential, Sanlam"
Case Hospital,"Buganda Road, Kampala",General Hospital,Yes,"PFP / AAR, Jubilee, Prudential, Sanlam"
Lubaga Hospital,"Lubaga, Kampala",General Hospital,Yes,"PNFP / Sanlam, AAR, Jubilee, Prudential, UAP"
Mengo Hospital,"Mengo, Kampala",General Hospital,Yes,"PNFP / AAR, Jubilee, Prudential, UAP, Sanlam"
St. Francis Hospital Nsambya,"Nsambya, Kampala",General Hospital,Yes,"PNFP / Sanlam, Jubilee, Prudential, UAP"
Kibuli Hospital,Kampala,General Hospital,Yes,"PNFP / Sanlam, AAR, Jubilee, Prudential"
Aga Khan University Hospital,Kampala Road / Acacia,General Hospital,Yes,"PFP / Jubilee, Prudential, UAP, Sanlam"
UMC Victoria Hospital,"Bukoto / Kira Road, Kampala",General Hospital,Yes,"PFP / Jubilee, Prudential"
Ruby Medical Center,"Lugogo Bypass, Kampala",General Hospital,Yes,PFP / Jubilee
TMR International Hospital,"Naalya, Kampala",General Hospital,Yes,"PFP / Jubilee, UAP"
Bethany Women's and Children's Hospital,Entebbe / Luzira,Specialized Hospital,Yes,PFP / AAR
CORSU Rehabilitation Hospital,Kampala,Specialized Orthopaedics,Yes,PNFP / Sanlam
Nkozi Hospital,"Nkozi Subcounty, Mpigi",General Hospital,Yes,PNFP / UAP
St. Francis Naggalama Hospital,Mukono,General Hospital,Yes,PNFP / UAP
Norvik Hospital,"Bombo Road, Kampala",General Hospital,Yes,"PFP / Jubilee, Prudential, Sanlam"
Platinum Specialist Hospital,"Buganda Road, Kampala",General Hospital,No,"PFP / Jubilee, Prudential"
Najjera Hospital,"Najjera, Kampala",General Hospital,No,"PFP / Jubilee, Prudential"
Anbar Hospital,Mubende,General Hospital,No,PFP / UAP
True Vine Hospital,Mubende,General Hospital,No,PFP / UAP
Bishop Caesar Asili Memorial Hospital,Luwero,General Hospital,No,PNFP / UAP
Al-Shafa Hospital,Jinja,General Hospital,No,PFP / Sanlam
Almecca Hospital,Jinja,General Hospital,No,PFP / Sanlam
Bugolobi Medical Centre,"Bugolobi, Kampala",HC III / Clinic,No,"PFP / AAR, Jubilee, Prudential, Sanlam"
St. Catherines Hospital,"Buganda Road, Kampala",HC III / Clinic,No,"PFP / AAR, UAP"
Lifelink Medical Centre,Ntinda / Kyaliwajala,HC III / Clinic,No,"PFP / Jubilee, Prudential, Sanlam"
Healingway Hospital,"Bugolobi, Kampala",HC III / Clinic,No,PFP / AAR
SAS Clinic (Savannah Sunrise),"Bombo Road, Kampala",HC III / Clinic,No,"PFP / Jubilee, Prudential, Sanlam"
AAR Health Care Buganda Road,"Buganda Road, Kampala",Clinic (Outpatient),No,"PFP / AAR, Prudential, Sanlam"
AAR Health Care Bugolobi,"Bugolobi, Kampala",Clinic (Outpatient),No,"PFP / AAR, Prudential, Jubilee, Sanlam"
AAR Health Care Ntinda,"Ntinda, Kampala",Clinic (Outpatient),No,"PFP / AAR, Prudential, Jubilee"
AAR Health Care Entebbe,Entebbe,Clinic (Outpatient),No,"PFP / AAR, Prudential, Jubilee"
Rocket Health Clinic (Telemedicine),"Lumumba Avenue, Kampala",Clinic (Outpatient),No,PFP / Prudential
Kampala Medical Chambers,"Buganda Road, Kampala",Clinic (Outpatient),No,"PFP / AAR, Prudential"
The Medical Hub (Roswell),"Nakasero, Kampala",Clinic (Outpatient),No,PFP / Jubilee
International Medical Centre (IMC) Kololo,"Kololo, Kampala",Clinic (Outpatient),No,"PFP / Prudential, Sanlam"
International Medical Centre (IMC) Jinja,Jinja,Clinic (Outpatient),No,PFP / Sanlam
City Medicals,"Acacia Avenue, Kololo",Clinic (Outpatient),No,PFP / Prudential
Ssebbi Medical Centre,Nansana,Clinic (Outpatient),No,"PFP / UAP, Sanlam"
Agape Medical Centre,"Kasangati, Wakiso",Clinic (Outpatient),No,"PFP / Prudential, Sanlam"
Sameday Clinic,"Katabi, Entebbe",Clinic (Outpatient),No,PFP / AAR
St Louise Medical Centre,"Kitoro, Entebbe",Clinic (Outpatient),No,PFP / AAR
Emmanuel Medical Centre,"Katabi, Entebbe",Clinic (Outpatient),No,"PFP / AAR, Sanlam"
Safe Places Uganda,"Kyambogo, Kampala",Rehabilitation / Counselling,No,PFP / AAR
Ecopharm Pharmacy Mulago,"Mulago, Kampala",Pharmacy,No,"PFP / Sanlam, UAP"
Ecopharm Pharmacy Bugolobi,"Bugolobi, Kampala",Pharmacy,No,"PFP / Sanlam, UAP"
Ecopharm Pharmacy Ntinda,"Ntinda, Kampala",Pharmacy,No,"PFP / Sanlam, UAP"
Ecopharm Pharmacy Kiruddu,"Kiruddu, Kampala",Pharmacy,No,PFP / Sanlam
C&A Pharmaceuticals Kabalagala,"Kabalagala, Kampala",Pharmacy,No,"PFP / UAP, Sanlam"
Friecca Pharmacy,"Wandegeya, Kampala",Pharmacy,No,"PFP / UAP, Sanlam"
Goodlife Pharmacy Acacia,"Acacia Mall, Kampala",Pharmacy,No,PFP / Sanlam
Epiphania Pharmacy,Kampala,Pharmacy,No,PFP / Sanlam
Kampala Capital Imaging Centre,"Gadaffi Road, Kampala",Imaging / Radiology,No,PFP / Prudential
Ernest Cook Ultrasound (ECUREI),"Mengo Hospital, Kampala",Imaging / Radiology,No,PNFP / Sanlam
Kampala MRI Center,"Sir Albert Cook Road, Mengo",Imaging / Radiology,No,PFP / Prudential
Dr. Agarwal Eye Hospital,"Lumumba Avenue, Kampala",Ophthalmology,No,PFP / Sanlam
Georgina Clinic,"Kira Road, Kampala",Ophthalmology,No,PFP / Sanlam
City Optics,Garden City / Zebra Building,Optometry / Optical,No,PFP / Sanlam
Lens & Frames,"Wilson Road, Kampala",Optometry / Optical,No,PFP / Sanlam
Millennium Optics,Entebbe,Optometry / Optical,No,PFP / Jubilee
Kampala Audiology & Speech Centre,"Bombo Road, Kampala",Specialty (Audiology),No,PFP / AAR
Pan Dental Surgery,Kampala,Specialty (Dental),No,PFP / Sanlam
Jubilee Dental,"Kololo, Kampala",Specialty (Dental),No,PFP / Sanlam
Kololo Dental Place,"Kololo, Kampala",Specialty (Dental),No,PFP / Sanlam
Alfa Dental,"Ggaba Road, Kampala",Specialty (Dental),No,PFP / Sanlam
Kays Dental Clinic,"Kamwokya, Kampala",Specialty (Dental),No,PFP / Sanlam
Wellington Diabetes and Heart Centre,"Yusuf Lule Road, Kampala",Specialty (Chronic Care),No,PFP / UAP
Ultima Trauma Orthopedic Centre,"Lumumba Avenue, Kampala",Specialty (Orthopaedics),No,"PFP / UAP, Sanlam"`;

const districtCenters = [
  ["Central", "Kampala", 0.3476, 32.5825, 11], ["Central", "Wakiso", 0.3980, 32.4780, 9],
  ["Central", "Mukono", 0.3533, 32.7553, 5], ["Central", "Mpigi", 0.2250, 32.3136, 3],
  ["Central", "Luwero", 0.8492, 32.4731, 3], ["Central", "Masaka", -0.3338, 31.7341, 4],
  ["Central", "Mityana", 0.4175, 32.0228, 3], ["Central", "Mubende", 0.5585, 31.3949, 3],
  ["Central", "Nakasongola", 1.3089, 32.4564, 2], ["Central", "Rakai", -0.7207, 31.4839, 2],
  ["Central", "Kalangala", -0.3089, 32.2250, 1], ["Central", "Buikwe", 0.3375, 33.0106, 3],
  ["Central", "Kayunga", 0.7025, 32.8886, 2], ["Central", "Kiboga", 0.9161, 31.7742, 2],
  ["Central", "Kyankwanzi", 1.1987, 31.8000, 2], ["Central", "Lyantonde", -0.4031, 31.1575, 2],
  ["Central", "Nakaseke", 1.0417, 32.0381, 2], ["Central", "Sembabule", -0.0772, 31.4567, 2],
  ["Eastern", "Jinja", 0.4244, 33.2042, 5], ["Eastern", "Mbale", 1.0644, 34.1794, 5],
  ["Eastern", "Soroti", 1.7146, 33.6111, 4], ["Eastern", "Tororo", 0.6928, 34.1808, 4],
  ["Eastern", "Iganga", 0.6092, 33.4686, 3], ["Eastern", "Busia", 0.4659, 34.0922, 3],
  ["Eastern", "Pallisa", 1.1450, 33.7094, 2], ["Eastern", "Kamuli", 0.9472, 33.1197, 3],
  ["Eastern", "Kumi", 1.4608, 33.9361, 2], ["Eastern", "Kapchorwa", 1.4000, 34.4500, 2],
  ["Eastern", "Budaka", 1.0167, 33.9450, 2], ["Eastern", "Bugiri", 0.5714, 33.7417, 2],
  ["Eastern", "Bukedea", 1.3169, 34.0506, 2], ["Eastern", "Mayuge", 0.4575, 33.4808, 2],
  ["Eastern", "Namayingo", 0.2398, 33.8849, 1], ["Eastern", "Sironko", 1.2306, 34.2497, 2],
  ["Northern", "Gulu", 2.7724, 32.2881, 5], ["Northern", "Lira", 2.2499, 32.8999, 4],
  ["Northern", "Arua", 3.0201, 30.9111, 4], ["Northern", "Kitgum", 3.2783, 32.8867, 3],
  ["Northern", "Pader", 2.8811, 33.0864, 2], ["Northern", "Adjumani", 3.3779, 31.7909, 2],
  ["Northern", "Moyo", 3.6609, 31.7247, 2], ["Northern", "Nebbi", 2.4783, 31.0889, 2],
  ["Northern", "Yumbe", 3.4651, 31.2469, 2], ["Northern", "Koboko", 3.4136, 30.9599, 2],
  ["Northern", "Apac", 1.9756, 32.5386, 2], ["Northern", "Amuru", 2.8139, 31.9387, 2],
  ["Northern", "Oyam", 2.2350, 32.3850, 2], ["Northern", "Nwoya", 2.6342, 32.0011, 2],
  ["Northern", "Moroto", 2.5345, 34.6691, 2], ["Northern", "Kotido", 2.9806, 34.1331, 2],
  ["Northern", "Napak", 2.2514, 34.2500, 1], ["Northern", "Amudat", 1.9500, 34.9500, 1],
  ["Western", "Mbarara", -0.6072, 30.6545, 5], ["Western", "Fort Portal", 0.6710, 30.2758, 4],
  ["Western", "Hoima", 1.4319, 31.3525, 4], ["Western", "Kabale", -1.2486, 29.9899, 3],
  ["Western", "Kasese", 0.1833, 30.0833, 3], ["Western", "Masindi", 1.6744, 31.7150, 3],
  ["Western", "Bushenyi", -0.5853, 30.2114, 2], ["Western", "Rukungiri", -0.7897, 29.9250, 2],
  ["Western", "Kisoro", -1.2854, 29.6847, 2], ["Western", "Ntungamo", -0.8794, 30.2642, 2],
  ["Western", "Ibanda", -0.1333, 30.5000, 2], ["Western", "Isingiro", -0.8436, 30.8039, 2],
  ["Western", "Kanungu", -0.9575, 29.7897, 2], ["Western", "Kabarole", 0.5851, 30.2510, 2],
  ["Western", "Kagadi", 0.9378, 30.8089, 2], ["Western", "Kiryandongo", 1.8756, 32.0622, 2],
  ["Western", "Bundibugyo", 0.7085, 30.0634, 2], ["Western", "Kamwenge", 0.1866, 30.4539, 2],
];

const subcountyNames = ["Central", "Municipal", "North", "South", "East", "West", "Town Council", "Industrial Area", "Market Ward", "Mission Ward", "University Ward", "Lake View", "Hill View"];
const insurerPool = ["AAR", "Jubilee", "Prudential", "Sanlam", "UAP Old Mutual", "Liberty", "Britam", "GA Insurance", "ICEA", "APA", "Medical Concierge"];
const chainNames = ["AAR Health Care", "International Medical Centre", "Ecopharm Pharmacy", "Guardian Health Pharmacy", "Goodlife Pharmacy", "Rocket Health", "C-Care", "LifeLink Medical Centre", "City Medicals", "Medipal"];
const facilityNameWords = ["Unity", "Hope", "Prime", "Victoria", "Pearl", "Nile", "Life", "Care", "Grace", "Community", "St. Mary's", "St. Luke's", "Family", "Wellness", "Reliable", "Metro", "Bridge", "Frontier", "Trust", "Sunrise"];
const specialtyWords = ["Heart", "Cancer", "Women and Children", "Orthopaedic", "Renal", "Diabetes", "Mental Health", "Eye", "ENT", "Trauma", "Fertility", "Urology"];

let rngState = 246813579;
function rnd() {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 2 ** 32;
}

function pick(items) {
  return items[Math.floor(rnd() * items.length)];
}

function sample(items, min, max) {
  const count = min + Math.floor(rnd() * (max - min + 1));
  const pool = [...items];
  const result = [];
  while (result.length < count && pool.length) {
    result.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  }
  return result;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (quoted && c === "\"" && next === "\"") {
      value += "\"";
      i += 1;
    } else if (c === "\"") {
      quoted = !quoted;
    } else if (!quoted && c === ",") {
      row.push(value);
      value = "";
    } else if (!quoted && c === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (c !== "\r") {
      value += c;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift();
  return rows.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])));
}

function districtByLocation(location) {
  const normalized = location.toLowerCase();
  const hit = districtCenters.find(([, district]) => normalized.includes(district.toLowerCase()));
  if (hit) return hit;
  if (normalized.includes("entebbe") || normalized.includes("nansana") || normalized.includes("najjera") || normalized.includes("kasangati")) {
    return districtCenters.find(([, district]) => district === "Wakiso");
  }
  return districtCenters.find(([, district]) => district === "Kampala");
}

function weightedDistrict() {
  const total = districtCenters.reduce((sum, item) => sum + item[4], 0);
  let marker = rnd() * total;
  for (const item of districtCenters) {
    marker -= item[4];
    if (marker <= 0) return item;
  }
  return districtCenters[districtCenters.length - 1];
}

function jitter([region, district, lat, lon]) {
  const spread = district === "Kampala" || district === "Wakiso" ? 0.035 : 0.09;
  return {
    region,
    district,
    latitude: Number((lat + (rnd() - 0.5) * spread).toFixed(6)),
    longitude: Number((lon + (rnd() - 0.5) * spread).toFixed(6)),
  };
}

function providerTypeFromRole(role) {
  const r = role.toLowerCase();
  if (r.includes("pharmacy")) return "PHARMACY";
  if (r.includes("dental")) return "DENTAL";
  if (r.includes("optical") || r.includes("optometry") || r.includes("ophthalmology") || r.includes("eye")) return "OPTICAL";
  if (r.includes("rehabilitation") || r.includes("counselling") || r.includes("audiology")) return "REHABILITATION";
  if (r.includes("imaging") || r.includes("radiology") || r.includes("ultrasound") || r.includes("mri")) return "LABORATORY";
  if (r.includes("hospital") || r.includes("tertiary")) return "HOSPITAL";
  return "CLINIC";
}

function servicesFor(type, category) {
  if (type === "HOSPITAL") {
    const base = ["Outpatient", "Inpatient", "Emergency", "Laboratory", "Pharmacy"];
    if (category.includes("Specialized")) return [...base, pick(["ICU", "Surgery", "Maternity", "Rehabilitation"]), category.replace("Specialized ", "")];
    return [...base, "Maternity", "Surgery", "ICU"];
  }
  if (type === "CLINIC") return ["Outpatient", "Laboratory", pick(["Maternity", "Chronic Care", "Emergency", "Minor Surgery"])];
  if (type === "PHARMACY") return ["Pharmacy", "Chronic Medication", "Retail Dispensing"];
  if (type === "LABORATORY") return category.includes("Imaging") ? ["Imaging", "X-ray", "Ultrasound", "CT/MRI"] : ["Laboratory", "Pathology", "Sample Collection"];
  if (type === "DENTAL") return ["Dental", "Oral Surgery", "Preventive Care"];
  if (type === "OPTICAL") return ["Optical", "Eye Examination", "Spectacles"];
  return ["Rehabilitation", "Physiotherapy", "Counselling"];
}

function ownershipFromMetrics(metrics) {
  if (metrics.includes("Government")) return "Government";
  if (metrics.includes("PNFP")) return "Private not for profit";
  return "Private for profit";
}

function insurersFromMetrics(metrics) {
  const found = insurerPool.filter((insurer) => metrics.toLowerCase().includes(insurer.toLowerCase().split(" ")[0]));
  if (metrics.includes("Major Insurances")) return ["AAR", "Jubilee", "Prudential", "Sanlam", "UAP Old Mutual"];
  return found.length ? found : sample(insurerPool, 1, 3);
}

function slugCode(name, index) {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 34);
  return `UG-FAC-${String(index + 1).padStart(5, "0")}-${slug}`;
}

function makePhone(index) {
  return `+2567${String(10000000 + ((index * 7919) % 89999999)).slice(1)}`;
}

function makeEmail(name, index) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 42);
  return `billing.${String(index + 1).padStart(4, "0")}@${slug || "facility"}.test.ug`;
}

function baseRecord({
  index,
  name,
  type,
  category,
  levelOfCare,
  ownership,
  tier,
  status = "ACTIVE",
  location,
  districtEntry,
  services,
  insurers,
  sourceClass,
  sourceNotes,
  largeInstitutionFlag = false,
  medicalChainRole = category,
}) {
  const geo = jitter(districtEntry);
  const subcounty = location?.split(",")[0]?.trim() || `${geo.district} ${pick(subcountyNames)}`;
  const is24 = type === "HOSPITAL" || (type === "CLINIC" && rnd() > 0.82);
  return {
    facilityCode: slugCode(name, index),
    name,
    legalName: ownership === "Government" ? `${name}` : `${name} Limited`,
    providerType: type,
    facilityCategory: category,
    levelOfCare,
    ownership,
    tier,
    contractStatus: status,
    medicalChainRole,
    largeInstitutionFlag,
    servicesOffered: services,
    acceptsInsurance: true,
    insurersAccepted: insurers,
    insuranceEvidence: sourceClass === "report_seed" ? "Seed report provider-panel or tie-up evidence" : "Generated test panel membership",
    sourceClass,
    sourceNotes,
    region: geo.region,
    district: geo.district,
    county: geo.district,
    subcounty,
    address: location || `${subcounty}, ${geo.district}, Uganda`,
    geoLatitude: geo.latitude,
    geoLongitude: geo.longitude,
    isOpen24Hours: is24,
    operatingHours: is24
      ? { Mon: "00:00-24:00", Tue: "00:00-24:00", Wed: "00:00-24:00", Thu: "00:00-24:00", Fri: "00:00-24:00", Sat: "00:00-24:00", Sun: "00:00-24:00" }
      : { Mon: "08:00-17:00", Tue: "08:00-17:00", Wed: "08:00-17:00", Thu: "08:00-17:00", Fri: "08:00-17:00", Sat: "09:00-13:00", Sun: "Closed" },
    phone: makePhone(index),
    email: makeEmail(name, index),
    contactPerson: `Provider Relations ${String(index + 1).padStart(4, "0")}`,
    paymentTermDays: tier === "OWN" ? 14 : tier === "PARTNER" ? 21 : 30,
    creditLimitUGX: type === "HOSPITAL" ? 250000000 : type === "CLINIC" ? 65000000 : 25000000,
    contractStartDate: "2026-01-01",
    contractEndDate: "2027-12-31",
    contractNotes: `${sourceClass === "report_seed" ? "Report-derived" : "Synthetic"} Uganda facility fixture for provider network, claims, preauth, member map, settlement, and tariff testing.`,
    licenceNumber: `UMDPC-TEST-${String(index + 1).padStart(6, "0")}`,
    registrationNumber: ownership === "Government" ? "" : `UG-REG-TEST-${String(index + 1).padStart(6, "0")}`,
    facilityLevel: levelOfCare,
    smartProviderId: `SMART-UG-${String(index + 1).padStart(5, "0")}`,
    slade360ProviderId: `SLADE-UG-${String(index + 1).padStart(5, "0")}`,
  };
}

function curatedRows() {
  return parseCsv(seedCsv).map((row, index) => {
    const type = providerTypeFromRole(row["Medical Chain Role"]);
    const location = row.Location;
    const districtEntry = districtByLocation(location);
    const ownership = ownershipFromMetrics(row["Extra Metrics (Ownership / Insurance)"]);
    const category = row["Medical Chain Role"].includes("Imaging") ? "Imaging Center" : row["Medical Chain Role"];
    return baseRecord({
      index,
      name: row["Facility Name"],
      type,
      category,
      levelOfCare: row["Medical Chain Role"].includes("National") ? "National Referral" : row["Medical Chain Role"].includes("Regional") ? "Regional Referral" : row["Medical Chain Role"].includes("HC III") ? "HC III" : type === "PHARMACY" ? "Pharmacy" : type === "LABORATORY" ? "Diagnostic" : type === "HOSPITAL" ? "General Hospital" : "Outpatient",
      ownership,
      tier: ownership === "Government" ? "PANEL" : ownership.includes("not for profit") ? "PARTNER" : "PANEL",
      location,
      districtEntry,
      services: servicesFor(type, category),
      insurers: insurersFromMetrics(row["Extra Metrics (Ownership / Insurance)"]),
      sourceClass: "report_seed",
      sourceNotes: "Seeded from user-provided insurance landscape CSV and cross-checked against the user-provided research report.",
      largeInstitutionFlag: row["Large Institution Flag"].toLowerCase() === "yes",
      medicalChainRole: row["Medical Chain Role"],
    });
  });
}

function generatedName(type, district, category, ordinal) {
  if (rnd() > 0.82 && ["CLINIC", "PHARMACY"].includes(type)) {
    return `${pick(chainNames)} ${district} ${pick(subcountyNames)}`;
  }
  if (type === "HOSPITAL" && category.includes("Specialized")) {
    return `${district} ${pick(specialtyWords)} Specialist Hospital`;
  }
  const word = pick(facilityNameWords);
  if (type === "HOSPITAL") return `${word} ${district} Hospital`;
  if (type === "CLINIC") return `${word} ${district} Medical Centre`;
  if (type === "PHARMACY") return `${word} ${district} Pharmacy`;
  if (type === "LABORATORY") return category.includes("Imaging") ? `${word} ${district} Imaging Centre` : `${word} ${district} Diagnostic Laboratory`;
  if (type === "DENTAL") return `${word} ${district} Dental Clinic`;
  if (type === "OPTICAL") return `${word} ${district} Optical Centre`;
  return `${word} ${district} Rehabilitation Centre ${ordinal}`;
}

function generatedRows(startIndex, existingNames) {
  const rows = [];
  for (const [type, target] of Object.entries(GENERATED_TARGET)) {
    for (let i = 0; i < target; i += 1) {
      const districtEntry = weightedDistrict();
      const [, district] = districtEntry;
      let category = type;
      let levelOfCare = "Other";
      if (type === "HOSPITAL") {
        const p = rnd();
        category = p > 0.78 ? "Specialized Hospital" : p > 0.58 ? "General Hospital" : "District Hospital";
        levelOfCare = category === "Specialized Hospital" ? "Specialized Secondary/Tertiary" : category === "District Hospital" ? "District Hospital" : "General Hospital";
      } else if (type === "CLINIC") {
        category = rnd() > 0.62 ? "Medical Clinic" : "Health Centre";
        levelOfCare = rnd() > 0.7 ? "HC IV" : rnd() > 0.35 ? "HC III" : "Outpatient Clinic";
      } else if (type === "LABORATORY") {
        category = rnd() > 0.45 ? "Diagnostic Laboratory" : "Imaging Center";
        levelOfCare = "Diagnostic";
      } else if (type === "PHARMACY") {
        category = "Pharmacy";
        levelOfCare = "Retail Pharmacy";
      } else if (type === "DENTAL") {
        category = "Dental Clinic";
        levelOfCare = "Specialty Outpatient";
      } else if (type === "OPTICAL") {
        category = "Optical Center";
        levelOfCare = "Specialty Outpatient";
      } else {
        category = rnd() > 0.45 ? "Rehabilitation Center" : "Counselling Center";
        levelOfCare = "Specialty Outpatient";
      }

      const ordinal = startIndex + rows.length;
      let name = generatedName(type, district, category, ordinal);
      if (existingNames.has(name)) name = `${name} ${String(i + 1).padStart(2, "0")}`;
      existingNames.add(name);
      const ownership = type === "PHARMACY" || type === "DENTAL" || type === "OPTICAL" || type === "LABORATORY"
        ? "Private for profit"
        : pick(["Private for profit", "Private for profit", "Private not for profit", "Government"]);
      const tier = ownership === "Government" ? pick(["PANEL", "PARTNER"]) : pick(["PARTNER", "PANEL", "PANEL"]);
      rows.push(baseRecord({
        index: ordinal,
        name,
        type,
        category,
        levelOfCare,
        ownership,
        tier,
        location: "",
        districtEntry,
        services: servicesFor(type, category),
        insurers: sample(insurerPool, 1, type === "HOSPITAL" ? 6 : 4),
        sourceClass: "synthetic_fixture",
        sourceNotes: "Deterministic synthetic fixture generated for UAT breadth; not an official MoH registry row.",
        largeInstitutionFlag: type === "HOSPITAL" && rnd() > 0.7,
        medicalChainRole: category,
      }));
    }
  }
  return rows;
}

function csvEscape(value) {
  if (Array.isArray(value)) return csvEscape(value.join("|"));
  if (value && typeof value === "object") return csvEscape(JSON.stringify(value));
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
}

function toCsv(rows, headers) {
  return [headers.join(","), ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(","))].join("\n") + "\n";
}

function summarize(rows) {
  const by = (field) => rows.reduce((acc, row) => {
    acc[row[field]] = (acc[row[field]] ?? 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    byProviderType: by("providerType"),
    byRegion: by("region"),
    byOwnership: by("ownership"),
    bySourceClass: by("sourceClass"),
    activeContracts: rows.filter((row) => row.contractStatus === "ACTIVE").length,
    insuranceAcceptingRows: rows.filter((row) => row.acceptsInsurance).length,
  };
}

const curated = curatedRows();
const existingNames = new Set(curated.map((row) => row.name));
const generated = generatedRows(curated.length, existingNames);
const rows = [...curated, ...generated].slice(0, TARGET_TOTAL);

const masterHeaders = [
  "facilityCode", "name", "legalName", "providerType", "facilityCategory", "levelOfCare", "ownership", "tier",
  "contractStatus", "medicalChainRole", "largeInstitutionFlag", "servicesOffered", "acceptsInsurance",
  "insurersAccepted", "insuranceEvidence", "sourceClass", "sourceNotes", "region", "district", "county",
  "subcounty", "address", "geoLatitude", "geoLongitude", "isOpen24Hours", "operatingHours", "phone", "email",
  "contactPerson", "paymentTermDays", "creditLimitUGX", "contractStartDate", "contractEndDate", "contractNotes",
  "licenceNumber", "registrationNumber", "facilityLevel", "smartProviderId", "slade360ProviderId",
];

const providerImportHeaders = [
  "name", "type", "tier", "address", "county", "phone", "email", "contactPerson", "servicesOffered",
  "paymentTermDays", "contractStatus", "contractStartDate", "contractEndDate", "contractNotes",
  "geoLatitude", "geoLongitude", "isOpen24Hours", "operatingHours", "legalName", "registrationNumber",
  "licenceNumber", "facilityLevel", "smartProviderId", "slade360ProviderId",
];

const providerImportRows = rows.map((row) => ({
  name: row.name,
  type: row.providerType,
  tier: row.tier,
  address: row.address,
  county: row.county,
  phone: row.phone,
  email: row.email,
  contactPerson: row.contactPerson,
  servicesOffered: row.servicesOffered,
  paymentTermDays: row.paymentTermDays,
  contractStatus: row.contractStatus,
  contractStartDate: row.contractStartDate,
  contractEndDate: row.contractEndDate,
  contractNotes: row.contractNotes,
  geoLatitude: row.geoLatitude,
  geoLongitude: row.geoLongitude,
  isOpen24Hours: row.isOpen24Hours,
  operatingHours: row.operatingHours,
  legalName: row.legalName,
  registrationNumber: row.registrationNumber,
  licenceNumber: row.licenceNumber,
  facilityLevel: row.facilityLevel,
  smartProviderId: row.smartProviderId,
  slade360ProviderId: row.slade360ProviderId,
}));

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "uganda_facilities_master.csv"), toCsv(rows, masterHeaders));
writeFileSync(join(outDir, "uganda_facilities_provider_import.csv"), toCsv(providerImportRows, providerImportHeaders));
writeFileSync(join(outDir, "uganda_facilities_master.json"), `${JSON.stringify(rows, null, 2)}\n`);
writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summarize(rows), null, 2)}\n`);

console.log(`Wrote ${rows.length} Uganda facility rows to ${outDir}`);
