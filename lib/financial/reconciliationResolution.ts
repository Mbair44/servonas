export const cancellationReasons=["customer_canceled","duplicate_booking","test_booking","entered_by_mistake","other"] as const;
export type CancellationReason=typeof cancellationReasons[number];

export function isCancellationReason(value:string):value is CancellationReason{
 return cancellationReasons.includes(value as CancellationReason);
}

/** The amount removed from future collection. Prior successful payments stay in the ledger. */
export function futureCollectibleRemoved(balanceDueCents:number){return Math.max(0,Math.trunc(balanceDueCents));}
