// Data normalization (section 4.6): maps provider payloads onto the stable
// internal schema so nothing downstream depends on Flinks field names.
//
// Amount convention: negative = money leaving the user, positive = money
// entering the user. This convention is used in the DB, API, charts, budgets,
// and exports.

import type { FlinksAccount, FlinksTransaction } from "./client";
import { sha256 } from "../crypto";

export interface NormalizedAccount {
  providerAccountId: string;
  name: string;
  kind: string;
  subtype?: string;
  currency: string;
  currentBalance: number;
  availableBalance?: number;
  creditLimit?: number;
  mask?: string;
}

export interface NormalizedTransaction {
  providerTransactionId: string;
  fingerprint: string;
  type: "CREDIT" | "DEBIT";
  status: "POSTED" | "PENDING";
  amount: number; // signed
  currency: string;
  date: Date;
  postedDate?: Date;
  description: string;
  rawDescription: string;
  isTransfer: boolean;
  isRefund: false | string; // false or refund category hint
  incomeCandidate: boolean;
}

const TRANSFER_PATTERNS = [
  /^tfr?\b/i,
  /\btransfer/i,
  /\be-?transfer\b/i,
  /\bINTERAC\b/i,
  /\bsend\/?recv/i,
  /\bPAYMENT.*?(?:FROM|TO)\b/i,
  /\binternet bank transfer/i,
  /\bonline banking.*?transfer/i,
  /\bp2p/i,
  /\bWISE\b/i,
  /\bKOHO\b.*?load/i,
  /\bwealthsimple.*?deposit/i,
  /^cash\s*contribution/i,
  /\btangerine.*?transfer/i,
  /\bown account transfer/i,
];

const INCOME_HINTS = [
  /\bpayroll\b/i,
  /\bpay\s*dep/i,
  /\bdirect\s*deposit.*?(?:pay|salary|wage|earn)/i,
  /\bsalary\b/i,
  /\bwages?\b/i,
  /\bpension\b/i,
  /\bemployment\s*insurance\b/i,
  /\bcra\s*(?:deposit|payment|benefit)/i,
  /\bcanada\s*(?:child|workers|revenue)/i,
  /\bcanada\s*pension/i,
  /\bei\s*(?:deposit|payment)/i,
  /\bdeposit\s*(?:from|—)\s*(?!own)/i,
  /\be-?transfer\s*received/i,
  /\b(inc\.?|ltd\.?|llc|corp)\b.*?(?:payroll|payment)/i,
];

export function isTransfer(description: string): boolean {
  return TRANSFER_PATTERNS.some((p) => p.test(description));
}

export function isIncomeCandidate(description: string, amount: number): boolean {
  return amount > 0 && INCOME_HINTS.some((p) => p.test(description));
}

/** Clean merchant strings: collapse whitespace, strip generic noise. */
export function cleanDescription(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
  // strip trailing reference codes like "  #123456" or " REF 8812"
    .replace(/\s+(?:#\w+|REF\s*\w+|ID\s*\w+)\s*$/i, "")
    .slice(0, 140);
}

export function extractMerchant(raw: string): string {
  const cleaned = cleanDescription(raw);
  // Common Canadian-POS prefixes: "PURCHASE -", "DEBIT ", "POS ", "PREAUTH "
  const stripped = cleaned
    .replace(/^(?:purchase|debit|credit|pos|preauth|pre-authorization|internet banking|online banking|e-?transfer)\s*[-–:]?\s*/i, "")
    .replace(/\s+(?:toronto|vancouver|montreal|calgary|ottawa|edmonton|mississauga|brampton|hamilton|london|kitchener|waterloo|winnipeg|halifax|quebec|qc|on|bc|ab|mb|ns|sk)\b.*$/i, "");
  return stripped.slice(0, 80) || cleaned.slice(0, 80);
}

export function normalizeDate(input: string): Date {
  const s = input.slice(0, 10);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
  return d;
}

/** Stable duplicate-detection fingerprint (section 4.6). */
export function fingerprint(
  accountId: string,
  date: string,
  amount: number,
  description: string
): string {
  return sha256(
    [accountId, date.slice(0, 10), amount.toFixed(2), cleanDescription(description)]
      .join("|")
      .toLowerCase()
  );
}

export function normalizeAccount(
  raw: FlinksAccount
): NormalizedAccount {
  return {
    providerAccountId: raw.providerAccountId,
    name: raw.name,
    kind: raw.kind,
    subtype: raw.subtype,
    currency: raw.currency || "CAD",
    currentBalance: round2(raw.currentBalance),
    availableBalance:
      raw.availableBalance != null ? round2(raw.availableBalance) : undefined,
    creditLimit: raw.creditLimit != null ? round2(raw.creditLimit) : undefined,
    mask: raw.mask,
  };
}

export function normalizeTransaction(
  accountId: string,
  currency: string,
  raw: FlinksTransaction
): NormalizedTransaction {
  const debit = Math.abs(raw.debit ?? 0);
  const credit = Math.abs(raw.credit ?? 0);
  const signed = credit > 0 ? credit : -debit; // negative = outflow
  const amount = round2(signed);
  const description = cleanDescription(raw.description);
  const rawDescription = cleanDescription(raw.description);

  return {
    providerTransactionId: raw.providerTransactionId,
    fingerprint: fingerprint(
      accountId,
      raw.date,
      amount,
      raw.description
    ),
    type: amount >= 0 ? "CREDIT" : "DEBIT",
    status: raw.status === "PENDING" ? "PENDING" : "POSTED",
    amount,
    currency: currency || "CAD",
    date: normalizeDate(raw.date),
    postedDate: raw.postedDate ? normalizeDate(raw.postedDate) : undefined,
    description,
    rawDescription,
    isTransfer: isTransfer(description),
    isRefund: false,
    incomeCandidate: isIncomeCandidate(description, amount),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
