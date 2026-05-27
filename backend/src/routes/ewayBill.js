import { Router } from "express";
import { callEwayBillApi, parseEwayBillResult } from "../services/ewayBillClient.js";
import { fetchEwayBillDetails } from "../services/fetchEwayBill.js";
import { buildEwayBillPdfBuffer } from "../services/ewayBillPdfFlow.js";
import { renderEwayBillHtml } from "../services/ewayBillHtml.js";
import { logger } from "../utils/logger.js";
import { updatePartBVehicle } from "../services/updatePartB.js";
import { EWB_INCORRECT_MESSAGE, validateEwbNumber } from "../utils/ewbNumber.js";

const router = Router();

function getEwbToken(req) {
  return req.headers.authorization?.trim();
}

function validateExtendBody(body, ewbNo) {
  const required = [
    "fromPlace",
    "fromState",
    "fromPincode",
    "remainingDistance",
    "transMode",
    "extnRsnCode",
    "extnRemarks",
  ];
  for (const field of required) {
    if (body[field] === undefined || body[field] === "") {
      return `${field} is required`;
    }
  }
  const ewbError = validateEwbNumber(ewbNo);
  if (ewbError) return ewbError;
  if (
    body.transDocDate &&
    !/^[0-3][0-9]\/[0-1][0-9]\/[2][0][0-9]{2}$/.test(body.transDocDate)
  ) {
    return "transDocDate must be DD/MM/YYYY";
  }
  return null;
}

function buildExtendPayload(body, ewbNo) {
  const payload = {
    ewbNo: Number(body.ewbNo ?? ewbNo),
    fromPlace: String(body.fromPlace).trim(),
    fromState: Number(body.fromState),
    fromPincode: Number(body.fromPincode),
    remainingDistance: Number(body.remainingDistance),
    transMode: String(body.transMode).trim(),
    extnRsnCode: Number(body.extnRsnCode),
    extnRemarks: String(body.extnRemarks).trim(),
  };

  if (body.vehicleNo?.trim()) payload.vehicleNo = body.vehicleNo.trim().toUpperCase();
  if (body.transDocNo?.trim()) payload.transDocNo = body.transDocNo.trim();
  if (body.transDocDate?.trim()) payload.transDocDate = body.transDocDate.trim();
  if (body.consignmentStatus?.trim()) payload.consignmentStatus = body.consignmentStatus.trim();
  if (body.transitType?.trim()) payload.transitType = body.transitType.trim();
  if (body.addressLine1?.trim()) payload.addressLine1 = body.addressLine1.trim();
  if (body.addressLine2?.trim()) payload.addressLine2 = body.addressLine2.trim();
  if (body.addressLine3?.trim()) payload.addressLine3 = body.addressLine3.trim();

  return payload;
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

router.post("/:ewbNo/extend", async (req, res) => {
  const ewbToken = getEwbToken(req);
  if (!ewbToken) {
    return res.status(401).json({
      message: "E-Way Bill access token required in Authorization header",
    });
  }

  const { ewbNo } = req.params;
  const validationError = validateExtendBody(req.body, ewbNo);
  if (validationError) {
    logger.warn("eway-bill", "Extend validation failed", { reason: validationError });
    return res.status(400).json({ message: validationError });
  }

  const payload = buildExtendPayload(req.body, ewbNo);

  try {
    const { response, data } = await callEwayBillApi({
      method: "POST",
      path: `/gst/compliance/e-way-bill/consignor/bill/${ewbNo}/extend`,
      ewbAccessToken: ewbToken,
      body: payload,
    });

    const { ok, errorCode, result } = parseEwayBillResult(data);

    if (!response.ok) {
      return res.status(response.status).json({
        message: data.message || "Failed to extend validity",
        details: data,
      });
    }

    if (!ok) {
      return res.status(400).json({
        message: errorCode
          ? `Extension failed (error ${String(errorCode).replace(/,$/, "")})`
          : "Failed to extend e-Way Bill validity",
        details: data,
      });
    }

    return res.json({
      ewayBillNo: result?.data?.ewayBillNo,
      updatedDate: result?.data?.updatedDate,
      validUpto: result?.data?.validUpto,
      alert: result?.alert,
      transaction_id: data.transaction_id,
      pdfUrl: `/api/eway-bill/${ewbNo}/pdf`,
    });
  } catch (err) {
    logger.error("eway-bill", "Extend validity error", { message: err.message });
    return res.status(err.status || 502).json({
      message: err.message || "Unable to extend validity",
    });
  }
});

export default router;
