type TemporarySiteUnavailableProps={domain:string;title?:string;message?:string;logoUrl?:string|null;businessName?:string|null};

export function TemporarySiteUnavailable({domain,title="This page is temporarily unavailable.",message="Please try again in a few minutes.",logoUrl=null,businessName=null}:TemporarySiteUnavailableProps){
 return (
  <main style={{position:"fixed",inset:0,zIndex:9999,minHeight:"100vh",display:"grid",placeItems:"center",padding:"32px 20px",background:"#f8fafc"}}>
   <section className="workspace-panel" style={{maxWidth:720,width:"100%",padding:"32px",textAlign:"center"}}>
    {logoUrl?<img src={logoUrl} alt={businessName?`${businessName} logo`:"Business logo"} style={{display:"block",maxWidth:180,maxHeight:96,margin:"0 auto 20px",objectFit:"contain"}}/>:businessName?<div style={{marginBottom:20,fontSize:"1.05rem",fontWeight:700,color:"#0f172a"}}>{businessName}</div>:null}
    <small style={{display:"block",marginBottom:12,color:"#64748b",fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase"}}>{domain}</small>
    <div style={{marginBottom:12,fontSize:"1rem",fontWeight:700,color:"#64748b"}}>404</div>
    <h1 style={{margin:"0 0 12px",fontSize:"clamp(2rem,4vw,3rem)",lineHeight:1.05,color:"#0f172a"}}>{title}</h1>
    <p style={{margin:"0 auto",maxWidth:520,fontSize:"1.1rem",lineHeight:1.7,color:"#475569"}}>{message}</p>
   </section>
  </main>
 );
}
