import { useState } from "react";
import {
  downloadEwayBillPdf,
  updateEwbTransporter,
  verifyEwayBillNumber,
} from "../api/ewayBill.js";
import { EWB_NUMBER_LENGTH, parseEwbInput } from "../utils/ewbNumber.js";

const TRANSPORTER_ID_PATTERN = /^[0-9]{2}[0-9A-Z]{13}$/;

export default function UpdateTransporterForm({ getAccessToken, user }) {
  const [ewbNo, setEwbNo] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [success, setSuccess] = useState(null);

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

    const id = transporterId.trim().toUpperCase();
    if (!TRANSPORTER_ID_PATTERN.test(id)) {
      setError("Enter a valid 15-character transporter GSTIN or TRANSIN");
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

    try {
      const result = await updateEwbTransporter(
        parsed.digits,
        accessToken,
        { ewbNo: Number(parsed.digits), transporterId: id },
        user
      );
      setSuccess(result);
      try {
        await downloadEwayBillPdf(parsed.digits, accessToken);
      } catch (pdfErr) {
        console.warn("[eway-bill] PDF after transporter update failed", pdfErr.message);
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
    <form className="update-form transporter-form" onSubmit={handleSubmit}>
      <h3>Update Transporter</h3>
      <p className="form-hint">
        Update transporter on an E-Way Bill using transporter GSTIN or TRANSIN.
      </p>

      <label htmlFor="transporterEwbNo">E-Way Bill number (12 digits)</label>
      <input
        id="transporterEwbNo"
        type="text"
        inputMode="numeric"
        value={ewbNo}
        onChange={(e) => setEwbNo(e.target.value.replace(/\D/g, "").slice(0, EWB_NUMBER_LENGTH))}
        placeholder="231010079649"
        minLength={EWB_NUMBER_LENGTH}
        maxLength={EWB_NUMBER_LENGTH}
        required
      />

      <label htmlFor="transporterId">Transporter ID (GSTIN / TRANSIN)</label>
      <input
        id="transporterId"
        type="text"
        autoComplete="off"
        value={transporterId}
        onChange={(e) => setTransporterId(e.target.value.toUpperCase())}
        placeholder="29AAACW6874H1ZS"
        maxLength={15}
        pattern="[0-9]{2}[0-9A-Z]{13}"
        title="15-character GSTIN or TRANSIN"
        required
      />

      {error && (
        <div className="form-error">
          <p>{error}</p>
          {errorDetails && <pre className="error-details">{errorDetails}</pre>}
        </div>
      )}

      {success && (
        <div className="form-success">
          <p>Transporter updated</p>
          <dl>
            <div>
              <dt>E-Way Bill</dt>
              <dd>{success.ewayBillNo || ewbNo}</dd>
            </div>
            <div>
              <dt>Transporter</dt>
              <dd>{success.transporterId}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{success.transUpdateDate || "—"}</dd>
            </div>
          </dl>
        </div>
      )}

      <button type="submit" disabled={loading}>
        {loading ? "Updating…" : "Update transporter"}
      </button>
    </form>
  );
}
