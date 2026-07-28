export type Recurrence={unit:"day"|"week"|"month"|"year";interval:number};
export function parseRecurrence(value:string):{value:Recurrence|null;warning:string|null}{
 const normalized=value.toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();if(!normalized)return{value:null,warning:null};
 const exact:Record<string,Recurrence>={daily:{unit:"day",interval:1},weekly:{unit:"week",interval:1},biweekly:{unit:"week",interval:2},fortnightly:{unit:"week",interval:2},monthly:{unit:"month",interval:1},quarterly:{unit:"month",interval:3},annual:{unit:"year",interval:1},annually:{unit:"year",interval:1},yearly:{unit:"year",interval:1}};
 if(exact[normalized])return{value:exact[normalized],warning:null};
 if(["bimonthly","semi monthly","twice monthly"].includes(normalized))return{value:null,warning:`“${value}” is ambiguous. Choose the intended schedule before importing it.`};
 const match=normalized.match(/^every (\d{1,3}) (day|days|week|weeks|month|months|year|years)$/);if(match){const interval=Number(match[1]),unit=match[2].replace(/s$/,"") as Recurrence["unit"];if(interval>=1&&interval<=120)return{value:{unit,interval},warning:null};}
 return{value:null,warning:`Servonas does not recognize the recurrence “${value}.” The customer can still be imported without it.`};
}
