type Message={id:string;direction:string;body:string;ai_generated:boolean;delivery_status:string;created_at:string};
export function MissedCallTranscript({messages,timeZone,title="Missed-call conversation"}:{messages:Message[];timeZone:string;title?:string}){
 if(!messages.length)return null;
 return <section className="workspace-panel missed-call-record-transcript"><div className="panel-title"><div><span className="sv-kicker">Lead recovery</span><h2>{title}</h2></div><b>{messages.length} messages</b></div><div className="missed-call-transcript">{messages.map(message=><div className={message.direction} key={message.id}><span>{message.direction}{message.ai_generated?" · AI":""}</span><p>{message.body}</p><small>{message.delivery_status} · {new Intl.DateTimeFormat("en-US",{dateStyle:"short",timeStyle:"short",timeZone}).format(new Date(message.created_at))}</small></div>)}</div></section>;
}
