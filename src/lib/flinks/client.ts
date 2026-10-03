// Flinks API client. All Flinks HTTP traffic stays server-side (section 4.2:
// "Keep provider-specific financial data processing on the server").
//
// In simulator mode (FLINKS_MODE=simulator) the client returns deterministic
// Canadian sample data so the full pipeline can run without a Flinks contract.

import crypto from "crypto";
import { env } from "../config";

export interface FlinksAccount {
  providerAccountId: string;
  name: string;
  kind:
    | "CHEQUING"
    | "SAVINGS"
    | "CREDIT_CARD"
    | "LINE_OF_CREDIT"
    | "LOAN"
    | "INVESTMENT"
    | "OTHER";
  subtype?: string;
  currency: string;
  currentBalance: number;
  availableBalance?: number;
  creditLimit?: number;
  mask?: string;
}

export interface FlinksTransaction {
  providerTransactionId: string;
  // Flinks reports debits/credits from the account-holder perspective; we
  // normalize to signed amounts downstream (section 4.6).
  debit: number; // > 0 when money leaves the account
  credit: number; // > 0 when money enters the account
  date: string; // ISO date
  postedDate?: string;
  description: string;
  status?: "POSTED" | "PENDING";
  category?: string;
}

export interface FlinksInstitution {
  providerSlug: string;
  name: string;
  shortName?: string;
}

export interface FlinksConnectionResult {
  requestId: string;
  linkId: string;
  institution: FlinksInstitution;
  accounts: FlinksAccount[];
  accessToken?: string;
  refreshToken?: string;
}

const BASE_HEADERS = { "Content-Type": "application/json" };

async function flinksFetch<T>(
  path: string,
  init?: RequestInit & { accessToken?: string }
): Promise<T> {
  const url = `${env.flinks.apiUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (init?.accessToken) headers["Authorization"] = `Bearer ${init.accessToken}`;
  const res = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Flinks API error ${res.status}: ${redact(body)}`);
  }
  return (await res.json()) as T;
}

/** Strip anything credential-like before an error surfaces in logs. */
function redact(s: string): string {
  return s
    .replace(/("?(accessToken|refreshToken|password|secret)"?\s*[:=]\s*)"?[^",\s]+"?/gi, '$1"***"')
    .slice(0, 500);
}

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

const SIM_INSTITUTIONS: FlinksInstitution[] = [
  { providerSlug: "rbc", name: "Royal Bank of Canada", shortName: "RBC" },
  { providerSlug: "td", name: "TD Canada Trust", shortName: "TD" },
  { providerSlug: "scotiabank", name: "Scotiabank", shortName: "Scotiabank" },
  { providerSlug: "bmo", name: "Bank of Montreal", shortName: "BMO" },
  { providerSlug: "cibc", name: "CIBC", shortName: "CIBC" },
  { providerSlug: "tangerine", name: "Tangerine", shortName: "Tangerine" },
  { providerSlug: "desjardins", name: "Desjardins", shortName: "Desjardins" },
  { providerSlug: "eq-bank", name: "EQ Bank", shortName: "EQ Bank" },
];

const SIM_ACCOUNTS: FlinksAccount[] = [
  {
    providerAccountId: "sim-cheq-1",
    name: "Chequing ••4021",
    kind: "CHEQUING",
    subtype: "Personal",
    currency: "CAD",
    currentBalance: 4183.52,
    availableBalance: 4133.52,
    mask: "4021",
  },
  {
    providerAccountId: "sim-sav-1",
    name: "Savings ••7788",
    kind: "SAVINGS",
    subtype: "High Interest",
    currency: "CAD",
    currentBalance: 12450.0,
    mask: "7788",
  },
  {
    providerAccountId: "sim-cc-1",
    name: "Cash Back Mastercard ••3319",
    kind: "CREDIT_CARD",
    currency: "CAD",
    currentBalance: -842.17,
    availableBalance: 2657.83,
    creditLimit: 3500,
    mask: "3319",
  },
];

const SIM_PAYROLL = [
  { payor: "ACME SOFTWARE INC PAYROLL", amount: 2140.0, freqDays: 14 },
];
const SIM_DEBITS = [
  { desc: "LOBLAWS #1042 TORONTO ON", amount: 143.87, cat: "groceries" },
  { desc: "METRO ONTARIO INC", amount: 87.42, cat: "groceries" },
  { desc: "TIM HORTONS #8812", amount: 6.75, cat: "restaurants" },
  { desc: "NETFLIX.COM", amount: 16.99, cat: "entertainment" },
  { desc: "ROGERS COMMUNICATIONS", amount: 95.4, cat: "phone" },
  { desc: "ENBRIDGE GAS", amount: 74.2, cat: "utilities" },
  { desc: "SHELL PETRO-CANADA", amount: 68.3, cat: "fuel" },
  { desc: "PRESTO TRANSIT", amount: 32.0, cat: "transportation" },
  { desc: "RENT Payment OAKVIEW PROPERTY", amount: 1750.0, cat: "housing" },
  { desc: "TTC MONTHLY PASS", amount: 156.0, cat: "transportation" },
  { desc: "AMAZON.CA*MK4TR", amount: 45.99, cat: "shopping" },
  { desc: "SHOPPERS DRUG MART #617", amount: 41.2, cat: "healthcare" },
];

function simGenerate(
  seedAccountId: string,
  daysBack: number
): FlinksTransaction[] {
  const out: FlinksTransaction[] = [];
  const base = crypto
    .createHash("md5")
    .update(seedAccountId)
    .digest()
    .readUInt32LE(0);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let n = 0;

  // Biweekly payroll
  for (let d = 0; d < daysBack; d += 14) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - d);
    out.push({
      providerTransactionId: `${seedAccountId}-pay-${d}`,
      debit: 0,
      credit: SIM_PAYROLL[0].amount + ((base + d) % 12),
      date: date.toISOString().slice(0, 10),
      description: SIM_PAYROLL[0].payor,
      status: "POSTED",
    });
  }

  // Recurring monthly rent
  for (let m = 0; m < Math.ceil(daysBack / 30); m++) {
    const date = new Date(today);
    date.setUTCMonth(date.getUTCMonth() - m, 1);
    out.push({
      providerTransactionId: `${seedAccountId}-rent-${m}`,
      debit: SIM_DEBITS[8].amount,
      credit: 0,
      date: date.toISOString().slice(0, 10),
      description: SIM_DEBITS[8].desc,
      status: "POSTED",
    });
  }

  // Groceries & sundry spend twice a week
  for (let d = 0; d < daysBack; d += 3) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - d);
    const pick = SIM_DEBITS[(base + d) % (SIM_DEBITS.length - 1)];
    if (pick.cat === "housing") continue;
    out.push({
      providerTransactionId: `${seedAccountId}-sp-${d}-${n++}`,
      debit: pick.amount,
      credit: 0,
      date: date.toISOString().slice(0, 10),
      description: pick.desc,
      status: d === 0 ? "PENDING" : "POSTED",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public client API
// ---------------------------------------------------------------------------

export const flinks = {
  listInstitutions(): FlinksInstitution[] {
    if (env.isFlinksSimulator) return SIM_INSTITUTIONS;
    // Production: institutions are configured per plan; the client fetches
    // the Flinks institution list when available. Kept minimal here because
    // Flinks Connect widget itself presents the picker.
    return SIM_INSTITUTIONS;
  },

  /**
   * Exchange a Flinks Connect authorization result for a persistent handle.
   * In production this calls Flinks' /BankingServices/Authorize by requestId.
   */
  async authorize(
    requestId: string,
    institutionSlug: string
  ): Promise<FlinksConnectionResult> {
    if (env.isFlinksSimulator) {
      const inst =
        SIM_INSTITUTIONS.find((i) => i.providerSlug === institutionSlug) ??
        SIM_INSTITUTIONS[0];
      return {
        requestId,
        linkId: `sim-link-${crypto.randomBytes(6).toString("hex")}`,
        institution: inst,
        accounts: SIM_ACCOUNTS,
        accessToken: `sim-at-${crypto.randomBytes(12).toString("hex")}`,
        refreshToken: `sim-rt-${crypto.randomBytes(12).toString("hex")}`,
      };
    }
    const data = await flinksFetch<{
      RequestId: string;
      Accounts: Array<{
        Id: string;
        Title: string;
        Category?: string;
        SubCategory?: string;
        Currency?: string;
        CurrentBalance?: number;
        AvailableBalance?: number;
        CreditLimit?: number;
        AccountNumber?: string;
      }>;
      AccessToken?: string;
      RefreshToken?: string;
    }>("/BankingServices/Authorize", {
      method: "POST",
      body: JSON.stringify({ RequestId: requestId }),
    });
    return {
      requestId: data.RequestId,
      linkId: data.RequestId,
      institution: { providerSlug: institutionSlug, name: institutionSlug },
      accessToken: data.AccessToken,
      refreshToken: data.RefreshToken,
      accounts: (data.Accounts ?? []).map((a) => ({
        providerAccountId: a.Id,
        name: a.Title,
        kind: mapFlinksKind(a.Category),
        subtype: a.SubCategory,
        currency: a.Currency ?? "CAD",
        currentBalance: a.CurrentBalance ?? 0,
        availableBalance: a.AvailableBalance,
        creditLimit: a.CreditLimit,
        mask: a.AccountNumber?.slice(-4),
      })),
    };
  },

  /** Fetch accounts + transactions for a connection handle. */
  async getAccountsDetail(
    accessToken: string,
    providerAccountIds: string[],
    daysBack = 95
  ): Promise<Record<string, FlinksTransaction[]>> {
    if (env.isFlinksSimulator) {
      const result: Record<string, FlinksTransaction[]> = {};
      for (const id of providerAccountIds) {
        result[id] =
          id.includes("cc") || id.includes("sav")
            ? simGenerate(id, daysBack).filter(
                (t) => !t.description.includes("PAYROLL") && !t.description.includes("RENT")
              )
            : simGenerate(id, daysBack);
      }
      return result;
    }
    const data = await flinksFetch<{
      Transactions?: Array<{
        AccountId: string;
        Id: string;
        Debit?: number;
        Credit?: number;
        Date?: string;
        PostedDate?: string;
        Description: string;
        Status?: string;
        Category?: string;
      }>;
    }>("/BankingServices/GetAccountsDetail", {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        Accounts: providerAccountIds,
        NumberOfDays: daysBack,
      }),
    });
    const out: Record<string, FlinksTransaction[]> = {};
    for (const t of data.Transactions ?? []) {
      (out[t.AccountId] ??= []).push({
        providerTransactionId: t.Id,
        debit: t.Debit ?? 0,
        credit: t.Credit ?? 0,
        date: (t.Date ?? t.PostedDate ?? "").slice(0, 10),
        postedDate: t.PostedDate?.slice(0, 10),
        description: t.Description ?? "",
        status: t.Status === "PENDING" ? "PENDING" : "POSTED",
        category: t.Category,
      });
    }
    return out;
  },
};

function mapFlinksKind(category?: string): FlinksAccount["kind"] {
  switch ((category ?? "").toLowerCase()) {
    case "chequing":
      return "CHEQUING";
    case "savings":
      return "SAVINGS";
    case "credit card":
    case "creditcard":
      return "CREDIT_CARD";
    case "line of credit":
      return "LINE_OF_CREDIT";
    case "loan":
      return "LOAN";
    case "investment":
      return "INVESTMENT";
    default:
      return "OTHER";
  }
}
