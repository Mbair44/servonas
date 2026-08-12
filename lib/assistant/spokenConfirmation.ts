export type SpokenConfirmationIntent="confirm"|"reject"|"ambiguous"|"none";

const normalize=(value:string)=>value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").trim();
const positive=new Set(["yes","yep","yeah","correct","confirm","confirmed","go ahead","do it","proceed","sounds good","yes please"]);
const negative=new Set(["no","nope","cancel","cancel it","dont","do not","never mind","nevermind","stop","reject"]);
const ambiguous=new Set(["maybe","i think so","probably","sure i guess","what happens if i do","which invoice was that","wait"]);

export function classifySpokenConfirmation(input:string):SpokenConfirmationIntent{const value=normalize(input);if(positive.has(value))return"confirm";if(negative.has(value))return"reject";if(ambiguous.has(value)||value.endsWith("?"))return"ambiguous";return"none";}
export const spokenConfirmationPhrases={positive:[...positive],negative:[...negative]};
