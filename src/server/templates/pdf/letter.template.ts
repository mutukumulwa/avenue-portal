// ─── FORMAL LETTER PDF TEMPLATE ──────────────────────────────────────────────
// Brand: Quicksand headings, Lato body, indigo (#292A83).
// Used for Welcome Letters, Renewal Notices, Termination Notices, and custom memos.

export type LetterType =
  | "WELCOME"
  | "RENEWAL_NOTICE"
  | "TERMINATION_NOTICE"
  | "LAPSE_NOTICE"
  | "REINSTATEMENT_CONFIRMATION"
  | "CUSTOM_MEMO";

export interface LetterData {
  letterType:   LetterType;
  tenantName:   string;
  tenantLogoUrl?: string;
  recipientName: string;
  recipientAddress?: string;
  memberNumber:  string;
  groupName:     string;
  packageName:   string;
  date:          string;
  referenceNumber: string;
  body:          string;       // pre-composed body paragraphs (may contain \n\n for paragraphs)
  signatory:     string;
  signatoryTitle: string;
}

const LETTER_SUBJECTS: Record<LetterType, string> = {
  WELCOME:                     "Welcome to Your Membership — Getting Started",
  RENEWAL_NOTICE:              "Renewal Notice — Your Membership is Due for Renewal",
  TERMINATION_NOTICE:          "Membership Termination Notice",
  LAPSE_NOTICE:                "Important: Your Membership Has Lapsed",
  REINSTATEMENT_CONFIRMATION:  "Membership Reinstatement Confirmation",
  CUSTOM_MEMO:                 "Correspondence",
};

export function renderLetterHtml(data: LetterData): string {
  const subject = LETTER_SUBJECTS[data.letterType];
  const paragraphs = data.body
    .split(/\n\n+/)
    .map((p) => `<p style="margin-bottom:14px;font-size:13px;color:#1a1a2e;line-height:1.65;">${p.trim().replace(/\n/g, "<br/>")}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@600;700&family=Lato:wght@400;700&display=swap" rel="stylesheet" />
<title>${subject}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Lato', sans-serif; color: #1a1a2e; font-size: 13px; line-height: 1.6; background: white; }
  h1,h2,h3 { font-family: 'Quicksand', sans-serif; }
</style>
</head>
<body>
  <!-- Letterhead -->
  <div style="border-bottom: 3px solid #292A83; padding: 28px 48px 20px;">
    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
      <div>
        <h1 style="font-size:22px;font-weight:700;color:#292A83;">${data.tenantName}</h1>
        <p style="font-size:11px;color:#6C757D;margin-top:3px;">Membership Services</p>
      </div>
      <div style="text-align:right;font-size:11px;color:#6C757D;line-height:1.7;">
        <div>Ref: <strong style="color:#1a1a2e;">${data.referenceNumber}</strong></div>
        <div>${data.date}</div>
      </div>
    </div>
  </div>

  <!-- Body -->
  <div style="padding:32px 48px;">
    <!-- Recipient -->
    <div style="margin-bottom:28px;">
      <p style="font-weight:700;font-size:13px;color:#1a1a2e;">${data.recipientName}</p>
      ${data.recipientAddress ? `<p style="font-size:12px;color:#6C757D;white-space:pre-line;margin-top:4px;">${data.recipientAddress}</p>` : ""}
    </div>

    <!-- Membership reference line -->
    <div style="background:#f8f9ff;border-left:3px solid #292A83;padding:10px 14px;margin-bottom:22px;font-size:12px;">
      <strong>Member No.:</strong> ${data.memberNumber} &nbsp;|&nbsp;
      <strong>Group:</strong> ${data.groupName} &nbsp;|&nbsp;
      <strong>Package:</strong> ${data.packageName}
    </div>

    <!-- Subject -->
    <p style="font-weight:700;font-size:14px;margin-bottom:18px;text-decoration:underline;color:#292A83;">
      RE: ${subject}
    </p>

    <!-- Body paragraphs -->
    <div style="margin-bottom:32px;">
      ${paragraphs}
    </div>

    <!-- Sign-off -->
    <p style="font-size:13px;margin-bottom:6px;">Yours sincerely,</p>
    <div style="margin-top:36px;">
      <div style="border-top:1px solid #1a1a2e;width:160px;margin-bottom:4px;"></div>
      <p style="font-weight:700;font-size:13px;color:#1a1a2e;">${data.signatory}</p>
      <p style="font-size:12px;color:#6C757D;">${data.signatoryTitle}</p>
      <p style="font-size:12px;color:#6C757D;">${data.tenantName}</p>
    </div>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #eee;padding:14px 48px;font-size:10px;color:#6C757D;display:flex;justify-content:space-between;">
    <span>${data.tenantName} — Membership Services</span>
    <span>This letter was generated on ${data.date}</span>
  </div>
</body>
</html>`;
}
