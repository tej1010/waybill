import { buildEwayBillPdfBuffer } from "../services/ewayBillPdfFlow.js";
import { getAccessToken } from "./whatsappApi.js";
import { logger } from "../utils/logger.js";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";

export async function sendEwayBillPdf(to, ewbNo, ewbAccessToken) {
  const token = getAccessToken();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp not configured");
  }

  const { pdf } = await buildEwayBillPdfBuffer(ewbNo, ewbAccessToken);
  const filename = `eway-bill-${ewbNo}.pdf`;

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([pdf], { type: "application/pdf" }), filename);

  const uploadUrl = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/media`;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const uploadData = await uploadRes.json().catch(() => ({}));

  if (!uploadRes.ok || !uploadData.id) {
    logger.error("whatsapp", "PDF media upload failed", { uploadData });
    throw new Error(uploadData.error?.message || "Failed to upload PDF to WhatsApp");
  }

  const sendUrl = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;
  const sendRes = await fetch(sendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\D/g, ""),
      type: "document",
      document: {
        id: uploadData.id,
        filename,
        caption: `E-Way Bill ${ewbNo} — updated Part B`,
      },
    }),
  });

  const sendData = await sendRes.json().catch(() => ({}));

  if (!sendRes.ok) {
    logger.error("whatsapp", "PDF send failed", { sendData });
    throw new Error(sendData.error?.message || "Failed to send PDF");
  }

  logger.info("whatsapp", "◀ PDF sent on WhatsApp", { to, ewbNo, mediaId: uploadData.id });
  return sendData;
}
