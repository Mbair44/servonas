"use client";
import {useState} from "react";
import type {SalesPeriod,SalesRange} from "@/lib/financial/salesPerformance";
import styles from "./SalesPerformance.module.css";
export function SalesPerformanceFilters({period,range,today,action}:{period:SalesPeriod;range:SalesRange;today:string;action:string}){
 const [selected,setSelected]=useState(period);
 return <form action={`${action}#sales-performance`} method="get" className={styles.filters}>
  <label>Show revenue for<select name="salesPeriod" value={selected} onChange={event=>setSelected(event.target.value as SalesPeriod)}><option value="this_month">This Month</option><option value="last_month">Last Month</option><option value="last_90_days">Last 90 Days</option><option value="this_year">This Year</option><option value="custom">Custom</option></select></label>
  {selected==="custom"&&<><label>From<input type="date" name="salesStart" required min="2000-01-01" max={today} defaultValue={range.start}/></label><label>Through<input type="date" name="salesEnd" required min="2000-01-01" max={today} defaultValue={range.end}/></label></>}
  <button className="sv-button sv-secondary" type="submit">Apply</button>
 </form>;
}
