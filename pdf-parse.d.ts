declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
  }
  function pdf(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdf;
}
