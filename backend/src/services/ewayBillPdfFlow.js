import { fetchEwayBillDetails } from "./fetchEwayBill.js";
import { generateEwayBillPdf } from "./ewayBillPdf.js";
import { logger } from "../utils/logger.js";

export async function buildEwayBillPdfBuffer(ewbNo, ewbAccessToken) {
  logger.info("eway-pdf", "Fetching bill for PDF", { ewbNo });
  const bill = await fetchEwayBillDetails(ewbNo, ewbAccessToken);
  logger.info("eway-pdf", "Generating PDF", { ewbNo });
  const pdf = await generateEwayBillPdf(bill);
  return { bill, pdf };
}
