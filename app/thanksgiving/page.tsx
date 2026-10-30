import type {Metadata} from "next";
import {ThanksgivingLanding} from "@/components/ThanksgivingLanding";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Thanksgiving Inflatable Rentals | Copper State Bounce",description:"Keep the kids entertained all Thanksgiving weekend. Copper State Bounce delivers your inflatable Wednesday and picks it up Friday."};
export default function ThanksgivingPage(){return <ThanksgivingLanding/>;}
