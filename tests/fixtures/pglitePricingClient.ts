/** Minimal Supabase-shaped adapter for running the real pricing services against PostgreSQL. */
export function pricingTestClient(db:any){
 return {
  async rpc(name:string,args:Record<string,unknown>){
   try{const values=Object.values(args),result=await db.query(`select ${name}(${values.map((_,i)=>`$${i+1}`).join(',')}) as data`,values);return {data:result.rows[0].data,error:null};}catch(error){return {data:null,error};}
  },
  from(table:string){
   let operation="select",row:Record<string,unknown>={},single=false,columns="*";
   const filters:[string,unknown][]=[];
   const q:any={select(value="*"){columns=value;return q;},eq(key:string,value:unknown){filters.push([key,value]);return q;},order(){return q;},insert(value:Record<string,unknown>){operation="insert";row=value;return q;},update(value:Record<string,unknown>){operation="update";row=value;return q;},delete(){operation="delete";return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},then(resolve:any,reject:any){return execute().then(resolve,reject);}};
   async function execute(){
    try{
     const params:unknown[]=[],bind=(value:unknown)=>{params.push(value);return `$${params.length}`;};
     let sql:string;
     if(operation==="insert")sql=`insert into ${table}(${Object.keys(row).join(',')}) values(${Object.values(row).map(bind).join(',')})`;
     else if(operation==="update")sql=`update ${table} set ${Object.entries(row).map(([key,value])=>`${key}=${bind(value)}`).join(',')}`;
     else sql=operation==="delete"?`delete from ${table}`:`select * from ${table}`;
     if(filters.length)sql+=` where ${filters.map(([key,value])=>`${key}=${bind(value)}`).join(' and ')}`;
     if(operation!=="select")sql+=' returning *';
     const result=await db.query(sql,params);
     if(table==="bookings"&&columns.includes("booking_items("))for(const booking of result.rows)booking.booking_items=(await db.query("select * from booking_items where booking_id=$1",[booking.id])).rows;
     return {data:single?result.rows[0]??null:result.rows,error:null};
    }catch(error){return {data:null,error};}
   }
   return q;
  }
 } as any;
}
