import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | { toString(): string }) {
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
  }).format(num);
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function generateMemberNumber() {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  // Sync fallback (no DB). Persisted members use member-numbering.service
  // nextMemberNumber() which applies the client-configurable prefix (G9.6).
  return `MVX-${year}-${randomSuffix}`;
}
