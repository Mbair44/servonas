export type PoolWeatherEventType="dust_storm"|"high_wind"|"heavy_rain"|"extreme_heat"|"freeze";
export type PoolWeatherEvent={id:string;type:PoolWeatherEventType;startsAt:string;endsAt:string;summary:string;windMph?:number;rainfallInches?:number;temperatureF?:number;areaLabel:string};
export interface PoolWeatherProvider{forecast(input:{startDate:string;endDate:string;areaLabel?:string}):Promise<PoolWeatherEvent[]>}

export class MockPoolWeatherProvider implements PoolWeatherProvider{
 async forecast(input:{startDate:string;endDate:string;areaLabel?:string}){
  const raw=process.env.POOL_WEATHER_MOCK_EVENTS;
  if(!raw)return [];
  try{return (JSON.parse(raw) as PoolWeatherEvent[]).filter(event=>event.startsAt.slice(0,10)>=input.startDate&&event.startsAt.slice(0,10)<=input.endDate);}
  catch{console.error("POOL_WEATHER_MOCK_EVENTS is not valid JSON");return []}
 }
}

export function poolWeatherProvider():PoolWeatherProvider{return new MockPoolWeatherProvider()}

export function eventQualifies(event:PoolWeatherEvent,settings:{wind_threshold_mph:number;rain_threshold_inches:number;heat_threshold_f:number;freeze_threshold_f:number}){
 if(event.type==="dust_storm")return true;
 if(event.type==="high_wind")return Number(event.windMph??0)>=settings.wind_threshold_mph;
 if(event.type==="heavy_rain")return Number(event.rainfallInches??0)>=settings.rain_threshold_inches;
 if(event.type==="extreme_heat")return Number(event.temperatureF??-999)>=settings.heat_threshold_f;
 return Number(event.temperatureF??999)<=settings.freeze_threshold_f;
}
