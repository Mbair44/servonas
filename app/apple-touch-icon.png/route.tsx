import {ImageResponse} from "next/og";

export const runtime="edge";

export function GET(){
 return new ImageResponse(
  <div style={{display:"flex",width:"100%",height:"100%",alignItems:"center",justifyContent:"center",borderRadius:32,background:"white"}}>
   <svg width="168" height="168" viewBox="0 0 64 64">
    <defs><linearGradient id="g" x1="4" y1="8" x2="60" y2="56" gradientUnits="userSpaceOnUse"><stop stopColor="#2563eb"/><stop offset="1" stopColor="#22c7f2"/></linearGradient></defs>
    <path fill="url(#g)" d="M32 4c15.5 0 28 12.5 28 28S47.5 60 32 60C18 60 6.4 49.8 4.3 36.4h15.2A13 13 0 1 0 32 19h-8.4l9.5 9.5-8.8 8.8L0 13h32Z"/>
    <circle cx="32" cy="32" r="7" fill="#0b1739"/>
   </svg>
  </div>,
  {width:180,height:180},
 );
}
