/**
 * Withdrawal destinations.
 *
 * Client-safe: the withdrawal form and the server-side validation import this
 * same module, so a country, a bank or a field that is not in the directory can
 * never be submitted, and both sides agree on exactly what gets masked before
 * it is written to a transaction description.
 *
 * Two kinds of destination exist:
 *   - wallets and payment apps (a handle or email address)
 *   - bank accounts (a country, a bank from that country, and the routing
 *     fields that country actually uses)
 *
 * Nothing here talks to a bank. This is a simulated payout system: the directory
 * only decides which inputs are collected and how they are stored.
 */

export type WalletKind = "cashapp" | "paypal" | "venmo" | "zelle";

export type DestinationKind = WalletKind | "bank";

export type WalletDestination = {
  id: string;
  label: string;
  kind: WalletKind;
  /** What we ask the customer for. */
  identifierLabel: string;
  identifierPlaceholder: string;
};

export const WALLET_DESTINATIONS: WalletDestination[] = [
  {
    id: "cashapp",
    label: "Cash App",
    kind: "cashapp",
    identifierLabel: "Cashtag",
    identifierPlaceholder: "$yourcashtag",
  },
  {
    id: "paypal",
    label: "PayPal",
    kind: "paypal",
    identifierLabel: "PayPal email",
    identifierPlaceholder: "you@example.com",
  },
  {
    id: "venmo",
    label: "Venmo",
    kind: "venmo",
    identifierLabel: "Venmo username",
    identifierPlaceholder: "@your-venmo",
  },
  {
    id: "zelle",
    label: "Zelle",
    kind: "zelle",
    identifierLabel: "Zelle email or mobile number",
    identifierPlaceholder: "you@example.com or +1 555 0100",
  },
];

export function findWallet(id: string): WalletDestination | undefined {
  return WALLET_DESTINATIONS.find((item) => item.id === id);
}

// ---------------------------------------------------------------------------
// Bank directory
// ---------------------------------------------------------------------------

/** The routing fields a country's banks actually use. */
export type BankFieldKey =
  | "accountNumber"
  | "abaRoutingNumber"
  | "branchCode"
  | "sortCode"
  | "institutionNumber"
  | "transitNumber"
  | "bsb"
  | "ifsc"
  | "iban";

export type BankFieldSpec = {
  key: BankFieldKey;
  label: string;
  /** Compact label used inside the stored destination string. */
  shortLabel: string;
  placeholder: string;
  hint?: string;
  pattern: RegExp;
  patternMessage: string;
  maxLength: number;
  /** How many trailing characters survive masking. */
  visibleDigits: number;
  inputMode: "numeric" | "text";
  uppercase: boolean;
};

type FieldSeed = {
  label: string;
  shortLabel: string;
  placeholder: string;
  pattern: RegExp;
  message: string;
  maxLength: number;
  visibleDigits: number;
  hint?: string;
  inputMode?: "numeric" | "text";
  uppercase?: boolean;
};

function bankField(key: BankFieldKey, seed: FieldSeed): BankFieldSpec {
  return {
    key,
    label: seed.label,
    shortLabel: seed.shortLabel,
    placeholder: seed.placeholder,
    hint: seed.hint,
    pattern: seed.pattern,
    patternMessage: seed.message,
    maxLength: seed.maxLength,
    visibleDigits: seed.visibleDigits,
    inputMode: seed.inputMode ?? "numeric",
    uppercase: seed.uppercase ?? false,
  };
}

function accountNumber(min: number, max: number, placeholder: string, hint?: string): BankFieldSpec {
  return bankField("accountNumber", {
    label: "Account number",
    shortLabel: "A/C",
    placeholder,
    pattern: new RegExp(`^\\d{${min},${max}}$`),
    message: `Enter the ${min}–${max} digit account number.`,
    maxLength: max,
    visibleDigits: 4,
    hint,
  });
}

function ibanField(placeholder: string): BankFieldSpec {
  return bankField("iban", {
    label: "IBAN",
    shortLabel: "IBAN",
    placeholder,
    pattern: /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/,
    message: "Enter the IBAN exactly as your bank writes it (15-34 characters).",
    maxLength: 34,
    visibleDigits: 4,
    inputMode: "text",
    uppercase: true,
    hint: "Your bank prints the IBAN on statements and in online banking.",
  });
}

const ABA_ROUTING = bankField("abaRoutingNumber", {
  label: "ABA routing number",
  shortLabel: "ABA",
  placeholder: "021000021",
  pattern: /^\d{9}$/,
  message: "ABA routing numbers are 9 digits.",
  maxLength: 9,
  visibleDigits: 2,
  hint: "The 9 digit number at the bottom left of a check.",
});

const SORT_CODE = bankField("sortCode", {
  label: "Sort code",
  shortLabel: "Sort",
  placeholder: "20-00-00",
  pattern: /^\d{6}$/,
  message: "Sort codes are 6 digits (for example 20-00-00).",
  maxLength: 8,
  visibleDigits: 2,
});

const BRANCH_CODE = bankField("branchCode", {
  label: "Branch code",
  shortLabel: "Branch",
  placeholder: "470010",
  pattern: /^\d{6}$/,
  message: "South African branch codes are 6 digits.",
  maxLength: 6,
  visibleDigits: 2,
});

const INSTITUTION_NUMBER = bankField("institutionNumber", {
  label: "Institution number",
  shortLabel: "Inst.",
  placeholder: "001",
  pattern: /^\d{3}$/,
  message: "Canadian institution numbers are 3 digits.",
  maxLength: 3,
  visibleDigits: 1,
});

const TRANSIT_NUMBER = bankField("transitNumber", {
  label: "Transit number",
  shortLabel: "Transit",
  placeholder: "12345",
  pattern: /^\d{5}$/,
  message: "Canadian transit numbers are 5 digits.",
  maxLength: 5,
  visibleDigits: 2,
});

const BSB = bankField("bsb", {
  label: "BSB",
  shortLabel: "BSB",
  placeholder: "062-000",
  pattern: /^\d{6}$/,
  message: "BSB numbers are 6 digits (for example 062-000).",
  maxLength: 7,
  visibleDigits: 2,
});

const IFSC = bankField("ifsc", {
  label: "IFSC code",
  shortLabel: "IFSC",
  placeholder: "HDFC0001234",
  pattern: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  message: "IFSC codes look like HDFC0001234.",
  maxLength: 11,
  visibleDigits: 2,
  inputMode: "text",
  uppercase: true,
  hint: "Printed on your cheque book and in net banking.",
});

export type CountryRegion = "North America" | "Africa" | "Europe" | "Asia-Pacific";

export const COUNTRY_REGIONS: CountryRegion[] = [
  "North America",
  "Africa",
  "Europe",
  "Asia-Pacific",
];

export type WithdrawalCountry = {
  code: string;
  name: string;
  /** Used for the "other bank" entry and short hints. */
  shortName: string;
  region: CountryRegion;
  fields: BankFieldSpec[];
};

export const COUNTRIES: WithdrawalCountry[] = [
  {
    code: "US",
    name: "United States",
    shortName: "US",
    region: "North America",
    fields: [
      accountNumber(4, 17, "000123456789", "Checking or savings account number."),
      ABA_ROUTING,
    ],
  },
  {
    code: "CA",
    name: "Canada",
    shortName: "Canadian",
    region: "North America",
    fields: [
      accountNumber(5, 17, "000123456789"),
      INSTITUTION_NUMBER,
      TRANSIT_NUMBER,
    ],
  },
  {
    code: "ZA",
    name: "South Africa",
    shortName: "South African",
    region: "Africa",
    fields: [accountNumber(6, 16, "1234567890"), BRANCH_CODE],
  },
  {
    code: "NG",
    name: "Nigeria",
    shortName: "Nigerian",
    region: "Africa",
    fields: [accountNumber(10, 11, "0123456789", "NUBAN account numbers are 10 digits.")],
  },
  {
    code: "GH",
    name: "Ghana",
    shortName: "Ghanaian",
    region: "Africa",
    fields: [accountNumber(10, 16, "0123456789")],
  },
  {
    code: "KE",
    name: "Kenya",
    shortName: "Kenyan",
    region: "Africa",
    fields: [accountNumber(6, 20, "0123456789")],
  },
  {
    code: "GB",
    name: "United Kingdom",
    shortName: "UK",
    region: "Europe",
    fields: [accountNumber(6, 10, "12345678"), SORT_CODE],
  },
  {
    code: "DE",
    name: "Germany",
    shortName: "German",
    region: "Europe",
    fields: [ibanField("DE89370400440532013000")],
  },
  {
    code: "FR",
    name: "France",
    shortName: "French",
    region: "Europe",
    fields: [ibanField("FR7630006000011234567890189")],
  },
  {
    code: "ES",
    name: "Spain",
    shortName: "Spanish",
    region: "Europe",
    fields: [ibanField("ES9121000418450200051332")],
  },
  {
    code: "IT",
    name: "Italy",
    shortName: "Italian",
    region: "Europe",
    fields: [ibanField("IT60X0542811101000000123456")],
  },
  {
    code: "NL",
    name: "Netherlands",
    shortName: "Dutch",
    region: "Europe",
    fields: [ibanField("NL91ABNA0417164300")],
  },
  {
    code: "IE",
    name: "Ireland",
    shortName: "Irish",
    region: "Europe",
    fields: [ibanField("IE29AIBK93115212345678")],
  },
  {
    code: "BE",
    name: "Belgium",
    shortName: "Belgian",
    region: "Europe",
    fields: [ibanField("BE68539007547034")],
  },
  {
    code: "AT",
    name: "Austria",
    shortName: "Austrian",
    region: "Europe",
    fields: [ibanField("AT611904300234573201")],
  },
  {
    code: "PT",
    name: "Portugal",
    shortName: "Portuguese",
    region: "Europe",
    fields: [ibanField("PT50000201231234567890154")],
  },
  {
    code: "CH",
    name: "Switzerland",
    shortName: "Swiss",
    region: "Europe",
    fields: [ibanField("CH9300762011623852957")],
  },
  {
    code: "PL",
    name: "Poland",
    shortName: "Polish",
    region: "Europe",
    fields: [ibanField("PL61109010140000071219812874")],
  },
  {
    code: "SE",
    name: "Sweden",
    shortName: "Swedish",
    region: "Europe",
    fields: [ibanField("SE4550000000058398257466")],
  },
  {
    code: "DK",
    name: "Denmark",
    shortName: "Danish",
    region: "Europe",
    fields: [ibanField("DK5000400440116243")],
  },
  {
    code: "NO",
    name: "Norway",
    shortName: "Norwegian",
    region: "Europe",
    fields: [ibanField("NO9386011117947")],
  },
  {
    code: "AU",
    name: "Australia",
    shortName: "Australian",
    region: "Asia-Pacific",
    fields: [accountNumber(5, 10, "12345678"), BSB],
  },
  {
    code: "IN",
    name: "India",
    shortName: "Indian",
    region: "Asia-Pacific",
    fields: [accountNumber(6, 18, "001234567890"), IFSC],
  },
];

export function findCountry(code: string): WithdrawalCountry | undefined {
  const wanted = code.trim().toUpperCase();
  if (!wanted) return undefined;
  return COUNTRIES.find((country) => country.code === wanted);
}

export type DirectoryBank = {
  id: string;
  name: string;
  countryCode: string;
  /** Alternate names people actually type (FNB, GTBank, CommBank...). */
  aka?: string[];
  /** The "bank not listed" fallback for a country. */
  generic?: boolean;
};

function bank(id: string, name: string, countryCode: string, aka?: string[]): DirectoryBank {
  return { id, name, countryCode, aka };
}

const NAMED_BANKS: DirectoryBank[] = [
  // United States
  bank("us-green-dot-bank", "Green Dot Bank", "US", ["Green Dot"]),
  bank("us-chase", "JPMorgan Chase", "US", ["Chase"]),
  bank("us-bank-of-america", "Bank of America", "US", ["BofA"]),
  bank("us-wells-fargo", "Wells Fargo", "US"),
  bank("us-citi", "Citibank", "US", ["Citi"]),
  bank("us-capital-one", "Capital One", "US"),
  bank("us-us-bank", "U.S. Bank", "US"),
  bank("us-pnc", "PNC Bank", "US", ["PNC"]),
  bank("us-td-bank", "TD Bank", "US"),
  bank("us-truist", "Truist", "US"),
  bank("us-ally", "Ally Bank", "US", ["Ally"]),
  bank("us-discover", "Discover Bank", "US", ["Discover"]),
  bank("us-navy-federal", "Navy Federal Credit Union", "US", ["Navy Federal"]),
  bank("us-regions", "Regions Bank", "US", ["Regions"]),
  bank("us-fifth-third", "Fifth Third Bank", "US", ["Fifth Third"]),
  bank("us-keybank", "KeyBank", "US"),

  // Canada
  bank("ca-rbc", "RBC Royal Bank", "CA", ["RBC", "Royal Bank of Canada"]),
  bank("ca-td", "TD Canada Trust", "CA", ["TD"]),
  bank("ca-scotiabank", "Scotiabank", "CA", ["Bank of Nova Scotia"]),
  bank("ca-bmo", "BMO", "CA", ["Bank of Montreal"]),
  bank("ca-cibc", "CIBC", "CA", ["Canadian Imperial Bank of Commerce"]),
  bank("ca-national-bank", "National Bank of Canada", "CA"),
  bank("ca-desjardins", "Desjardins", "CA"),
  bank("ca-tangerine", "Tangerine", "CA"),
  bank("ca-eq-bank", "EQ Bank", "CA"),

  // South Africa
  bank("za-capitec", "Capitec Bank", "ZA", ["Capitec"]),
  bank("za-fnb", "First National Bank", "ZA", ["FNB"]),
  bank("za-standard-bank", "Standard Bank", "ZA"),
  bank("za-absa", "Absa Bank", "ZA", ["Absa"]),
  bank("za-nedbank", "Nedbank", "ZA"),
  bank("za-tymebank", "TymeBank", "ZA", ["Tyme"]),
  bank("za-african-bank", "African Bank", "ZA"),
  bank("za-investec", "Investec", "ZA"),
  bank("za-discovery-bank", "Discovery Bank", "ZA"),

  // Nigeria
  bank("ng-access", "Access Bank", "NG"),
  bank("ng-zenith", "Zenith Bank", "NG"),
  bank("ng-gtbank", "Guaranty Trust Bank", "NG", ["GTBank", "GTCO"]),
  bank("ng-first-bank", "First Bank of Nigeria", "NG", ["FirstBank"]),
  bank("ng-uba", "United Bank for Africa", "NG", ["UBA"]),
  bank("ng-stanbic-ibtc", "Stanbic IBTC Bank", "NG", ["Stanbic IBTC"]),
  bank("ng-fidelity", "Fidelity Bank", "NG"),
  bank("ng-union", "Union Bank of Nigeria", "NG"),
  bank("ng-kuda", "Kuda Microfinance Bank", "NG", ["Kuda"]),
  bank("ng-opay", "OPay", "NG"),

  // Ghana
  bank("gh-gcb", "GCB Bank", "GH"),
  bank("gh-ecobank", "Ecobank Ghana", "GH"),
  bank("gh-fidelity", "Fidelity Bank Ghana", "GH"),
  bank("gh-absa", "Absa Bank Ghana", "GH"),
  bank("gh-stanbic", "Stanbic Bank Ghana", "GH"),
  bank("gh-calbank", "CalBank", "GH"),

  // Kenya
  bank("ke-equity", "Equity Bank Kenya", "KE", ["Equity"]),
  bank("ke-kcb", "KCB Bank Kenya", "KE", ["KCB", "Kenya Commercial Bank"]),
  bank("ke-cooperative", "Co-operative Bank of Kenya", "KE"),
  bank("ke-absa", "Absa Bank Kenya", "KE"),
  bank("ke-ncba", "NCBA Bank", "KE"),
  bank("ke-stanbic", "Stanbic Bank Kenya", "KE"),
  bank("ke-im", "I&M Bank Kenya", "KE"),
  bank("ke-dtb", "Diamond Trust Bank", "KE", ["DTB"]),

  // United Kingdom
  bank("gb-barclays", "Barclays", "GB"),
  bank("gb-hsbc", "HSBC UK", "GB", ["HSBC"]),
  bank("gb-lloyds", "Lloyds Bank", "GB", ["Lloyds"]),
  bank("gb-natwest", "NatWest", "GB"),
  bank("gb-santander", "Santander UK", "GB"),
  bank("gb-halifax", "Halifax", "GB"),
  bank("gb-nationwide", "Nationwide Building Society", "GB", ["Nationwide"]),
  bank("gb-tsb", "TSB Bank", "GB", ["TSB"]),
  bank("gb-monzo", "Monzo", "GB"),
  bank("gb-starling", "Starling Bank", "GB", ["Starling"]),
  bank("gb-cooperative", "The Co-operative Bank", "GB", ["Co-op Bank"]),

  // Australia
  bank("au-commonwealth", "Commonwealth Bank", "AU", ["CommBank", "CBA"]),
  bank("au-westpac", "Westpac", "AU"),
  bank("au-anz", "ANZ", "AU"),
  bank("au-nab", "NAB", "AU", ["National Australia Bank"]),
  bank("au-macquarie", "Macquarie Bank", "AU"),
  bank("au-bendigo", "Bendigo Bank", "AU"),
  bank("au-ing", "ING Australia", "AU", ["ING"]),
  bank("au-st-george", "St.George Bank", "AU"),
  bank("au-bankwest", "Bankwest", "AU"),

  // India
  bank("in-hdfc", "HDFC Bank", "IN", ["HDFC"]),
  bank("in-icici", "ICICI Bank", "IN", ["ICICI"]),
  bank("in-sbi", "State Bank of India", "IN", ["SBI"]),
  bank("in-axis", "Axis Bank", "IN"),
  bank("in-kotak", "Kotak Mahindra Bank", "IN", ["Kotak"]),
  bank("in-pnb", "Punjab National Bank", "IN", ["PNB"]),
  bank("in-bank-of-baroda", "Bank of Baroda", "IN"),
  bank("in-yes", "Yes Bank", "IN"),
  bank("in-idfc-first", "IDFC FIRST Bank", "IN", ["IDFC"]),

  // Germany
  bank("de-deutsche-bank", "Deutsche Bank", "DE"),
  bank("de-commerzbank", "Commerzbank", "DE"),
  bank("de-n26", "N26", "DE"),
  bank("de-sparkasse", "Sparkasse", "DE"),

  // France
  bank("fr-bnp-paribas", "BNP Paribas", "FR"),
  bank("fr-societe-generale", "Société Générale", "FR"),
  bank("fr-credit-agricole", "Crédit Agricole", "FR"),

  // Spain
  bank("es-santander", "Santander España", "ES", ["Santander"]),
  bank("es-bbva", "BBVA", "ES"),
  bank("es-caixabank", "CaixaBank", "ES"),

  // Italy
  bank("it-unicredit", "UniCredit", "IT"),
  bank("it-intesa", "Intesa Sanpaolo", "IT"),
  bank("it-banco-bpm", "Banco BPM", "IT"),

  // Netherlands
  bank("nl-ing", "ING", "NL"),
  bank("nl-rabobank", "Rabobank", "NL"),
  bank("nl-abn-amro", "ABN AMRO", "NL"),

  // Ireland
  bank("ie-bank-of-ireland", "Bank of Ireland", "IE"),
  bank("ie-aib", "AIB", "IE", ["Allied Irish Banks"]),

  // Belgium
  bank("be-kbc", "KBC Bank", "BE", ["KBC"]),
  bank("be-belfius", "Belfius", "BE"),

  // Austria
  bank("at-erste", "Erste Bank", "AT"),
  bank("at-raiffeisen", "Raiffeisen Bank International", "AT", ["Raiffeisen"]),

  // Portugal
  bank("pt-millennium", "Millennium BCP", "PT"),
  bank("pt-novo-banco", "Novo Banco", "PT"),

  // Switzerland
  bank("ch-ubs", "UBS", "CH"),
  bank("ch-postfinance", "PostFinance", "CH"),

  // Poland
  bank("pl-pko", "PKO Bank Polski", "PL", ["PKO"]),
  bank("pl-mbank", "mBank", "PL"),

  // Sweden
  bank("se-swedbank", "Swedbank", "SE"),
  bank("se-seb", "SEB", "SE"),

  // Denmark
  bank("dk-danske", "Danske Bank", "DK"),
  bank("dk-nordea", "Nordea Danmark", "DK", ["Nordea"]),

  // Norway
  bank("no-dnb", "DNB", "NO"),
  bank("no-nordea", "Nordea Norge", "NO", ["Nordea"]),
];

/**
 * Every bank in the directory, including one "other bank" entry per country so
 * a customer whose bank is not listed can still be paid.
 */
export const BANKS: DirectoryBank[] = [
  ...NAMED_BANKS,
  ...COUNTRIES.map<DirectoryBank>((country) => ({
    id: `${country.code.toLowerCase()}-other`,
    name: `Other ${country.shortName} bank`,
    countryCode: country.code,
    generic: true,
  })),
];

export function findBank(id: string): DirectoryBank | undefined {
  const wanted = id.trim().toLowerCase();
  if (!wanted) return undefined;
  return BANKS.find((item) => item.id === wanted);
}

export function banksForCountry(countryCode: string): DirectoryBank[] {
  const country = findCountry(countryCode);
  if (!country) return [];
  return BANKS.filter((item) => item.countryCode === country.code);
}

/** Case-insensitive search over a bank's name and the names people type. */
export function searchBanks(countryCode: string, query: string, limit = 40): DirectoryBank[] {
  const list = banksForCountry(countryCode);
  const needle = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!needle) return list.slice(0, limit);
  const compactNeedle = needle.replace(/[^a-z0-9]/g, "");

  return list
    .filter((item) =>
      [item.name, ...(item.aka ?? [])].some((name) => {
        const value = name.toLowerCase();
        return value.includes(needle) || value.replace(/[^a-z0-9]/g, "").includes(compactNeedle);
      }),
    )
    .slice(0, limit);
}

/** Country + bank must belong together; a US bank under Canada is rejected. */
export function resolveBank(
  countryCode: string,
  bankId: string,
): { country: WithdrawalCountry; bank: DirectoryBank } | null {
  const country = findCountry(countryCode);
  if (!country) return null;
  const bank = findBank(bankId);
  if (!bank || bank.countryCode !== country.code) return null;
  return { country, bank };
}

// ---------------------------------------------------------------------------
// Input normalisation, validation and masking
// ---------------------------------------------------------------------------

/** Codes are typed with spaces and dashes ("20-00-00"); storage wants digits. */
export function normaliseBankFieldValue(spec: BankFieldSpec, raw: string): string {
  const compact = raw.replace(/[\s-]/g, "");
  return spec.uppercase ? compact.toUpperCase() : compact;
}

export function checkBankField(spec: BankFieldSpec, raw: string): string | null {
  const value = normaliseBankFieldValue(spec, raw);
  if (!value) return `Enter the ${spec.label.toLowerCase()}.`;
  if (value.length > spec.maxLength) {
    return `Keep the ${spec.label.toLowerCase()} to ${spec.maxLength} characters.`;
  }
  if (!spec.pattern.test(value)) return spec.patternMessage;
  return null;
}

export type BankDetailsCheck =
  | { ok: true; values: Record<string, string> }
  | { ok: false; message: string };

/** Validates every field the selected country asks for, in form order. */
export function validateBankDetails(
  country: WithdrawalCountry,
  details: Record<string, string>,
): BankDetailsCheck {
  const values: Record<string, string> = {};

  for (const spec of country.fields) {
    const raw = details[spec.key] ?? "";
    const issue = checkBankField(spec, raw);
    if (issue) return { ok: false, message: issue };
    values[spec.key] = normaliseBankFieldValue(spec, raw);
  }

  return { ok: true, values };
}

/**
 * Keeps only a short tail of an account number or routing code. Nothing longer
 * than this ever reaches a transaction description or an admin table.
 */
export function maskCredential(value: string, visibleDigits = 4): string {
  const compact = value.replace(/[\s-]/g, "");
  if (!compact) return "";
  const visible = Math.max(1, Math.min(visibleDigits, compact.length - 1));
  return `····${compact.slice(-visible)}`;
}

/**
 * The one line stored on the withdrawal: bank, country, masked routing details
 * and the account holder. `request_withdrawal` truncates at 160 characters, so
 * the holder name is shortened before anything important is lost.
 */
export function buildBankDestinationLabel(input: {
  bank: DirectoryBank;
  country: WithdrawalCountry;
  accountName: string;
  values: Record<string, string>;
}): string {
  const parts: string[] = [input.bank.name, input.country.name];

  for (const spec of input.country.fields) {
    const value = input.values[spec.key];
    if (!value) continue;
    parts.push(`${spec.shortLabel} ${maskCredential(value, spec.visibleDigits)}`);
  }

  const prefix = parts.join(" · ");
  const holder = input.accountName.trim().slice(0, 60);
  const label = `${prefix} · ${holder}`;
  if (label.length <= 160) return label;

  const room = Math.max(4, 160 - prefix.length - 3);
  return `${prefix} · ${holder.slice(0, room)}`;
}
