import { getSupabaseAdmin } from "../supabaseAdmin.ts";
import { getSubaccountWebhookSecretResolver, type SubaccountWebhookSecretResolver } from "./subaccountWebhookSecrets.ts";

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
  webhookSecretStatus: "missing"|"available"|"rotation_required"|"error";
  webhookSecretVersion: number;
  webhookSecretUpdatedAt: string | null;
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
  webhook_secret_status: "missing"|"available"|"rotation_required"|"error";
  webhook_secret_version: number;
  webhook_secret_updated_at: string | null;
};

type Business = { id: string; name: string };
type TwilioAccount = { sid: string; friendly_name: string; status: string; auth_token?: string };
export type TwilioRemediationErrorCategory =
  | "missing_account_sid"
  | "missing_auth_token"
  | "invalid_request_construction"
  | "network_fetch_exception"
  | "twilio_http_error"
  | "json_parsing_failure"
  | "missing_auth_token_response"
  | "subaccount_sid_mismatch"
  | "unexpected_recovery_error"
  | "vault_storage_error";

type TwilioRemediationErrorOptions = {
  category: TwilioRemediationErrorCategory;
  providerStatus?: number | null;
  providerCode?: number | null;
  hasAccountSid?: boolean;
  hasAuthToken?: boolean;
  errorName?: string | null;
};

const safeErrorName = (error: unknown) => {
  if (!(error instanceof Error)) return null;
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name) ? error.name : "Error";
};

export class TwilioRemediationError extends Error {
  readonly stage: "twilio_recovery" | "vault_storage";
  readonly category: TwilioRemediationErrorCategory;
  readonly providerStatus: number | null;
  readonly providerCode: number | null;
  readonly hasAccountSid: boolean;
  readonly hasAuthToken: boolean;
  readonly errorName: string | null;

  constructor(stage: "twilio_recovery" | "vault_storage", options: TwilioRemediationErrorOptions) {
    super("Twilio webhook credential remediation failed.");
    this.name = "TwilioRemediationError";
    this.stage = stage;
    this.category = options.category;
    this.providerStatus = options.providerStatus ?? null;
    this.providerCode = options.providerCode ?? null;
    this.hasAccountSid = options.hasAccountSid ?? Boolean(process.env.TWILIO_ACCOUNT_SID?.trim());
    this.hasAuthToken = options.hasAuthToken ?? Boolean(process.env.TWILIO_AUTH_TOKEN?.trim());
    this.errorName = options.errorName ?? null;
  }
}

export type BusinessTwilioRepository = {
  getBusiness(businessId: string): Promise<Business | null>;
  getAccount(businessId: string): Promise<StoredBusinessTwilioAccount | null>;
  insertProvisioning(businessId: string, friendlyName: string): Promise<StoredBusinessTwilioAccount | null>;
  markProvisioning(id: string, friendlyName: string): Promise<StoredBusinessTwilioAccount>;
  markActive(id: string, account: TwilioAccount): Promise<StoredBusinessTwilioAccount>;
  markFailed(id: string, message: string): Promise<void>;
  markWebhookSecretError(id:string):Promise<void>;
};

export type ParentTwilioClient = {
  findSubaccountByFriendlyName(friendlyName: string): Promise<TwilioAccount | null>;
  getSubaccount(subaccountSid: string): Promise<TwilioAccount>;
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
  webhookSecretStatus: row.webhook_secret_status,
  webhookSecretVersion: row.webhook_secret_version,
  webhookSecretUpdatedAt: row.webhook_secret_updated_at,
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

function parentRecoveryCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const availability = { hasAccountSid: Boolean(accountSid), hasAuthToken: Boolean(authToken) };
  if (!accountSid) {
    throw new TwilioRemediationError("twilio_recovery", { category: "missing_account_sid", ...availability });
  }
  if (!authToken) {
    throw new TwilioRemediationError("twilio_recovery", { category: "missing_auth_token", ...availability });
  }
  return { accountSid, authToken };
}

export function getParentTwilioClient(): ParentTwilioClient {
  const request = async (url: string, init?: RequestInit) => {
    const credentials = parentCredentials();
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
    async getSubaccount(subaccountSid) {
      // Credential recovery is intentionally authenticated exactly as Twilio's
      // Accounts API documents: parent Account SID + parent Auth Token. Normal
      // provisioning continues to prefer the Main API key.
      const recovery = parentRecoveryCredentials();
      const availability = { hasAccountSid: true, hasAuthToken: true };
      if (!/^AC[0-9a-f]{32}$/i.test(subaccountSid)) {
        throw new TwilioRemediationError("twilio_recovery", { category: "invalid_request_construction", ...availability });
      }
      let url: URL;
      try {
        url = new URL(`/2010-04-01/Accounts/${encodeURIComponent(subaccountSid)}.json`, "https://api.twilio.com");
      } catch (error) {
        throw new TwilioRemediationError("twilio_recovery", {
          category: "invalid_request_construction",
          errorName: safeErrorName(error),
          ...availability,
        });
      }
      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Basic ${Buffer.from(`${recovery.accountSid}:${recovery.authToken}`).toString("base64")}`,
          },
          cache: "no-store",
        });
      } catch (error) {
        throw new TwilioRemediationError("twilio_recovery", {
          category: "network_fetch_exception",
          errorName: safeErrorName(error),
          ...availability,
        });
      }
      let value: TwilioAccount & { code?: number };
      try {
        value = await response.json() as TwilioAccount & { code?: number };
      } catch (error) {
        throw new TwilioRemediationError("twilio_recovery", {
          category: "json_parsing_failure",
          providerStatus: response.status,
          errorName: safeErrorName(error),
          ...availability,
        });
      }
      const providerCode = typeof value.code === "number" ? value.code : null;
      if (!response.ok) {
        throw new TwilioRemediationError("twilio_recovery", {
          category: "twilio_http_error",
          providerStatus: response.status,
          providerCode,
          ...availability,
        });
      }
      if (!value.auth_token) {
        throw new TwilioRemediationError("twilio_recovery", {
          category: "missing_auth_token_response",
          providerStatus: response.status,
          providerCode,
          ...availability,
        });
      }
      return value;
    },
    async createSubaccount(friendlyName) {
      const value = await request("https://api.twilio.com/2010-04-01/Accounts.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ FriendlyName: friendlyName }),
      });
      if (!value.sid) throw new Error("Twilio created no identifiable subaccount.");
      // Keep auth_token only in this server-side return value so the caller can put
      // it directly into Vault. It is never included in BusinessTwilioContext.
      return { sid: value.sid, friendly_name: value.friendly_name, status: value.status, auth_token:value.auth_token };
    },
  };
}

function supabaseRepository(): BusinessTwilioRepository {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Server-side Twilio provisioning storage is unavailable.");
  const select = "id,business_id,twilio_subaccount_sid,twilio_subaccount_friendly_name,twilio_subaccount_status,provisioning_status,provisioning_error,created_at,updated_at,last_synced_at,webhook_secret_status,webhook_secret_version,webhook_secret_updated_at";
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
    async markWebhookSecretError(id){const {error}=await db.from("business_twilio_accounts").update({webhook_secret_status:"error",webhook_secret_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);if(error)throw new Error("Twilio webhook security state could not be saved.");},
  };
}

export function createBusinessTwilioProvider(dependencies: { repository: BusinessTwilioRepository; parentClient: ParentTwilioClient; secretStore:SubaccountWebhookSecretResolver }) {
  const { repository, parentClient, secretStore } = dependencies;
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
      if(!account.auth_token)throw new Error("Twilio returned no recoverable webhook credential.");
      try{await secretStore.storeSubaccountAuthToken({businessId,subaccountSid:account.sid,authToken:account.auth_token});}catch{await repository.markWebhookSecretError(row.id);throw new Error("Secure Twilio credential storage failed.");}
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
  return createBusinessTwilioProvider({ repository: supabaseRepository(), parentClient: getParentTwilioClient(),secretStore:getSubaccountWebhookSecretResolver() }).createBusinessTwilioSubaccount(businessId);
}

export async function getOrCreateBusinessTwilioSubaccount(businessId: string) {
  const existing = await getBusinessTwilioContext(businessId);
  if (existing?.subaccountSid) return existing;
  return createBusinessTwilioProvider({ repository: supabaseRepository(), parentClient: getParentTwilioClient(),secretStore:getSubaccountWebhookSecretResolver() }).getOrCreateBusinessTwilioSubaccount(businessId);
}

export async function reconcileExistingBusinessTwilioSecret(deps:{repository:BusinessTwilioRepository;parentClient:ParentTwilioClient;secretStore:SubaccountWebhookSecretResolver},businessId:string){
 const row=await deps.repository.getAccount(businessId);if(!row?.twilio_subaccount_sid)throw new Error("Business Twilio subaccount not found.");
 let account:TwilioAccount;try{account=await deps.parentClient.getSubaccount(row.twilio_subaccount_sid);}catch(error){if(error instanceof TwilioRemediationError)throw error;throw new TwilioRemediationError("twilio_recovery",{category:"unexpected_recovery_error",errorName:safeErrorName(error)});}if(account.sid!==row.twilio_subaccount_sid)throw new TwilioRemediationError("twilio_recovery",{category:"subaccount_sid_mismatch"});if(!account.auth_token)throw new TwilioRemediationError("twilio_recovery",{category:"missing_auth_token_response"});
 let metadata;try{metadata=await deps.secretStore.storeSubaccountAuthToken({businessId,subaccountSid:account.sid,authToken:account.auth_token});}catch(error){throw new TwilioRemediationError("vault_storage",{category:"vault_storage_error",errorName:safeErrorName(error)});}
 return{subaccountSid:account.sid,webhookSecretStatus:metadata.status,webhookSecretVersion:metadata.version,webhookSecretUpdatedAt:metadata.updatedAt};
}
export const reconcileBusinessTwilioWebhookSecret=(businessId:string)=>reconcileExistingBusinessTwilioSecret({repository:supabaseRepository(),parentClient:getParentTwilioClient(),secretStore:getSubaccountWebhookSecretResolver()},businessId);

// Server-only rotation primitive. No route intentionally exposes this in Phase 2.5.
// Twilio creates a secondary token and promotes it; only the promoted value is put
// into Vault. If Vault fails, the parent Accounts API can reconcile the current token.
export async function rotateExistingBusinessTwilioSecret(deps:{repository:BusinessTwilioRepository;parentClient:ParentTwilioClient;secretStore:SubaccountWebhookSecretResolver},businessId:string){
 const row=await deps.repository.getAccount(businessId);if(!row?.twilio_subaccount_sid)throw new Error("Business Twilio subaccount not found.");const sid=row.twilio_subaccount_sid,current=await deps.secretStore.getSubaccountAuthToken({businessId,subaccountSid:sid});if(!current)throw new Error("Current Twilio webhook credential is unavailable.");
 const request=async(url:string,token:string,method="POST")=>{const response=await fetch(url,{method,headers:{Authorization:`Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`},cache:"no-store"});const value=await response.json().catch(()=>({})) as {secondary_auth_token?:string;auth_token?:string};if(!response.ok)throw new Error("Twilio credential rotation failed.");return value;};
 const secondary=await request("https://accounts.twilio.com/v1/AuthTokens/Secondary",current);if(!secondary.secondary_auth_token)throw new Error("Twilio returned no secondary credential.");
 try{const promoted=await request("https://accounts.twilio.com/v1/AuthTokens/Promote",current);if(!promoted.auth_token)throw new Error("Twilio returned no promoted credential.");return await deps.secretStore.rotateSubaccountAuthToken({businessId,subaccountSid:sid,authToken:promoted.auth_token});}catch(error){try{await request("https://accounts.twilio.com/v1/AuthTokens/Secondary",current,"DELETE");}catch{}throw error;}
}
