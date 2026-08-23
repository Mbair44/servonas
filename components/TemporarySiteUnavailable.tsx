type TemporarySiteUnavailableProps={domain:string;title?:string;message?:string};

export function TemporarySiteUnavailable({domain,title="This website is temporarily unavailable.",message="Please try again in a few minutes."}:TemporarySiteUnavailableProps){
 return (
  <main className="workspace-shell" style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:"32px 20px",background:"#f8fafc"}}>
   <section className="workspace-panel" style={{maxWidth:720,width:"100%",padding:"32px",textAlign:"center"}}>
    <div className="sv-mark" style={{justifyContent:"center",marginBottom:20}}><span>Servonas</span></div>
    <small style={{display:"block",marginBottom:12,color:"#64748b",fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase"}}>{domain}</small>
    <h1 style={{margin:"0 0 12px",fontSize:"clamp(2rem,4vw,3rem)",lineHeight:1.05,color:"#0f172a"}}>{title}</h1>
    <p style={{margin:"0 auto",maxWidth:520,fontSize:"1.1rem",lineHeight:1.7,color:"#475569"}}>{message}</p>
   </section>
  </main>
 );
}
