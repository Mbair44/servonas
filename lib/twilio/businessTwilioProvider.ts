import { getSupabaseAdmin } from "../supabaseAdmin.ts";

export const businessTwilioProvisioningStatuses = ["not_started", "provisioning", "active", "failed", "suspended"] as const;
export type BusinessTwilioProvisioningStatus = typeof businessTwilioProvisioningStatuses[number];

export type BusinessTwilioContext = {
  id: string;
  businessId: string;
  subaccountSid: string | null;
  friendlyName: string | null;
  subaccountStatus: string | null;
  provisioningStatus: BusinessTwilioProvisioningStatus;
  provisioningError: string | null;
  lastSyncedAt: string | null;
};

export type StoredBusinessTwilioAccount = {
  id: string;
  business_id: string;
  twilio_subaccount_sid: string | null;
  twilio_subaccount_friendly_name: string | null;
  twilio_subaccount_status: string | null;
  provisioning_status: BusinessTwilioProvisioningStatus;
  provisioning_error: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
};

type Business = { id: string; name: string };
type TwilioAccount = { sid: string; friendly_name: string; status: string; auth_token?: string };

export type BusinessTwilioRepository = {
  getBusiness(businessId: string): Promise<Business | null>;
  getAccount(businessId: string): Promise<StoredBusinessTwilioAccount | null>;
  insertProvisioning(businessId: string, friendlyName: string): Promise<StoredBusinessTwilioAccount | null>;
  markProvisioning(id: string, friendlyName: string): Promise<StoredBusinessTwilioAccount>;
  markActive(id: string, account: TwilioAccount): Promise<StoredBusinessTwilioAccount>;
  markFailed(id: string, message: string): Promise<void>;
};

export type ParentTwilioClient = {
  findSubaccountByFriendlyName(friendlyName: string): Promise<TwilioAccount | null>;
  createSubaccount(friendlyName: string): Promise<TwilioAccount>;
};

const toContext = (row: StoredBusinessTwilioAccount): BusinessTwilioContext => ({
  id: row.id,
  businessId: row.business_id,
  subaccountSid: row.twilio_subaccount_sid,
  friendlyName: row.twilio_subaccount_friendly_name,
  subaccountStatus: row.twilio_subaccount_status,
  provisioningStatus: row.provisioning_status,
  provisioningError: row.provisioning_error,
  lastSyncedAt: row.last_synced_at,
});

// Provider errors can contain request context Servonas does not control. Keep the
// durable error deliberately generic; Twilio's own console remains the detail log.
const safeError = () => "Twilio subaccount provisioning failed and can be retried.";

function parentCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const usesApiKey = Boolean(apiKeySid && apiKeySecret);
  const username = usesApiKey ? apiKeySid : accountSid;
  const password = usesApiKey ? apiKeySecret : authToken;
  if (!accountSid || !username || !password) throw new Error("Parent Twilio provisioning credentials are not configured.");
  return { accountSid, username, password };
}

export function getParentTwilioClient(): ParentTwilioClient {
  const credentials = parentCredentials();
  const request = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const value = await response.json() as TwilioAccount & { accounts?: TwilioAccount[]; message?: string };
    if (!response.ok) throw new Error(value.message ? `Twilio rejected subaccount provisioning: ${value.message}` : `Twilio subaccount request failed (${response.status}).`);
    return value;
  };
  return {
    async findSubaccountByFriendlyName(friendlyName) {
      const query = new URLSearchParams({ FriendlyName: friendlyName, PageSize: "20" });
      const value = await request(`https://api.twilio.com/2010-04-01/Accounts.json?${query}`);
      return value.accounts?.find(account => account.friendly_name === friendlyName) ?? null;
    },
    async createSubaccount(friendlyName) {
      const value = await request("https://api.twilio.com/2010-04-01/Accounts.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ FriendlyName: friendlyName }),
      });
      if (!value.sid) throw new Error("Twilio created no identifiable subaccount.");
      // Twilio includes auth_token in this response. It is deliberately discarded.
      return { sid: value.sid, friendly_name: value.friendly_name, status: value.status };
    },
  };
}

function supabaseRepository(): BusinessTwilioRepository {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Server-side Twilio provisioning storage is unavailable.");
  const select = "id,business_id,twilio_subaccount_sid,twilio_subaccount_friendly_name,twilio_subaccount_status,provisioning_status,provisioning_error,created_at,updated_at,last_synced_at";
  const one = async (promise: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>) => {
    const { data, error } = await promise;
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data as StoredBusinessTwilioAccount;
  };
  return {
    async getBusiness(businessId) {
      const { data, error } = await db.from("businesses").select("id,name").eq("id", businessId).eq("is_deleted", false).maybeSingle();
      if (error) throw new Error("Business lookup failed.");
      return data as Business | null;
    },
    async getAccount(businessId) {
      const { data, error } = await db.from("business_twilio_accounts").select(select).eq("business_id", businessId).maybeSingle();
      if (error) throw new Error("Twilio account lookup failed.");
      return data as StoredBusinessTwilioAccount | null;
    },
    async insertProvisioning(businessId, friendlyName) {
      const { data, error } = await db.from("business_twilio_accounts").insert({ business_id: businessId, twilio_subaccount_friendly_name: friendlyName, provisioning_status: "provisioning" }).select(select).single();
      if (error && error.code === "23505") return null;
      if (error) throw new Error("Twilio provisioning state could not be created.");
      return data as StoredBusinessTwilioAccount;
    },
    markProvisioning(id, friendlyName) {
      return one(db.from("business_twilio_accounts").update({ twilio_subaccount_friendly_name: friendlyName, provisioning_status: "provisioning", provisioning_error: null, updated_at: new Date().toISOString() }).eq("id", id).select(select).single());
    },
    markActive(id, account) {
      const now = new Date().toISOString();
      return one(db.from("business_twilio_accounts").update({ twilio_subaccount_sid: account.sid, twilio_subaccount_friendly_name: account.friendly_name, twilio_subaccount_status: account.status, provisioning_status: "active", provisioning_error: null, updated_at: now, last_synced_at: now }).eq("id", id).select(select).single());
    },
    async markFailed(id, message) {
      const { error } = await db.from("business_twilio_accounts").update({ provisioning_status: "failed", provisioning_error: message, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error("Twilio provisioning failure state could not be saved.");
    },
  };
}

export function createBusinessTwilioProvider(dependencies: { repository: BusinessTwilioRepository; parentClient: ParentTwilioClient }) {
  const { repository, parentClient } = dependencies;
  const getBusinessTwilioContext = async (businessId: string) => {
    const row = await repository.getAccount(businessId);
    return row ? toContext(row) : null;
  };
  const createBusinessTwilioSubaccount = async (businessId: string) => {
    const business = await repository.getBusiness(businessId);
    if (!business) throw new Error("Business not found.");
    const suffix = ` - ${business.id}`;
    const friendlyName = `Servonas - ${business.name}`.slice(0, 64 - suffix.length) + suffix;
    let row = await repository.getAccount(businessId);
    if (row?.twilio_subaccount_sid) return toContext(row);
    let claimed = false;
    if (!row) {
      const inserted = await repository.insertProvisioning(businessId, friendlyName);
      claimed = Boolean(inserted);
      row = inserted ?? await repository.getAccount(businessId);
    }
    if (!row) throw new Error("Twilio provisioning state could not be claimed.");
    if (row.twilio_subaccount_sid) return toContext(row);
    const recentlyClaimed = row.provisioning_status === "provisioning" && Date.now() - new Date(row.updated_at).getTime() < 5 * 60_000;
    if (!claimed && recentlyClaimed) throw new Error("Twilio subaccount provisioning is already in progress. Retry shortly.");
    row = await repository.markProvisioning(row.id, friendlyName);
    try {
      const account = await parentClient.findSubaccountByFriendlyName(friendlyName) ?? await parentClient.createSubaccount(friendlyName);
      return toContext(await repository.markActive(row.id, account));
    } catch {
      const message = safeError();
      await repository.markFailed(row.id, message);
      throw new Error(message);
    }
  };
  return {
    getBusinessTwilioContext,
    createBusinessTwilioSubaccount,
    async getOrCreateBusinessTwilioSubaccount(businessId: string) {
      const existing = await getBusinessTwilioContext(businessId);
      return existing?.subaccountSid ? existing : createBusinessTwilioSubaccount(businessId);
    },
  };
}

export async function getBusinessTwilioContext(businessId: string) {
  const row = await supabaseRepository().getAccount(businessId);
  return row ? toContext(row) : null;
}

export function createBusinessTwilioSubaccount(businessId: string) {
  return createBusinessTwilioProvider({ repository: supabaseRepository(), parentClient: getParentTwilioClient() }).createBusinessTwilioSubaccount(businessId);
}

export async function getOrCreateBusinessTwilioSubaccount(businessId: string) {
  const existing = await getBusinessTwilioContext(businessId);
  if (existing?.subaccountSid) return existing;
  return createBusinessTwilioProvider({ repository: supabaseRepository(), parentClient: getParentTwilioClient() }).getOrCreateBusinessTwilioSubaccount(businessId);
}
