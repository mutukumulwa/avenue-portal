import { differenceInYears } from "date-fns";

type KnowledgeMember = {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  phone?: string | null;
  email?: string | null;
  group?: { name: string } | null;
  dependents?: Array<{ firstName: string; lastName: string }>;
  claims?: Array<{ dateOfService: Date; provider?: { name: string } | null }>;
  visitVerifications?: Array<{ openedAt: Date; provider?: { name: string } | null }>;
};

type KnowledgePromptWithExpected = {
  key: string;
  prompt: string;
  expected: string;
  aliases?: string[];
};

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateAliases(date: Date) {
  const iso = date.toISOString().slice(0, 10);
  return [
    iso,
    date.toLocaleDateString("en-KE"),
    date.toLocaleDateString("en-GB"),
  ];
}

function buildKnowledgePromptInternals(member: KnowledgeMember): KnowledgePromptWithExpected[] {
  const prompts = [
    {
      key: "full_name",
      prompt: "Confirm the member's full name.",
      expected: `${member.firstName} ${member.lastName}`.trim().toLowerCase(),
    },
    {
      key: "age",
      prompt: "Confirm the member's age.",
      expected: differenceInYears(new Date(), member.dateOfBirth).toString(),
      aliases: [member.dateOfBirth.toISOString().slice(0, 10), ...dateAliases(member.dateOfBirth)],
    },
  ];

  if (member.group?.name) {
    prompts.push({
      key: "group_name",
      prompt: "Confirm the employer or group name on the membership.",
      expected: member.group.name.trim().toLowerCase(),
    });
  }

  const dependent = member.dependents?.[0];
  if (dependent) {
    prompts.push({
      key: "dependent_name",
      prompt: "Name one registered dependent.",
      expected: `${dependent.firstName} ${dependent.lastName}`.trim().toLowerCase(),
    });
  }

  if (member.phone && member.phone.length >= 4) {
    prompts.push({
      key: "phone_last4",
      prompt: "Confirm the last four digits of the registered phone number.",
      expected: member.phone.slice(-4),
    });
  }

  if (member.email) {
    const [local] = member.email.split("@");
    prompts.push({
      key: "email_start",
      prompt: "Confirm the first part of the registered email address.",
      expected: local.trim().toLowerCase(),
    });
  }

  const lastClaim = member.claims?.[0];
  if (lastClaim) {
    prompts.push({
      key: "last_visit_date",
      prompt: "Confirm the date of the member's last recorded visit or service.",
      expected: lastClaim.dateOfService.toISOString().slice(0, 10),
      aliases: dateAliases(lastClaim.dateOfService),
    });
    if (lastClaim.provider?.name) {
      prompts.push({
        key: "last_facility",
        prompt: "Confirm the last facility or provider the member visited.",
        expected: lastClaim.provider.name.trim().toLowerCase(),
      });
    }
  }

  const lastVisit = member.visitVerifications?.[0];
  if (!lastClaim && lastVisit) {
    prompts.push({
      key: "last_visit_date",
      prompt: "Confirm the date of the member's last verified visit.",
      expected: lastVisit.openedAt.toISOString().slice(0, 10),
      aliases: dateAliases(lastVisit.openedAt),
    });
    if (lastVisit.provider?.name) {
      prompts.push({
        key: "last_facility",
        prompt: "Confirm the last facility the member checked in at.",
        expected: lastVisit.provider.name.trim().toLowerCase(),
      });
    }
  }

  return prompts.slice(0, 3);
}

export function buildKnowledgePrompts(member: KnowledgeMember) {
  return buildKnowledgePromptInternals(member).map(({ key, prompt }) => ({ key, prompt }));
}

export function verifyKnowledgeAnswers(
  member: KnowledgeMember,
  answers: Array<{ key: string; answer: string }>
) {
  const promptMap = new Map(buildKnowledgePromptInternals(member).map((prompt) => [prompt.key, prompt]));
  const results = answers.map(({ key, answer }) => {
    const prompt = promptMap.get(key);
    const normalizedAnswer = normalize(answer);
    const accepted = prompt
      ? [prompt.expected, ...(prompt.aliases ?? [])].some((expected) => normalize(expected) === normalizedAnswer)
      : false;

    return { key, accepted };
  });

  return {
    passed: results.length >= 3 && results.every((result) => result.accepted),
    results,
  };
}
