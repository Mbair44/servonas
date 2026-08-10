import { getSupabaseAdmin } from "../supabaseAdmin.ts";

export type AreaCodeSuggestionSource = "business_phone" | "configured_market" | "none";

export type AreaCodeSuggestion = {
  preferredAreaCode: string | null;
  fallbackAreaCodes: string[];
  source: AreaCodeSuggestionSource;
  message: string;
  requiresSelection: boolean;
};

type BusinessContact = {
  phone: string | null;
  otherPhones?: Array<string | null>;
  city: string | null;
  state: string | null;
  country: string | null;
};

type MarketFallbacks = Record<string, string[]>;

const areaCodePattern = /^[2-9]\d{2}$/;

export function extractUsAreaCode(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  const areaCode = national.slice(0, 3);
  return areaCodePattern.test(areaCode) ? areaCode : null;
}

function configuredMarkets(raw = process.env.TWILIO_AREA_CODE_MARKET_FALLBACKS): MarketFallbacks {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([key, areas]) => {
      if (!Array.isArray(areas)) return [];
      const valid = areas.filter((area): area is string => typeof area === "string" && areaCodePattern.test(area));
      return valid.length ? [[key.trim().toUpperCase(), [...new Set(valid)]]] : [];
    }));
  } catch {
    return {};
  }
}

function configuredAreaCodes(contact: BusinessContact, markets: MarketFallbacks) {
  const country = contact.country?.trim().toUpperCase();
  const state = contact.state?.trim().toUpperCase();
  const city = contact.city?.trim().toUpperCase();
  if (country && country !== "US" && country !== "USA" && country !== "UNITED STATES") return [];
  const keys = [state && city ? `${state}:${city}` : null, state, "DEFAULT"].filter((key): key is string => Boolean(key));
  return [...new Set(keys.flatMap(key => markets[key] ?? []))];
}

export function suggestAreaCodes(contact: BusinessContact, markets = configuredMarkets()): AreaCodeSuggestion {
  // The canonical business-facing number is intentionally checked before any
  // additional numbers so billing, employee, or secondary numbers cannot
  // displace the business's primary recommendation.
  const phoneAreaCode = [contact.phone, ...(contact.otherPhones ?? [])].map(extractUsAreaCode).find(Boolean) ?? null;
  const marketAreas = configuredAreaCodes(contact, markets);
  if (phoneAreaCode) {
    return {
      preferredAreaCode: phoneAreaCode,
      fallbackAreaCodes: marketAreas.filter(area => area !== phoneAreaCode),
      source: "business_phone",
      message: `Based on your current business number, we recommend a ${phoneAreaCode} number.`,
      requiresSelection: false,
    };
  }
  if (marketAreas.length) {
    const [preferredAreaCode, ...fallbackAreaCodes] = marketAreas;
    return {
      preferredAreaCode,
      fallbackAreaCodes,
      source: "configured_market",
      message: `Based on your configured service market, we suggest starting with ${preferredAreaCode}. You can choose another area code.`,
      requiresSelection: false,
    };
  }
  return {
    preferredAreaCode: null,
    fallbackAreaCodes: [],
    source: "none",
    message: "Choose the US area code you want for this business.",
    requiresSelection: true,
  };
}

export async function getBusinessAreaCodeSuggestion(businessId: string) {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Server-side business storage is unavailable.");
  const { data, error } = await db.from("businesses").select("phone,city,state,country").eq("id", businessId).eq("is_deleted", false).maybeSingle();
  if (error) throw new Error("Business contact information could not be loaded.");
  if (!data) throw new Error("Business not found.");
  return suggestAreaCodes(data as BusinessContact);
}
