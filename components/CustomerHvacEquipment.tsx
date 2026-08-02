type Location={id:string;location_name:string|null;street_address:string};
type Equipment={id:string;equipment_type:string;name:string;manufacturer:string|null;model:string|null;serial_number:string|null;model_year:number|null;capacity_tons:number|null;fuel_type:string|null;refrigerant_type:string|null;filter_size:string|null;installed_on:string|null;warranty_expires_on:string|null;notes:string|null;service_location_id:string|null};
type Action=(data:FormData)=>void|Promise<void>;
const types=[["central_air","Central air conditioner"],["heat_pump","Heat pump"],["furnace","Furnace"],["mini_split","Mini-split"],["air_handler","Air handler"],["package_unit","Packaged unit"],["boiler","Boiler"],["thermostat","Thermostat"],["evaporative_cooler","Evaporative cooler"],["other","Other"]];
const label=(value:string)=>types.find(([key])=>key===value)?.[1]??value.replaceAll("_"," ");
const displayDate=(value:string|null)=>value?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`)):null;

function EquipmentFields({equipment,locations}:{equipment?:Equipment;locations:Location[]}){return <div className="customer-hvac-form-grid">
 <label>Equipment name<input required name="name" maxLength={150} defaultValue={equipment?.name??""} placeholder="Upstairs AC"/></label>
 <label>System type<select required name="equipmentType" defaultValue={equipment?.equipment_type??"central_air"}>{types.map(([value,name])=><option value={value} key={value}>{name}</option>)}</select></label>
 <label>Service location<select name="serviceLocationId" defaultValue={equipment?.service_location_id??""}><option value="">Customer-level / not assigned</option>{locations.map(location=><option value={location.id} key={location.id}>{location.location_name||location.street_address}</option>)}</select></label>
 <label>Manufacturer<input name="manufacturer" maxLength={150} defaultValue={equipment?.manufacturer??""} placeholder="Trane"/></label>
 <label>Model<input name="model" maxLength={150} defaultValue={equipment?.model??""}/></label>
 <label>Serial number<input name="serialNumber" maxLength={200} defaultValue={equipment?.serial_number??""}/></label>
 <label>Model year<input name="modelYear" type="number" min="1900" max="2200" defaultValue={equipment?.model_year??""}/></label>
 <label>Capacity (tons)<input name="capacityTons" type="number" min="0.25" max="100" step="0.25" defaultValue={equipment?.capacity_tons??""}/></label>
 <label>Fuel type<select name="fuelType" defaultValue={equipment?.fuel_type??""}><option value="">Not recorded</option><option value="electric">Electric</option><option value="natural_gas">Natural gas</option><option value="propane">Propane</option><option value="oil">Oil</option><option value="dual_fuel">Dual fuel</option><option value="other">Other</option></select></label>
 <label>Refrigerant<input name="refrigerantType" maxLength={50} defaultValue={equipment?.refrigerant_type??""} placeholder="R-410A"/></label>
 <label>Filter size<input name="filterSize" maxLength={100} defaultValue={equipment?.filter_size??""} placeholder="16 × 20 × 1"/></label>
 <label>Installed date<input name="installedOn" type="date" defaultValue={equipment?.installed_on??""}/></label>
 <label>Warranty expires<input name="warrantyExpiresOn" type="date" defaultValue={equipment?.warranty_expires_on??""}/></label>
 <label className="wide">Equipment notes<textarea name="notes" maxLength={3000} defaultValue={equipment?.notes??""} placeholder="Access, condition, service history, or other useful details"/></label>
 </div>}

export function CustomerHvacEquipment({equipment,locations,canEdit,createAction,updateAction,archiveAction}:{equipment:Equipment[];locations:Location[];canEdit:boolean;createAction:Action;updateAction:(id:string)=>Action;archiveAction:(id:string)=>Action}){
 return <section className="workspace-panel customer-hvac-equipment" id="hvac-equipment"><div className="panel-title"><div><h2>Home HVAC equipment</h2><span>{equipment.length} active unit{equipment.length===1?"":"s"}</span></div>{canEdit&&<AddCustomerHvacEquipmentDrawer locations={locations} action={createAction}/>}</div>
  {equipment.length?<div className="customer-hvac-list">{equipment.map(item=>{const location=locations.find(value=>value.id===item.service_location_id);return <article key={item.id}><header><i aria-hidden="true">❄</i><div><span>{label(item.equipment_type)}</span><h3>{item.name}</h3><p>{[item.model_year,item.manufacturer,item.model].filter(Boolean).join(" ")||"Equipment details not recorded"}</p></div></header><dl><div><dt>Serial</dt><dd>{item.serial_number||"—"}</dd></div><div><dt>Location</dt><dd>{location?.location_name||location?.street_address||"Not assigned"}</dd></div><div><dt>Capacity</dt><dd>{item.capacity_tons?`${item.capacity_tons} ton`:"—"}</dd></div><div><dt>Filter</dt><dd>{item.filter_size||"—"}</dd></div><div><dt>Fuel / refrigerant</dt><dd>{[item.fuel_type?.replaceAll("_"," "),item.refrigerant_type].filter(Boolean).join(" · ")||"—"}</dd></div><div><dt>Installed / warranty</dt><dd>{[displayDate(item.installed_on),item.warranty_expires_on?`Warranty to ${displayDate(item.warranty_expires_on)}`:null].filter(Boolean).join(" · ")||"—"}</dd></div></dl>{item.notes&&<p className="customer-hvac-notes">{item.notes}</p>}{canEdit&&<details className="customer-hvac-edit"><summary>Edit equipment</summary><form action={updateAction(item.id)}><EquipmentFields equipment={item} locations={locations}/><div><button className="sv-button">Save changes</button><button className="text-button danger" formAction={archiveAction(item.id)}>Remove equipment</button></div></form></details>}</article>})}</div>:<div className="dashboard-empty"><strong>No HVAC equipment recorded</strong><p>Add the customer’s air conditioner, furnace, heat pump, thermostat, or other installed system.</p></div>}
 </section>;
}
import {AddCustomerHvacEquipmentDrawer} from "./AddCustomerHvacEquipmentDrawer";
