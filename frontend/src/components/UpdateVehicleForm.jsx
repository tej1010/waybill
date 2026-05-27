import { useState } from "react";
import { downloadEwayBillPdf, updateVehicleDetails } from "../api/ewayBill.js";
import { EWB_NUMBER_LENGTH, parseEwbInput } from "../utils/ewbNumber.js";
import {
  isRoadMode,
  reasonRemForPartB,
  requiresTransDocNo,
  todayTransDocDate,
} from "../utils/ewayBillPartB.js";
import { verifyEwayBillNumber } from "../api/ewayBill.js";

const TRANSPORT_MODES = [
  { value: "1", label: "Road" },
  { value: "3", label: "Air" },
  { value: "2", label: "Rail" },
];

const REASON_OPTIONS = [
  { code: "1", label: "Due to Breakdown" },
  { code: "2", label: "Due to Transshipment" },
  { code: "3", label: "Others" },
];

export default function UpdateVehicleForm({ getAccessToken }) {
  const [ewbNo, setEwbNo] = useState("");
  const [transMode, setTransMode] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [transDocNo, setTransDocNo] = useState("");
  const [fromPlace, setFromPlace] = useState("");
  const [reasonCode, setReasonCode] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [success, setSuccess] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const isRoad = isRoadMode(transMode);
  const needsTransDoc = requiresTransDocNo(transMode);
  const showModeFields = Boolean(transMode);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setErrorDetails("");
    setSuccess(null);

    const parsed = parseEwbInput(ewbNo);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    setLoading(true);

    const accessToken = await getAccessToken();
    try {
      await verifyEwayBillNumber(parsed.digits, accessToken);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const ewbDigits = parsed.digits;

    const payload = {
      ewbNo: Number(ewbDigits),
      fromPlace: fromPlace.trim(),
      reasonCode,
      reasonRem: reasonRemForPartB(transMode, reasonCode),
      transMode,
      transDocDate: todayTransDocDate(),
    };

    if (isRoad) {
      payload.vehicleNo = vehicleNo.trim().toUpperCase();
      payload.vehicleType = "R";
    } else if (needsTransDoc) {
      if (!transDocNo.trim()) {
        setError("Transport document number is required for Rail or Air");
        setLoading(false);
        return;
      }
      payload.transDocNo = transDocNo.trim().toUpperCase();
    }

    try {
      const result = await updateVehicleDetails(ewbDigits, accessToken, payload);
      setSuccess(result);
      try {
        await downloadEwayBillPdf(ewbDigits, accessToken);
      } catch (pdfErr) {
        console.warn("[eway-bill] auto PDF download failed", pdfErr.message);
      }
    } catch (err) {
      setError(err.message);
      if (err.details) {
        setErrorDetails(
          typeof err.details === "string"
            ? err.details
            : JSON.stringify(err.details, null, 2)
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="update-form" onSubmit={handleSubmit}>
      <h3>Update Part B — Vehicle details</h3>
      <p className="form-hint">Select transport mode to show the required fields.</p>

      <label htmlFor="ewbNo">E-Way Bill number (12 digits)</label>
      <input
        id="ewbNo"
        type="text"
        inputMode="numeric"
        value={ewbNo}
        onChange={(e) => setEwbNo(e.target.value.replace(/\D/g, "").slice(0, EWB_NUMBER_LENGTH))}
        placeholder="662115106275"
        minLength={EWB_NUMBER_LENGTH}
        maxLength={EWB_NUMBER_LENGTH}
        pattern={`[0-9]{${EWB_NUMBER_LENGTH}}`}
        title={`Enter exactly ${EWB_NUMBER_LENGTH} digits`}
        required
      />

      <label htmlFor="transMode">Mode of transport</label>
      <select
        id="transMode"
        value={transMode}
        onChange={(e) => {
          setTransMode(e.target.value);
          setVehicleNo("");
          setTransDocNo("");
          setFromPlace("");
          setReasonCode("1");
        }}
        required
      >
        <option value="">Select mode</option>
        {TRANSPORT_MODES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {showModeFields && isRoad && (
        <>
          <label htmlFor="vehicleNo">Vehicle number</label>
          <input
            id="vehicleNo"
            type="text"
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
            placeholder="KA01JK9287"
            minLength={7}
            maxLength={15}
            required
          />
        </>
      )}

      {showModeFields && needsTransDoc && (
        <>
          <label htmlFor="transDocNo">Transport document number (RR / LR)</label>
          <input
            id="transDocNo"
            type="text"
            value={transDocNo}
            onChange={(e) => setTransDocNo(e.target.value.toUpperCase())}
            placeholder="RR123456789"
            maxLength={15}
            required
          />
        </>
      )}

      {showModeFields && (
        <>
          <label htmlFor="fromPlace">Place of change</label>
          <input
            id="fromPlace"
            type="text"
            value={fromPlace}
            onChange={(e) => setFromPlace(e.target.value)}
            placeholder="BANGALORE"
            maxLength={50}
            required
          />

          <label htmlFor="reasonCode">Reason</label>
          <select
            id="reasonCode"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            required
          >
            {REASON_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </>
      )}

      {error && (
        <div className="form-error">
          <p>{error}</p>
          {errorDetails && <pre className="error-details">{errorDetails}</pre>}
        </div>
      )}

      {success && (
        <div className="form-success">
          <p>Part B updated successfully</p>
          <dl>
            <div>
              <dt>Valid upto</dt>
              <dd>{success.validUpto || "—"}</dd>
            </div>
            <div>
              <dt>Vehicle updated</dt>
              <dd>{success.vehUpdDate || "—"}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn-link"
            disabled={pdfLoading}
            onClick={async () => {
              const parsedPdf = parseEwbInput(ewbNo);
              if (parsedPdf.error) {
                setError(parsedPdf.error);
                return;
              }
              setPdfLoading(true);
              try {
                const accessToken = await getAccessToken();
                await verifyEwayBillNumber(parsedPdf.digits, accessToken);
                await downloadEwayBillPdf(parsedPdf.digits, accessToken);
              } catch (pdfErr) {
                setError(pdfErr.message);
              } finally {
                setPdfLoading(false);
              }
            }}
          >
            {pdfLoading ? "Generating PDF…" : "Download e-Way Bill PDF"}
          </button>
        </div>
      )}

      <button type="submit" disabled={loading || !showModeFields}>
        {loading ? "Updating…" : "Update Part B"}
      </button>
    </form>
  );
}
