import {StripeCheckoutSuccess} from "@/components/StripeCheckoutSuccess";

export const dynamic="force-dynamic";

export default async function SuccessPage({searchParams}:{searchParams:Promise<{session_id?:string}>}){
 return <StripeCheckoutSuccess sessionId={(await searchParams).session_id}/>;
}
