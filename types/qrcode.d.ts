declare module "qrcode" {
  type QrOptions = { type?: "svg" | "png"; margin?: number; width?: number };
  const QRCode: {
    toString(text: string, options: QrOptions): Promise<string>;
    toBuffer(text: string, options: QrOptions): Promise<Buffer>;
  };
  export default QRCode;
}
