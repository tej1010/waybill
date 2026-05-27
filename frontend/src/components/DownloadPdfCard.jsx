import { useState } from "react";
import { downloadEwayBillPdf, verifyEwayBillNumber } from "../api/ewayBill.js";
import { EWB_NUMBER_LENGTH, parseEwbInput } from "../utils/ewbNumber.js";

export default function DownloadPdfCard({ getAccessToken }) {
  const [ewbNo, setEwbNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDownload(e) {
    e.preventDefault();
    setError("");

    const parsed = parseEwbInput(ewbNo);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    setLoading(true);
    try {
      const accessToken = await getAccessToken();
      await verifyEwayBillNumber(parsed.digits, accessToken);
      await downloadEwayBillPdf(parsed.digits, accessToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="download-pdf-card" onSubmit={handleDownload}>
      <h3>Download e-Way Bill PDF</h3>
      <p className="form-hint">
        Fetch latest bill from Sandbox and generate PDF (after generate or Part B update).
      </p>
      <label htmlFor="pdfEwbNo">E-Way Bill number (12 digits)</label>
      <input
        id="pdfEwbNo"
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
      {error && <p className="form-error-inline">{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? "Verifying…" : "Download PDF"}
      </button>
    </form>
  );
}
