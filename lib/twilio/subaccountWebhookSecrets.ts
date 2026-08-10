// Phase 2 deliberately defines the secret boundary without inventing storage.
// A future KMS/Vault-backed implementation can satisfy this interface. Returning
// null keeps tenant webhooks disabled and never falls back to the parent token.
export type SubaccountWebhookSecretResolver={getAuthToken(accountSid:string):Promise<string|null>};
export const getSubaccountWebhookSecretResolver=():SubaccountWebhookSecretResolver=>({async getAuthToken(){return null;}});
