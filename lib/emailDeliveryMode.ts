export const rentalEmailDeliveryIsLive=(
 mode=process.env.EMAIL_DELIVERY_MODE,
 nodeEnv=process.env.NODE_ENV,
)=>mode==="live"||(!mode&&nodeEnv==="production");
