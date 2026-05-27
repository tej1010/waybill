import QRCode from "qrcode";
import bwipjs from "bwip-js";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { stateLabel } from "../constants/indianStates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, "../../templates/eway-bill.html");

const TRANS_MODE = { 1: "Road", 2: "Rail", 3: "Air", 4: "Ship" };
const TXN_TYPE = {
  1: "Regular",
  2: "Bill To - Ship To",
  3: "Bill From - Dispatch From",
  4: "Combination",
};

function formatEwbNo(ewbNo) {
  const digits = String(ewbNo ?? "").replace(/\D/g, "");
  return digits.match(/.{1,4}/g)?.join(" ") || digits;
}

function placeLine(place, stateCode, pincode) {
  const state = stateLabel(stateCode);
  const pin = pincode ? `-${pincode}` : "";
  return [place, state ? `${state}${pin}` : ""].filter(Boolean).join(", ");
}

function supplyReason(bill) {
  const type =
    bill.supplyType === "O" ? "Outward" : bill.supplyType === "I" ? "Inward" : bill.supplyType || "";
  const sub = (bill.subSupplyType || "").trim();
  const labels = {
    1: "Supply",
    3: "Export",
    4: "Job Work",
    5: "For Own Use",
    8: "SKD/CKD",
    9: "Recipient Not Known",
    10: "Exhibition or Fairs",
    11: "Line Sales",
    12: "Recipient Not Known",
  };
  const subLabel = labels[sub] || sub;
  return [type, subLabel].filter(Boolean).join(" - ") || "—";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hsnHtmlList(itemList = []) {
  if (!itemList.length) return "—";
  const items = itemList.map((item) => {
    const hsn = item.hsnCode ?? "";
    const desc = item.productDesc || item.productName || "";
    const qty = item.quantity != null ? ` - ${item.quantity}` : "";
    return `<li>${escapeHtml(`${hsn} ${desc}${qty}`.trim())}</li>`;
  });
  return `<ul class="hsn-list">${items.join("")}</ul>`;
}

function vehicleRowsHtml(vehicles = []) {
  if (!vehicles.length) {
    return `<tr><td colspan="8">No vehicle details</td></tr>`;
  }
  return vehicles
    .map((v) => {
      const mode = TRANS_MODE[v.transMode] || v.transMode || "—";
      const vehLine = v.vehicleNo
        ? v.vehicleNo
        : [v.transDocNo, v.transDocDate].filter(Boolean).join(" & ") || "—";
      return `<tr>
        <td>${escapeHtml(mode)}</td>
        <td>${escapeHtml(vehLine)}</td>
        <td>${escapeHtml(v.fromPlace || "—")}</td>
        <td>${escapeHtml(v.enteredDate || "—")}</td>
        <td>${escapeHtml(v.userGSTINTransin || "—")}</td>
        <td>${escapeHtml(v.tripshtNo ? String(v.tripshtNo) : "—")}</td>
        <td>${escapeHtml(v.groupNo && v.groupNo !== "0" ? v.groupNo : "—")}</td>
        <td>${escapeHtml(v.updMode || "1")}</td>
      </tr>`;
    })
    .join("\n");
}

async function toDataUrl(buffer, mime = "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function renderEwayBillHtml(bill) {
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const vehicles = bill.VehiclListDetails || bill.vehicleListDetails || [];

  const validFrom = bill.ewayBillDate
    ? `${bill.ewayBillDate}${bill.actualDist ? ` [${bill.actualDist}Kms]` : ""}`
    : "—";

  const [qrDataUrl, barcodeDataUrl] = await Promise.all([
    QRCode.toDataURL(`EWB:${bill.ewbNo}`, { width: 120, margin: 1 }),
    bwipjs
      .toBuffer({
        bcid: "code128",
        text: String(bill.ewbNo).replace(/\s/g, ""),
        scale: 2,
        height: 12,
        includetext: false,
      })
      .then((buf) => toDataUrl(buf)),
  ]);

  const vars = {
    "{{ewbNo}}": String(bill.ewbNo ?? ""),
    "{{ewbNoFormatted}}": escapeHtml(formatEwbNo(bill.ewbNo)),
    "{{ewbNoRaw}}": escapeHtml(String(bill.ewbNo ?? "").replace(/\s/g, "")),
    "{{ewayBillDate}}": escapeHtml(bill.ewayBillDate || "—"),
    "{{generatedBy}}": escapeHtml(
      `${bill.userGstin || bill.fromGstin || ""} - ${bill.fromTrdName || ""}`.trim()
    ),
    "{{validFrom}}": escapeHtml(validFrom),
    "{{validUpto}}": escapeHtml(bill.validUpto || "—"),
    "{{irn}}": escapeHtml(bill.irn || ""),
    "{{irnDisplay}}": bill.irn ? "grid" : "none",
    "{{portal}}": escapeHtml(bill.genMode || "1"),
    "{{supplier}}": escapeHtml(`${bill.fromGstin}, ${bill.fromTrdName || ""}`),
    "{{placeOfDispatch}}": escapeHtml(
      placeLine(bill.fromPlace, bill.fromStateCode, bill.fromPincode)
    ),
    "{{recipient}}": escapeHtml(`${bill.toGstin}, ${bill.toTrdName || ""}`),
    "{{placeOfDelivery}}": escapeHtml(
      placeLine(bill.toPlace, bill.toStateCode, bill.toPincode)
    ),
    "{{docNo}}": escapeHtml(bill.docNo || "—"),
    "{{docDate}}": escapeHtml(bill.docDate || "—"),
    "{{transactionType}}": escapeHtml(
      TXN_TYPE[bill.transactionType] || String(bill.transactionType ?? "—")
    ),
    "{{valueOfGoods}}": escapeHtml(String(bill.totInvValue ?? bill.totalValue ?? "—")),
    "{{hsnHtml}}": hsnHtmlList(bill.itemList),
    "{{reasonForTransport}}": escapeHtml(supplyReason(bill)),
    "{{transporter}}": escapeHtml(
      [bill.transporterId, bill.transporterName].filter(Boolean).join(" & ") || "—"
    ),
    "{{vehicleRows}}": vehicleRowsHtml(vehicles),
    "{{qrDataUrl}}": qrDataUrl,
    "{{barcodeDataUrl}}": barcodeDataUrl,
  };

  let html = template;
  for (const [key, value] of Object.entries(vars)) {
    html = html.split(key).join(value);
  }
  return html;
}
