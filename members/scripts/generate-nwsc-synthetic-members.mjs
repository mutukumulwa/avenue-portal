import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..");
const outCsv = join(outDir, "nwsc_synthetic_members.csv");

const REGION_TARGETS = [
  ["Kampala Metropolitan Region", 880, 493],
  ["Central Region", 632, 354],
  ["West & South Western Region", 550, 308],
  ["Eastern Region", 385, 216],
  ["Northern Region", 303, 170],
];

const serviceAreas = {
  "Kampala Metropolitan Region": [
    ["Kampala City", "Kampala", ["Nakasero", "Kololo", "Nakawa", "Ntinda", "Bugolobi", "Kawempe", "Makindye", "Rubaga"]],
    ["Mukono Municipality", "Mukono", ["Mukono Central", "Seeta", "Namanve", "Goma"]],
    ["Kira Municipality", "Wakiso", ["Kira", "Najjeera", "Kyaliwajjala", "Bweyogerere"]],
    ["Nansana TC", "Wakiso", ["Nansana", "Nabweru", "Kazo", "Kawanda"]],
    ["Wakiso TC/Buloba", "Wakiso", ["Wakiso", "Buloba", "Namusera", "Kakiri Road"]],
    ["Kakiri", "Wakiso", ["Kakiri", "Busiro", "Masulita", "Namayumba"]],
  ],
  "Central Region": [
    ["Entebbe", "Wakiso", ["Entebbe", "Kajjansi", "Katabi", "Kitoro"]],
    ["Jinja", "Jinja", ["Jinja", "Njeru", "Buwenge", "Kagoma"]],
    ["Lugazi", "Buikwe", ["Lugazi", "Nkokonjeru", "Buikwe", "Najjembe"]],
    ["Iganga", "Iganga", ["Iganga", "Mayuge", "Kaliro", "Busembatya", "Luuka"]],
    ["Bugiri", "Bugiri", ["Bugiri", "Naluwerere", "Buwuni"]],
    ["Mityana", "Mityana", ["Mityana", "Busimbi", "Kiyinda"]],
    ["Masaka", "Masaka", ["Masaka", "Mukungwe", "Bukakata", "Suunga"]],
    ["Kalungu", "Kalungu", ["Kalungu", "Lukaya", "Bukulula"]],
    ["Sembabule", "Sembabule", ["Sembabule", "Lutuuku", "Mateete", "Ntuusi"]],
    ["Mpigi", "Mpigi", ["Mpigi", "Nkozi", "Buwama"]],
    ["Buwama", "Mpigi", ["Buwama", "Kyabadaza", "Gombe", "Kayabwe", "Kibibi"]],
    ["Luweero", "Luweero", ["Luweero", "Wobulenzi", "Bombo", "Zirobwe"]],
    ["Nakasongola", "Nakasongola", ["Nakasongola", "Kakooge", "Migeera"]],
    ["Kapeeka", "Nakaseke", ["Kapeeka", "Semuto", "Nakaseke", "Bukomero"]],
    ["Mubende", "Mubende", ["Mubende", "Kiganda", "Kasambya"]],
    ["Kigumba", "Kiryandongo", ["Kigumba", "Kiryandongo", "Bweyale"]],
    ["Kamuli", "Kamuli", ["Kamuli", "Kisozi", "Mbulamuti"]],
    ["Kyotera", "Kyotera", ["Kyotera", "Kalisizo", "Sanje", "Mutukula"]],
    ["Lwengo", "Lwengo", ["Mabirizi", "Kyazanga", "Kinoni", "Katovu"]],
    ["Kakumiro", "Kakumiro", ["Kakumiro", "Nyalweyo", "Nkooko", "Kisiita"]],
  ],
  "Northern Region": [
    ["Apac", "Apac", ["Apac", "Aduku", "Ibuje", "Kayei Landing Site"]],
    ["Arua", "Arua", ["Arua", "Wandi", "Omugo", "Kubala"]],
    ["Gulu", "Gulu", ["Gulu", "Unyama", "Anaka", "Karuma", "Bobi"]],
    ["Lira", "Lira", ["Lira", "Amach", "Adyel", "Ojwina"]],
    ["Kitgum", "Kitgum", ["Kitgum", "Pager", "Pandwong"]],
    ["Pader", "Pader", ["Pader", "Pajule", "Atanga"]],
    ["Agago", "Agago", ["Patongo", "Kalongo", "Adilang"]],
    ["Nebbi", "Nebbi", ["Nebbi", "Paidha", "Nyapea", "Okollo"]],
    ["Pakwach", "Pakwach", ["Pakwach", "Panyimur", "Wadelai"]],
    ["Adjumani", "Adjumani", ["Adjumani", "Pakele", "Dzaipi"]],
    ["Koboko", "Koboko", ["Koboko", "Yumbe", "Lobule"]],
    ["Moyo", "Moyo", ["Moyo", "Laropi", "Metu"]],
    ["Dokolo", "Dokolo", ["Dokolo", "Agwata", "Amwoma"]],
  ],
  "Eastern Region": [
    ["Mbale", "Mbale", ["Mbale", "Budadiri", "Sironko", "Butebo"]],
    ["Bukedea", "Bukedea", ["Bukedea", "Kachumbala", "Kolir"]],
    ["Tororo", "Tororo", ["Tororo", "Malaba", "Nagongera", "Osukuru"]],
    ["Busia", "Busia", ["Busia", "Masafu", "Lumino"]],
    ["Namisindwa", "Namisindwa", ["Bubutu", "Buwabwala", "Magale"]],
    ["Manafwa", "Manafwa", ["Manafwa", "Butiru", "Lwakhakha", "Bumbo"]],
    ["Soroti", "Soroti", ["Soroti", "Amuria", "Serere", "Arapai"]],
    ["Kaberamaido", "Kaberamaido", ["Kaberamaido", "Otuboi", "Atiriri", "Kalaki"]],
    ["Kumi", "Kumi", ["Kumi", "Ongino", "Atutur"]],
    ["Ngora", "Ngora", ["Ngora", "Kapir", "Mukura"]],
    ["Pallisa", "Pallisa", ["Pallisa", "Kameke", "Agule"]],
    ["Kapchorwa", "Kapchorwa", ["Kapchorwa", "Sipi", "Kaserem"]],
    ["Moroto", "Moroto", ["Moroto", "Matany", "Kangole"]],
    ["Kotido", "Kotido", ["Kotido", "Panyangara", "Nakapelimoru"]],
    ["Kaabong", "Kaabong", ["Kaabong", "Karenga", "Loyoro"]],
    ["Katakwi", "Katakwi", ["Katakwi", "Toroma", "Usuk"]],
  ],
  "West & South Western Region": [
    ["Hoima", "Hoima", ["Hoima", "Kigorobya", "Kyangwali"]],
    ["Kyankwanzi", "Kyankwanzi", ["Kyankwanzi", "Bukwiri", "Banda", "Kasambya"]],
    ["Bushenyi", "Bushenyi", ["Bushenyi", "Ishaka", "Magambo", "Kyabugimbi"]],
    ["Mitooma", "Mitooma", ["Mitooma", "Kashenshero", "Rutookye", "Kabira"]],
    ["Sheema", "Sheema", ["Kyangyenyi", "Kabwohe", "Kigarama"]],
    ["Rubirizi", "Rubirizi", ["Rubirizi", "Katerera", "Ryeru"]],
    ["Kisoro", "Kisoro", ["Kisoro", "Bunagana", "Nyarusiza"]],
    ["Mbarara", "Mbarara", ["Mbarara", "Kinoni", "Rubindi", "Bwizibwera", "Biharwe"]],
    ["Buhweju", "Buhweju", ["Nsiika", "Bitsya", "Buhunga", "Karungu"]],
    ["Fort Portal", "Kabarole", ["Fort Portal", "Kichwamba", "Mugusu", "Kijura"]],
    ["Kyenjojo", "Kyenjojo", ["Kyenjojo", "Katooke", "Butiiti"]],
    ["Kasese", "Kasese", ["Kasese", "Rugendabara", "Hima", "Katwe"]],
    ["Bunyangabo", "Bunyangabo", ["Kibiito", "Rubona", "Rwimi", "Kicucu"]],
    ["Masindi", "Masindi", ["Masindi", "Nyabyeya", "Kijura"]],
    ["Kabale", "Kabale", ["Kabale", "Katuna", "Kyanamira"]],
    ["Rukiga", "Rukiga", ["Muhanga", "Kamwezi", "Kashambya"]],
    ["Rukungiri", "Rukungiri", ["Rukungiri", "Kebisoni", "Buyanja", "Nyakagyeme"]],
    ["Kanungu", "Kanungu", ["Kanungu", "Kihihi", "Kambuga", "Butogota"]],
    ["Ibanda", "Ibanda", ["Ibanda", "Rwenkobwa", "Kijongo"]],
    ["Kamwenge", "Kamwenge", ["Kamwenge", "Bigodi", "Kahunge", "Kanara"]],
    ["Lyantonde", "Lyantonde", ["Lyantonde", "Kasagama", "Kinuka"]],
    ["Ntungamo", "Ntungamo", ["Ruhama", "Mirama Hills", "Rukoni", "Nyakeera"]],
    ["Rushere", "Kiruhura", ["Rushere", "Kiruhura", "Kazo", "Sanga"]],
    ["Mpondwe", "Kasese", ["Mpondwe", "Lhubiriha", "Harukungu", "Kithoma"]],
    ["Ntoroko", "Ntoroko", ["Ntoroko", "Rwebisengo", "Karugutu"]],
    ["Isingiro", "Isingiro", ["Kaberebere", "Nakivale", "Oruchinga", "Kabuyanda"]],
    ["Rwampara", "Rwampara", ["Nyeihanga", "Kinoni", "Bugamba"]],
  ],
};

const maleFirstNames = [
  "Abdul", "Allan", "Andrew", "Ben", "Brian", "Charles", "Collins", "Daniel", "David", "Denis",
  "Emmanuel", "Francis", "Geoffrey", "Godfrey", "Hassan", "Ibrahim", "Isaac", "Ivan", "James", "John",
  "Joseph", "Joshua", "Julius", "Kato", "Mark", "Michael", "Moses", "Noah", "Ocen", "Okello",
  "Opio", "Patrick", "Paul", "Peter", "Raymond", "Richard", "Robert", "Samuel", "Simon", "Stephen",
  "Timothy", "Wasswa",
];

const femaleFirstNames = [
  "Agnes", "Aisha", "Akello", "Annet", "Achen", "Angela", "Babirye", "Brenda", "Catherine", "Esther",
  "Florence", "Grace", "Halima", "Immaculate", "Irene", "Jackie", "Joan", "Judith", "Linda", "Lydia",
  "Margaret", "Martha", "Mary", "Nakato", "Peace", "Patricia", "Prossy", "Rebecca", "Ritah", "Rose",
  "Ruth", "Sarah", "Stella", "Susan", "Sylvia", "Violet",
];

const surnames = [
  "Aciro", "Agaba", "Akena", "Akello", "Alupo", "Anywar", "Auma", "Baluku", "Bamwesigye", "Biryomumaisho",
  "Bukenya", "Byaruhanga", "Kagoya", "Kahuma", "Kakooza", "Kato", "Katumba", "Kiconco", "Kisembo",
  "Kizza", "Kyomuhendo", "Laker", "Lwanga", "Mirembe", "Mugisha", "Mukasa", "Mutebi", "Nabirye",
  "Nakimuli", "Nakku", "Nalubega", "Namutebi", "Nansubuga", "Nantongo", "Nanyonga", "Nsubuga",
  "Ntale", "Obote", "Ocen", "Odongo", "Okello", "Okot", "Olanya", "Opio", "Otieno", "Ouma",
  "Senyonga", "Tumusiime", "Tusubira", "Wabwire", "Waiswa", "Walusimbi", "Wamala",
];

const streetNames = [
  "Water Works Road", "Station Road", "Market Street", "Hospital Road", "Industrial Lane", "Lake View Road",
  "High Street", "Mission Road", "Church Road", "School Lane", "Reservoir Road", "Main Street",
  "Civic Road", "Old Kampala Road", "Commercial Street", "Spring Road", "Council Road", "Hill Road",
];

const departments = [
  "Regional Operations", "Kampala Water", "Technical Services", "Finance & Corporate Strategy",
  "Commercial & Customer Services", "Engineering Services", "Planning & Capital Development", "Water Quality",
  "Human Resource", "Information & Business Solutions", "Internal Audit", "Legal Services",
  "Public Relations & Corporate Communications", "Procurement & Stores",
];

const rolesBySeniority = {
  "Executive Leadership": ["Corporate Strategy Lead", "Chief Technical Advisor", "Executive Programme Lead"],
  "Senior Director/Director": ["Director of Operations", "Director of Finance", "Director of Engineering", "Director of Customer Services"],
  "Regional/General Manager": ["Regional Manager", "General Manager", "Deputy Regional Manager"],
  "Area/Branch Manager": ["Area Manager", "Branch Manager", "District Operations Manager", "Customer Service Manager"],
  "Supervisor/Specialist": ["Network Supervisor", "Billing Supervisor", "Water Quality Specialist", "Projects Supervisor"],
  "Professional/Officer": ["Commercial Officer", "Finance Officer", "Human Resource Officer", "Civil Engineer", "IT Officer", "Procurement Officer"],
  "Field/Operations": ["Plant Operator", "Meter Reader", "Network Technician", "Leakage Technician", "Pump Attendant", "Field Assistant"],
  "Support/Admin": ["Administrative Assistant", "Driver", "Stores Assistant", "Records Clerk", "Customer Care Assistant"],
};

const seniorityWeights = [
  ["Executive Leadership", 1],
  ["Senior Director/Director", 2],
  ["Regional/General Manager", 4],
  ["Area/Branch Manager", 8],
  ["Supervisor/Specialist", 16],
  ["Professional/Officer", 28],
  ["Field/Operations", 31],
  ["Support/Admin", 10],
];

let rngState = 20260706;
let nextRowNumber = 1;
let nextHouseholdNumber = 1;

function rnd() {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 2 ** 32;
}

function pick(items) {
  return items[Math.floor(rnd() * items.length)];
}

function weightedPick(weightedItems) {
  const total = weightedItems.reduce((sum, item) => sum + item[1], 0);
  let marker = rnd() * total;
  for (const item of weightedItems) {
    marker -= item[1];
    if (marker <= 0) return item[0];
  }
  return weightedItems[weightedItems.length - 1][0];
}

function pad(value, length = 6) {
  return String(value).padStart(length, "0");
}

function randomDate(yearMin, yearMax) {
  const year = yearMin + Math.floor(rnd() * (yearMax - yearMin + 1));
  const month = 1 + Math.floor(rnd() * 12);
  const dayMax = [4, 6, 9, 11].includes(month) ? 30 : month === 2 ? 28 : 31;
  const day = 1 + Math.floor(rnd() * dayMax);
  return `${year}-${pad(month, 2)}-${pad(day, 2)}`;
}

function yearOf(date) {
  return Number(date.slice(0, 4));
}

function genderedName(gender, surname = pick(surnames)) {
  const firstName = pick(gender === "Male" ? maleFirstNames : femaleFirstNames);
  return `${firstName} ${surname}`;
}

function chooseGender() {
  return rnd() < 0.53 ? "Male" : "Female";
}

function chooseSeniority(region) {
  if (region === "Kampala Metropolitan Region" && rnd() < 0.035) {
    return weightedPick([
      ["Executive Leadership", 2],
      ["Senior Director/Director", 4],
      ["Regional/General Manager", 4],
      ["Area/Branch Manager", 3],
    ]);
  }
  return weightedPick(seniorityWeights);
}

function dobForSeniority(seniority) {
  const ranges = {
    "Executive Leadership": [1963, 1981],
    "Senior Director/Director": [1968, 1986],
    "Regional/General Manager": [1973, 1991],
    "Area/Branch Manager": [1978, 1996],
    "Supervisor/Specialist": [1983, 2001],
    "Professional/Officer": [1986, 2003],
    "Field/Operations": [1976, 2004],
    "Support/Admin": [1980, 2005],
  };
  return randomDate(...ranges[seniority]);
}

function chooseServiceLocation(region) {
  const [area, district, towns] = pick(serviceAreas[region]);
  const town = pick(towns);
  const plot = 1 + Math.floor(rnd() * 999);
  const address = `Plot ${plot}, ${pick(streetNames)}, ${town}, ${district} District, Uganda`;
  return { area, district, town, address };
}

function makePrimary(region) {
  const location = chooseServiceLocation(region);
  const gender = chooseGender();
  const surname = pick(surnames);
  const seniority = chooseSeniority(region);
  const householdId = `NWSC-HH-${pad(nextHouseholdNumber++)}`;
  const memberId = `NWSC-MEM-${pad(nextRowNumber++)}`;
  const department = region === "Kampala Metropolitan Region" && rnd() < 0.28 ? "Kampala Water" : pick(departments);
  const primary = {
    member_id: memberId,
    household_id: householdId,
    primary_member_id: memberId,
    primary_member_name: "",
    full_name: genderedName(gender, surname),
    date_of_birth: dobForSeniority(seniority),
    gender,
    physical_address: location.address,
    region,
    district: location.district,
    nwsc_area: location.area,
    town_or_ward: location.town,
    member_marker: "PRIMARY",
    relationship_to_primary: "",
    seniority_level: seniority,
    job_title: pick(rolesBySeniority[seniority]),
    organisation_unit: department,
    synthetic_record: "TRUE",
  };
  primary.primary_member_name = primary.full_name;
  return primary;
}

function chooseRelationship() {
  return weightedPick([
    ["Child", 64],
    ["Spouse", 23],
    ["Parent", 8],
    ["Sibling", 5],
  ]);
}

function dependentDob(primary, relationship) {
  const primaryYear = yearOf(primary.date_of_birth);
  if (relationship === "Spouse") {
    const min = Math.max(1958, primaryYear - 7);
    const max = Math.min(2005, primaryYear + 7);
    return randomDate(min, max);
  }
  if (relationship === "Parent") {
    const min = Math.max(1938, primaryYear - 46);
    const max = Math.max(min, primaryYear - 20);
    return randomDate(min, max);
  }
  if (relationship === "Sibling") {
    const min = Math.max(1970, primaryYear - 12);
    const max = Math.min(2008, primaryYear + 12);
    return randomDate(min, max);
  }
  const min = Math.max(2000, primaryYear + 19);
  const max = 2025;
  return randomDate(Math.min(min, max), max);
}

function makeDependent(primary) {
  const relationship = chooseRelationship();
  let gender = chooseGender();
  if (relationship === "Spouse" && rnd() < 0.86) {
    gender = primary.gender === "Male" ? "Female" : "Male";
  }
  const primarySurname = primary.full_name.split(" ").slice(-1)[0];
  const surname = relationship === "Spouse" && rnd() < 0.45 ? pick(surnames) : primarySurname;
  return {
    member_id: `NWSC-MEM-${pad(nextRowNumber++)}`,
    household_id: primary.household_id,
    primary_member_id: primary.primary_member_id,
    primary_member_name: primary.primary_member_name,
    full_name: genderedName(gender, surname),
    date_of_birth: dependentDob(primary, relationship),
    gender,
    physical_address: primary.physical_address,
    region: primary.region,
    district: primary.district,
    nwsc_area: primary.nwsc_area,
    town_or_ward: primary.town_or_ward,
    member_marker: "DEPENDANT",
    relationship_to_primary: relationship,
    seniority_level: "Dependant",
    job_title: "",
    organisation_unit: "",
    synthetic_record: "TRUE",
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

const headers = [
  "member_id",
  "household_id",
  "primary_member_id",
  "primary_member_name",
  "full_name",
  "date_of_birth",
  "gender",
  "physical_address",
  "region",
  "district",
  "nwsc_area",
  "town_or_ward",
  "member_marker",
  "relationship_to_primary",
  "seniority_level",
  "job_title",
  "organisation_unit",
  "synthetic_record",
];

const rows = [];
const primariesByRegion = new Map();

for (const [region, totalRows, primaryCount] of REGION_TARGETS) {
  const primaries = [];
  for (let i = 0; i < primaryCount; i += 1) {
    const primary = makePrimary(region);
    primaries.push(primary);
    rows.push(primary);
  }
  primariesByRegion.set(region, primaries);

  const dependantCount = totalRows - primaryCount;
  for (let i = 0; i < dependantCount; i += 1) {
    const primary = primaries[Math.floor(rnd() * primaries.length)];
    rows.push(makeDependent(primary));
  }
}

rows.sort((a, b) => a.member_id.localeCompare(b.member_id));

const csv = [
  headers.join(","),
  ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
].join("\n");

mkdirSync(outDir, { recursive: true });
writeFileSync(outCsv, `${csv}\n`);

const summary = rows.reduce(
  (acc, row) => {
    acc.total += 1;
    acc.byType[row.member_marker] = (acc.byType[row.member_marker] ?? 0) + 1;
    acc.byRegion[row.region] = (acc.byRegion[row.region] ?? 0) + 1;
    return acc;
  },
  { total: 0, byType: {}, byRegion: {} },
);

console.log(JSON.stringify(summary, null, 2));
