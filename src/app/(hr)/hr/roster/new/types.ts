export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
  endorsementNumber?: string;
  resultingCoverStart?: string;
} | null;
