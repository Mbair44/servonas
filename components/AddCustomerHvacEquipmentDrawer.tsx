"use client";

import {useCallback,useState} from "react";
import {ManagementDrawer} from "./ManagementDrawer";

type Location={id:string;location_name:string|null;street_address:string};
type Action=(data:FormData)=>void|Promise<void>;
const types=[["central_air","Central air conditioner"],["heat_pump","Heat pump"],["furnace","Furnace"],["mini_split","Mini-split"],["air_handler","Air handler"],["package_unit","Packaged unit"],["boiler","Boiler"],["thermostat","Thermostat"],["evaporative_cooler","Evaporative cooler"],["other","Other"]];

export function AddCustomerHvacEquipmentDrawer({locations,action}:{locations:Location[];action:Action}){
 const [open,setOpen]=useState(false),close=useCallback(()=>setOpen(false),[]);
 return <>
  <button type="button" className="sv-button sv-secondary" onClick={()=>setOpen(true)}>＋ Add equipment</button>
  <ManagementDrawer open={open} title="Add HVAC equipment" subtitle="Record equipment installed at this customer’s property." size="wide" onDirty={()=>{}} onClose={close}>
   <form action={action} className="customer-hvac-drawer-form"><div className="customer-hvac-form-grid">
    <label>Equipment name<input required name="name" maxLength={150} placeholder="Upstairs AC"/></label>
    <label>System type<select required name="equipmentType" defaultValue="central_air">{types.map(([value,name])=><option value={value} key={value}>{name}</option>)}</select></label>
    <label>Service location<select name="serviceLocationId" defaultValue=""><option value="">Customer-level / not assigned</option>{locations.map(location=><option value={location.id} key={location.id}>{location.location_name||location.street_address}</option>)}</select></label>
    <label>Manufacturer<input name="manufacturer" maxLength={150} placeholder="Trane"/></label>
    <label>Model<input name="model" maxLength={150}/></label>
    <label>Serial number<input name="serialNumber" maxLength={200}/></label>
    <label>Model year<input name="modelYear" type="number" min="1900" max="2200"/></label>
    <label>Capacity (tons)<input name="capacityTons" type="number" min="0.25" max="100" step="0.25"/></label>
    <label>Fuel type<select name="fuelType" defaultValue=""><option value="">Not recorded</option><option value="electric">Electric</option><option value="natural_gas">Natural gas</option><option value="propane">Propane</option><option value="oil">Oil</option><option value="dual_fuel">Dual fuel</option><option value="other">Other</option></select></label>
    <label>Refrigerant<input name="refrigerantType" maxLength={50} placeholder="R-410A"/></label>
    <label>Filter size<input name="filterSize" maxLength={100} placeholder="16 × 20 × 1"/></label>
    <label>Installed date<input name="installedOn" type="date"/></label>
    <label>Warranty expires<input name="warrantyExpiresOn" type="date"/></label>
    <label className="wide">Equipment notes<textarea name="notes" maxLength={3000} placeholder="Access, condition, service history, or other useful details"/></label>
   </div><footer><button type="button" className="sv-button sv-secondary" onClick={close}>Cancel</button><button className="sv-button">Add equipment</button></footer></form>
  </ManagementDrawer>
 </>;
}
