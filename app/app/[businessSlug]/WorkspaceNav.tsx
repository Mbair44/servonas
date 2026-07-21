import Link from "next/link";
import { signOut } from "@/app/auth/actions";
export function WorkspaceNav({slug,name}:{slug:string;name:string}){
 const base=`/app/${slug}`;
 return <aside className="epic3-sidebar"><Link href={base} className="epic3-brand"><img src="/servonas-logo-light.svg" alt="Servonas"/></Link><small>{name}</small><nav><Link href={base}>Dashboard</Link><Link href={`${base}/customers`}>Customers</Link><Link href={`${base}/jobs`}>Jobs</Link><Link href={`${base}/booking`}>Online booking</Link><span>Inventory <em>Soon</em></span><Link href={`${base}#team`}>Team</Link><Link href={`${base}/settings`}>Settings</Link></nav><form action={signOut}><button className="workspace-logout">Log out</button></form></aside>
}
