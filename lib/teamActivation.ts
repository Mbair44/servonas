export type TeamActivationCounts={
 total:number;active:number;withoutEmail:number;notInvited:number;pending:number;
 accepted:number;expired:number;failed:number;missingRoles:number;
};

export function teamActivationNeedsAttention(counts:TeamActivationCounts){
 return counts.withoutEmail+counts.notInvited+counts.expired+counts.failed+counts.missingRoles;
}
