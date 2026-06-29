import { useState } from "react";
import { downloadEwayBillPdf, extendEwayBillValidity } from "../api/ewayBill.js";
import { EWB_NUMBER_LENGTH, parseEwbInput } from "../utils/ewbNumber.js";
import { verifyEwayBillNumber } from "../api/ewayBill.js";

const TRANSPORT_MODES = [
  { value: "1", label: "Road" },
  { value: "2", label: "Rail" },
  { value: "3", label: "Air" },
  { value: "4", label: "Ship" },
  { value: "5", label: "In Transit (5)" },
];

const EXTN_REASONS = [
  { value: "1", label: "1 — Natural calamity" },
  { value: "2", label: "2 — Law and order" },
  { value: "3", label: "3 — Transshipment" },
  { value: "4", label: "4 — Accident" },
  { value: "5", label: "5 — Others" },
];

const CONSIGNMENT_STATUS = [
  { value: "T", label: "T — In transit" },
  { value: "M", label: "M — In movement" },
];

const TRANSIT_TYPES = [
  { value: "R", label: "R — Road" },
  { value: "W", label: "W — Warehouse" },
  { value: "O", label: "O — Others" },
];

export default function ExtendValidityForm({ getAccessToken, user }) {
  const [ewbNo, setEwbNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [fromPlace, setFromPlace] = useState("");
  const [fromState, setFromState] = useState("");
  const [fromPincode, setFromPincode] = useState("");
  const [remainingDistance, setRemainingDistance] = useState("");
  const [transDocNo, setTransDocNo] = useState("");
  const [transDocDate, setTransDocDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [transMode, setTransMode] = useState("1");
  const [extnRsnCode, setExtnRsnCode] = useState("1");
  const [extnRemarks, setExtnRemarks] = useState("");
  const [consignmentStatus, setConsignmentStatus] = useState("T");
  const [transitType, setTransitType] = useState("R");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressLine3, setAddressLine3] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [success, setSuccess] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

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

    const [yyyy, mm, dd] = transDocDate.split("-");
    const formattedTransDocDate = `${dd}/${mm}/${yyyy}`;

    const payload = {
      ewbNo: Number(ewbDigits),
      vehicleNo: vehicleNo.trim().toUpperCase(),
      fromPlace: fromPlace.trim(),
      fromState: Number(fromState),
      fromPincode: Number(fromPincode),
      remainingDistance: Number(remainingDistance),
      transDocNo: transDocNo.trim(),
      transDocDate: formattedTransDocDate,
      transMode,
      extnRsnCode: Number(extnRsnCode),
      extnRemarks: extnRemarks.trim(),
      consignmentStatus,
      transitType,
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2.trim(),
      addressLine3: addressLine3.trim(),
    };

    try {
      const result = await extendEwayBillValidity(ewbDigits, accessToken, payload, user);
      setSuccess(result);
      try {
        await downloadEwayBillPdf(ewbDigits, accessToken);
      } catch (pdfErr) {
        console.warn("[eway-bill] PDF after extend failed", pdfErr.message);
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
    <form className="update-form extend-form" onSubmit={handleSubmit}>
      <h3>Extend e-Way Bill validity</h3>
      <p className="form-hint">
        Extend validity via transporter API — up to 8 hours before or after expiry.
      </p>

      <label htmlFor="extEwbNo">E-Way Bill number (12 digits)</label>
      <input
        id="extEwbNo"
        type="text"
        inputMode="numeric"
        value={ewbNo}
        onChange={(e) => setEwbNo(e.target.value.replace(/\D/g, "").slice(0, EWB_NUMBER_LENGTH))}
        minLength={EWB_NUMBER_LENGTH}
        maxLength={EWB_NUMBER_LENGTH}
        pattern={`[0-9]{${EWB_NUMBER_LENGTH}}`}
        title={`Enter exactly ${EWB_NUMBER_LENGTH} digits`}
        required
      />

      <label htmlFor="extVehicleNo">Vehicle number</label>
      <input
        id="extVehicleNo"
        type="text"
        value={vehicleNo}
        onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
        placeholder="PQR1234"
        minLength={7}
        maxLength={15}
      />

      <div className="form-row">
        <div>
          <label htmlFor="extFromPlace">From place</label>
          <input
            id="extFromPlace"
            type="text"
            value={fromPlace}
            onChange={(e) => setFromPlace(e.target.value)}
            placeholder="Bengaluru"
            required
          />
        </div>
        <div>
          <label htmlFor="extFromState">From state</label>
          <input
            id="extFromState"
            type="number"
            min={1}
            max={99}
            value={fromState}
            onChange={(e) => setFromState(e.target.value)}
            placeholder="29"
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div>
          <label htmlFor="extFromPincode">From pincode</label>
          <input
            id="extFromPincode"
            type="number"
            value={fromPincode}
            onChange={(e) => setFromPincode(e.target.value)}
            placeholder="560090"
            required
          />
        </div>
        <div>
          <label htmlFor="extRemainingDistance">Remaining distance (km)</label>
          <input
            id="extRemainingDistance"
            type="number"
            min={1}
            value={remainingDistance}
            onChange={(e) => setRemainingDistance(e.target.value)}
            placeholder="50"
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div>
          <label htmlFor="extTransMode">Transport mode</label>
          <select
            id="extTransMode"
            value={transMode}
            onChange={(e) => setTransMode(e.target.value)}
            required
          >
            {TRANSPORT_MODES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="extExtnRsn">Extension reason</label>
          <select
            id="extExtnRsn"
            value={extnRsnCode}
            onChange={(e) => setExtnRsnCode(e.target.value)}
            required
          >
            {EXTN_REASONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label htmlFor="extExtnRemarks">Extension remarks</label>
      <input
        id="extExtnRemarks"
        type="text"
        value={extnRemarks}
        onChange={(e) => setExtnRemarks(e.target.value)}
        placeholder="Flood"
        required
      />

      <div className="form-row">
        <div>
          <label htmlFor="extTransDocNo">Transport doc no.</label>
          <input
            id="extTransDocNo"
            type="text"
            value={transDocNo}
            onChange={(e) => setTransDocNo(e.target.value)}
            placeholder="1234"
          />
        </div>
        <div>
          <label htmlFor="extTransDocDate">Transport doc date</label>
          <input
            id="extTransDocDate"
            type="date"
            value={transDocDate}
            onChange={(e) => setTransDocDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div>
          <label htmlFor="extConsignment">Consignment status</label>
          <select
            id="extConsignment"
            value={consignmentStatus}
            onChange={(e) => setConsignmentStatus(e.target.value)}
          >
            {CONSIGNMENT_STATUS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="extTransitType">Transit type</label>
          <select
            id="extTransitType"
            value={transitType}
            onChange={(e) => setTransitType(e.target.value)}
          >
            {TRANSIT_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label htmlFor="extAddr1">Address line 1</label>
      <input
        id="extAddr1"
        type="text"
        value={addressLine1}
        onChange={(e) => setAddressLine1(e.target.value)}
        placeholder="Bengaluru"
      />
      <label htmlFor="extAddr2">Address line 2</label>
      <input
        id="extAddr2"
        type="text"
        value={addressLine2}
        onChange={(e) => setAddressLine2(e.target.value)}
      />
      <label htmlFor="extAddr3">Address line 3</label>
      <input
        id="extAddr3"
        type="text"
        value={addressLine3}
        onChange={(e) => setAddressLine3(e.target.value)}
      />

      {error && (
        <div className="form-error">
          <p>{error}</p>
          {errorDetails && <pre className="error-details">{errorDetails}</pre>}
        </div>
      )}

      {success && (
        <div className="form-success">
          <p>Validity extended successfully</p>
          <dl>
            <div>
              <dt>E-Way Bill no.</dt>
              <dd>{success.ewayBillNo || ewbNo}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{success.updatedDate || "—"}</dd>
            </div>
            <div>
              <dt>Valid upto</dt>
              <dd>{success.validUpto || "—"}</dd>
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
            {pdfLoading ? "Generating PDF…" : "Download updated PDF"}
          </button>
        </div>
      )}

      <button type="submit" disabled={loading}>
        {loading ? "Extending…" : "Extend validity"}
      </button>
    </form>
  );
}
