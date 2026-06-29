import { Router } from "express";
import { fetchEwayBillDetails } from "../services/fetchEwayBill.js";
import { buildEwayBillPdfBuffer } from "../services/ewayBillPdfFlow.js";
import { renderEwayBillHtml } from "../services/ewayBillHtml.js";
import { recordEwbOperation } from "../db/ewbOperations.js";
import { logger } from "../utils/logger.js";
import { userContextFromRequest } from "../utils/requestUser.js";
import { extendEwayBillValidity } from "../services/extendValidity.js";
import { updatePartBVehicle } from "../services/updatePartB.js";
import { updateTransporter } from "../services/updateTransporter.js";
import { EWB_INCORRECT_MESSAGE, validateEwbNumber } from "../utils/ewbNumber.js";

const router = Router();

function getEwbToken(req) {
  return req.headers.authorization?.trim();
}

router.get("/:ewbNo/html", async (req, res) => {
  const ewbError = validateEwbNumber(req.params.ewbNo);
  if (ewbError) return res.status(400).json({ message: ewbError });

  const ewbToken = getEwbToken(req);
  if (!ewbToken) {
    return res.status(401).json({ message: "E-Way Bill access token required" });
  }

  try {
    const bill = await fetchEwayBillDetails(req.params.ewbNo, ewbToken);
    const html = await renderEwayBillHtml(bill);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    return res.status(err.status || 502).json({
      message: err.message || "Failed to render HTML",
      details: err.data,
    });
  }
});

router.get("/:ewbNo/pdf", async (req, res) => {
  const { ewbNo } = req.params;
  const ewbError = validateEwbNumber(ewbNo);
  if (ewbError) return res.status(400).json({ message: ewbError });

  const ewbToken = getEwbToken(req);
  if (!ewbToken) {
    return res.status(401).json({ message: "E-Way Bill access token required" });
  }

  try {
    const { pdf } = await buildEwayBillPdfBuffer(ewbNo, ewbToken);
    const filename = `eway-bill-${ewbNo}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdf);
  } catch (err) {
    logger.error("eway-pdf", "PDF generation failed", { message: err.message, ewbNo });
    return res.status(err.status || 502).json({
      message: err.message || "Failed to generate PDF",
      details: err.data,
    });
  }
});

router.get("/:ewbNo", async (req, res) => {
  const ewbError = validateEwbNumber(req.params.ewbNo);
  if (ewbError) return res.status(400).json({ message: ewbError });

  const ewbToken = getEwbToken(req);
  if (!ewbToken) {
    return res.status(401).json({ message: "E-Way Bill access token required" });
  }

  try {
    const bill = await fetchEwayBillDetails(req.params.ewbNo, ewbToken);
    return res.json({ bill });
  } catch (err) {
    const notFound = err.status === 404 || err.status === 400;
    return res.status(err.status || 502).json({
      message: notFound ? EWB_INCORRECT_MESSAGE : err.message,
      details: err.data,
    });
  }
});

router.put("/:ewbNo/vehicle", async (req, res) => {
  const ewbToken = getEwbToken(req);
  if (!ewbToken) {
    return res.status(401).json({
      message: "E-Way Bill access token required in Authorization header",
    });
  }

  const { ewbNo } = req.params;

  try {
    const result = await updatePartBVehicle(ewbNo, ewbToken, req.body);

    let pdfGenerated = false;
    try {
      await buildEwayBillPdfBuffer(ewbNo, ewbToken);
      pdfGenerated = true;
    } catch (pdfErr) {
      logger.warn("eway-pdf", "PDF prefetch after update failed", {
        message: pdfErr.message,
        ewbNo,
      });
    }

    const user = userContextFromRequest(req);
    await recordEwbOperation({
      username: user.username,
      gstin: user.gstin,
      ewbNo,
      operationType: "part_b_update",
      source: "web",
    });

    return res.json({
      ...result,
      pdfUrl: `/api/eway-bill/${ewbNo}/pdf`,
      pdfGenerated,
    });
  } catch (err) {
    logger.error("eway-bill", "Update vehicle error", { message: err.message });
    return res.status(err.status || 502).json({
      message: err.message || "Unable to update vehicle details",
      details: err.data,
    });
  }
});

router.put("/:ewbNo/transporter", async (req, res) => {
  const ewbToken = getEwbToken(req);
  if (!ewbToken) {
    return res.status(401).json({
      message: "E-Way Bill access token required in Authorization header",
    });
  }

  const { ewbNo } = req.params;

  try {
    const result = await updateTransporter(ewbNo, ewbToken, req.body);

    let pdfGenerated = false;
    try {
      await buildEwayBillPdfBuffer(ewbNo, ewbToken);
      pdfGenerated = true;
    } catch (pdfErr) {
      logger.warn("eway-pdf", "PDF prefetch after transporter update failed", {
        message: pdfErr.message,
        ewbNo,
      });
    }

    const user = userContextFromRequest(req);
    await recordEwbOperation({
      username: user.username,
      gstin: user.gstin,
      ewbNo,
      operationType: "update_transporter",
      source: "web",
    });

    return res.json({
      ...result,
      pdfUrl: `/api/eway-bill/${ewbNo}/pdf`,
      pdfGenerated,
    });
  } catch (err) {
    logger.error("eway-bill", "Update transporter error", { message: err.message });
    return res.status(err.status || 502).json({
      message: err.message || "Unable to update transporter",
      details: err.data,
    });
  }
});

router.post("/:ewbNo/extend", async (req, res) => {
  const ewbToken = getEwbToken(req);
  if (!ewbToken) {
    return res.status(401).json({
      message: "E-Way Bill access token required in Authorization header",
    });
  }

  const { ewbNo } = req.params;

  try {
    const result = await extendEwayBillValidity(ewbNo, ewbToken, req.body);

    const user = userContextFromRequest(req);
    await recordEwbOperation({
      username: user.username,
      gstin: user.gstin,
      ewbNo,
      operationType: "extend_validity",
      source: "web",
    });

    return res.json({
      ...result,
      pdfUrl: `/api/eway-bill/${ewbNo}/pdf`,
    });
  } catch (err) {
    logger.error("eway-bill", "Extend validity error", { message: err.message });
    return res.status(err.status || 502).json({
      message: err.message || "Unable to extend validity",
      details: err.data,
    });
  }
});

export default router;
