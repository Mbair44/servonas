type PageResult<T>={data:T[]|null;error:unknown|null};

/**
 * PostgREST limits an un-ranged response to its configured maximum (1,000 in
 * production). Analytics needs the complete, already tenant-scoped result
 * set before it calculates unique-session funnels.
 */
export async function loadAllPages<T>(loadPage:(from:number,to:number)=>PromiseLike<PageResult<T>>,pageSize=1000):Promise<PageResult<T>>{
 const rows:T[]=[];
 for(let from=0;;from+=pageSize){
  const response=await loadPage(from,from+pageSize-1);
  if(response.error)return {data:null,error:response.error};
  const page=response.data??[];
  rows.push(...page);
  if(page.length<pageSize)return {data:rows,error:null};
 }
}
