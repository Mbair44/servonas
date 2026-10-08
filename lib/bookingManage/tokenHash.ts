import crypto from "node:crypto";

export const bookingManageTokenHash=(token:string)=>crypto.createHash("sha256").update(token).digest("hex");
