"use client";
import {useFormStatus} from "react-dom";

export default function RouteCalculationSubmit({recalculate=false}:{recalculate?:boolean}){
 const {pending}=useFormStatus();
 return <><button className="sv-button" type="submit" disabled={pending} aria-disabled={pending}>{pending?"Calculating routes…":recalculate?"Recalculate roads":"Calculate road routes"}</button>{pending&&<div className="route-calculation-overlay" role="status" aria-live="assertive" aria-busy="true"><section><span className="route-calculation-spinner" aria-hidden="true"/><h2>Calculating road routes</h2><p>Servonas is checking road travel, stop order, mileage, and estimated drive time. Please keep this page open.</p></section></div>}</>;
}
