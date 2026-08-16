export type RentalReservationWindow={startsAt:Date;endsAt:Date;quantity:number};
export type RentalCalendarDayStatus={available:boolean;reason?:"reserved"|"blocked"};

export function rentalWindowsOverlap(leftStart:Date,leftEnd:Date,rightStart:Date,rightEnd:Date){
 return leftStart.getTime()<rightEnd.getTime()&&rightStart.getTime()<leftEnd.getTime();
}

export function resolveRentalCalendarDayAvailability(input:{
 openingStart:Date;
 openingEnd:Date;
 rentalDurationMinutes:number;
 turnaroundMinutes:number;
 stockQuantity:number;
 requestedQuantity:number;
 hardBlocked:boolean;
 reservations:RentalReservationWindow[];
 businessBlackouts:Array<{startsAt:Date;endsAt:Date}>;
}) : RentalCalendarDayStatus{
 if(input.hardBlocked)return {available:false,reason:"blocked"};
 const duration=Math.max(30,input.rentalDurationMinutes)*60_000;
 const step=30*60_000;
 const openingStart=input.openingStart.getTime(),openingEnd=input.openingEnd.getTime();
 if(openingEnd<=openingStart||openingEnd-openingStart<duration)return {available:false,reason:"blocked"};
 for(let startsAt=openingStart;startsAt+duration<=openingEnd;startsAt+=step){
  const candidateStart=new Date(startsAt),candidateEnd=new Date(startsAt+duration);
  if(input.businessBlackouts.some(window=>rentalWindowsOverlap(candidateStart,candidateEnd,window.startsAt,window.endsAt)))continue;
  const reserved=input.reservations.reduce((total,reservation)=>{
   const bufferedEnd=new Date(reservation.endsAt.getTime()+Math.max(0,input.turnaroundMinutes)*60_000);
   return total+(rentalWindowsOverlap(candidateStart,candidateEnd,reservation.startsAt,bufferedEnd)?reservation.quantity:0);
  },0);
  if(Math.max(0,input.stockQuantity-reserved)>=Math.max(1,input.requestedQuantity))return {available:true};
 }
 return {available:false,reason:input.businessBlackouts.length?"blocked":"reserved"};
}
