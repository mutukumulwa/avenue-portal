import { z } from "zod";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";

export const MEMBER_GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export const MEMBER_RELATIONSHIPS = ["PRINCIPAL", "SPOUSE", "CHILD", "PARENT", "SIBLING"] as const;

export interface MemberDemographicsInput {
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface CanonicalMemberDemographics {
  firstName: string;
  lastName: string;
  gender: (typeof MEMBER_GENDERS)[number];
  relationship: (typeof MEMBER_RELATIONSHIPS)[number];
  phone: string | null;
  email: string | null;
}

export type MemberDemographicsResult =
  | {
      ok: true;
      value: CanonicalMemberDemographics;
    }
  | { ok: false; fieldErrors: Record<string, string[]> };

export type MemberDemographicEditsResult =
  | {
      ok: true;
      value: Partial<CanonicalMemberDemographics>;
    }
  | { ok: false; fieldErrors: Record<string, string[]> };

function name(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function validateMemberDemographics(input: MemberDemographicsInput): MemberDemographicsResult {
  const errors: Record<string, string[]> = {};
  const firstName = name(input.firstName);
  const lastName = name(input.lastName);
  const gender = (input.gender ?? "").trim();
  const relationship = (input.relationship ?? "").trim();
  const rawPhone = input.phone?.trim() ?? "";
  const rawEmail = input.email?.trim() ?? "";
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const email = rawEmail ? normalizeEmail(rawEmail) : null;

  if (!firstName) errors.firstName = ["Enter the member's first name."];
  else if (firstName.length > 100) errors.firstName = ["Use 100 characters or fewer."];
  if (!lastName) errors.lastName = ["Enter the member's last name."];
  else if (lastName.length > 100) errors.lastName = ["Use 100 characters or fewer."];
  if (!MEMBER_GENDERS.includes(gender as (typeof MEMBER_GENDERS)[number])) {
    errors.gender = ["Select a valid gender."];
  }
  if (!MEMBER_RELATIONSHIPS.includes(relationship as (typeof MEMBER_RELATIONSHIPS)[number])) {
    errors.relationship = ["Select a valid relationship."];
  }
  if (rawPhone && !phone) {
    errors.phone = ["Enter a Ugandan phone number such as +256 772 555 042 or 0772 555 042."];
  }
  if (rawEmail && !z.string().email().safeParse(email).success) {
    errors.email = ["Enter a valid email address, for example member@example.com."];
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      firstName,
      lastName,
      gender: gender as (typeof MEMBER_GENDERS)[number],
      relationship: relationship as (typeof MEMBER_RELATIONSHIPS)[number],
      phone,
      email,
    },
  };
}

/**
 * Validate a partial profile command without inventing values for fields that
 * were not edited. This is the service-boundary companion to the full form
 * validator: direct callers cannot cast an unknown enum or malformed email into
 * Prisma, while the three-way diff remains genuinely partial.
 */
export function validateMemberDemographicEdits(
  input: MemberDemographicsInput,
): MemberDemographicEditsResult {
  const errors: Record<string, string[]> = {};
  const value: Record<string, string | null> = {};

  if (input.firstName !== undefined) {
    const firstName = name(input.firstName);
    if (!firstName) errors.firstName = ["Enter the member's first name."];
    else if (firstName.length > 100) errors.firstName = ["Use 100 characters or fewer."];
    else value.firstName = firstName;
  }
  if (input.lastName !== undefined) {
    const lastName = name(input.lastName);
    if (!lastName) errors.lastName = ["Enter the member's last name."];
    else if (lastName.length > 100) errors.lastName = ["Use 100 characters or fewer."];
    else value.lastName = lastName;
  }
  if (input.gender !== undefined) {
    const gender = (input.gender ?? "").trim();
    if (!MEMBER_GENDERS.includes(gender as (typeof MEMBER_GENDERS)[number])) {
      errors.gender = ["Select a valid gender."];
    } else value.gender = gender;
  }
  if (input.relationship !== undefined) {
    const relationship = (input.relationship ?? "").trim();
    if (!MEMBER_RELATIONSHIPS.includes(relationship as (typeof MEMBER_RELATIONSHIPS)[number])) {
      errors.relationship = ["Select a valid relationship."];
    } else value.relationship = relationship;
  }
  if (input.phone !== undefined) {
    const rawPhone = input.phone?.trim() ?? "";
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawPhone && !phone) {
      errors.phone = ["Enter a Ugandan phone number such as +256 772 555 042 or 0772 555 042."];
    } else value.phone = phone;
  }
  if (input.email !== undefined) {
    const rawEmail = input.email?.trim() ?? "";
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    if (rawEmail && !z.string().email().safeParse(email).success) {
      errors.email = ["Enter a valid email address, for example member@example.com."];
    } else value.email = email;
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, value };
}
