export type MetaStandardEvent="ViewContent"|"InitiateCheckout"|"Purchase";

export function createMetaEventId(event:MetaStandardEvent){
 return `${event.toLowerCase()}-${crypto.randomUUID()}`;
}
