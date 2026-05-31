export const supportedFundingCurrencies = ["USD", "KES", "UGX"] as const;

export type FundingCurrency = typeof supportedFundingCurrencies[number];

export type ExchangeRateQuote = {
  base: "USD";
  rates: Record<FundingCurrency, number>;
  source: string;
  sourceUpdatedAt: string;
  fetchedAt: string;
  isFallback: boolean;
};

const fallbackRates: Record<FundingCurrency, number> = {
  USD: 1,
  KES: 130,
  UGX: 3700,
};

const sourceName = "ExchangeRate-API";
const defaultRatesUrl = "https://open.er-api.com/v6/latest/USD";
const cacheDurationMs = 12 * 60 * 60 * 1000;
let cachedQuote: ExchangeRateQuote | null = null;

export async function getExchangeRateQuote(): Promise<ExchangeRateQuote> {
  if (cachedQuote && Date.now() - Date.parse(cachedQuote.fetchedAt) < cacheDurationMs) {
    return cachedQuote;
  }

  try {
    const response = await fetch(Deno.env.get("EXCHANGE_RATE_API_URL") || defaultRatesUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`FX provider returned ${response.status}`);

    const data = await response.json();
    const rates = normalizeRates(data?.rates);
    cachedQuote = {
      base: "USD",
      rates,
      source: sourceName,
      sourceUpdatedAt: new Date(Number(data?.time_last_update_unix || 0) * 1000).toISOString(),
      fetchedAt: new Date().toISOString(),
      isFallback: false,
    };
  } catch (error) {
    console.error("Using fallback FX rates:", error);
    cachedQuote = createFallbackQuote();
  }

  return cachedQuote;
}

export function fallbackToUsdAmount(amount: number, currency: string) {
  const rate = fallbackRates[normalizeCurrency(currency)];
  return amount / rate;
}

export function normalizeCurrency(currency: string): FundingCurrency {
  const normalized = String(currency || "").toUpperCase();
  if (!supportedFundingCurrencies.includes(normalized as FundingCurrency)) {
    throw new Error("Unsupported currency selected.");
  }
  return normalized as FundingCurrency;
}

function normalizeRates(rates: Record<string, unknown> | null | undefined) {
  const normalized = { ...fallbackRates };
  for (const currency of supportedFundingCurrencies) {
    const value = Number(rates?.[currency]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`FX provider did not return a valid ${currency} rate.`);
    }
    normalized[currency] = value;
  }
  return normalized;
}

function createFallbackQuote(): ExchangeRateQuote {
  return {
    base: "USD",
    rates: { ...fallbackRates },
    source: `${sourceName} fallback`,
    sourceUpdatedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    isFallback: true,
  };
}
