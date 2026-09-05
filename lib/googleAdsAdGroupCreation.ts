export class GoogleAdsAdGroupCreationError extends Error{
 readonly stage:"mutation"|"mutation_no_resource"|"verification";
 readonly googleRequestId:string|null;
 constructor(message:string,stage:"mutation"|"mutation_no_resource"|"verification",googleRequestId:string|null=null){super(message);this.name="GoogleAdsAdGroupCreationError";this.stage=stage;this.googleRequestId=googleRequestId;}
}

export async function confirmGoogleAdsAdGroupCreation<TMutation extends {adGroupId:string|null;adGroupResourceName:string|null;googleRequestId?:string|null},TVerification>(operations:{mutate:()=>Promise<TMutation>;verify:(mutation:TMutation)=>Promise<TVerification|null>}){
 const mutation=await operations.mutate();
 if(!mutation.adGroupId||!mutation.adGroupResourceName)throw new GoogleAdsAdGroupCreationError("Google Ads returned no created ad-group resource.","mutation_no_resource",mutation.googleRequestId??null);
 const verification=await operations.verify(mutation);
 if(!verification)throw new GoogleAdsAdGroupCreationError("Google Ads accepted the mutation, but the new ad group could not be read back.","verification",mutation.googleRequestId??null);
 return {mutation,verification};
}

export async function createGoogleAdsAdGroupsIndividually<T,R>(items:T[],createOne:(item:T,index:number)=>Promise<R>){
 return Promise.all(items.map(async(item,index)=>{try{return {index,item,ok:true as const,result:await createOne(item,index),error:null};}catch(error){return {index,item,ok:false as const,result:null,error};}}));
}
