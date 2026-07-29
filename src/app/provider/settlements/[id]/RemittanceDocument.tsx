import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { RemittancePdfData } from "./remittance-pdf";

/**
 * PNOS F6.6 — provider remittance statement (versioned @react-pdf template).
 * Renders from the canonical read-model DTO (buildRemittancePdfData). Fixed page
 * header + footer (page numbers) repeat across pages; the claim/line table wraps
 * and breaks cleanly for long, multi-page detail. Provider-safe by construction.
 */

function num(s: string): string {
  return Number(s).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const s = StyleSheet.create({
  page: { paddingTop: 92, paddingBottom: 48, paddingHorizontal: 40, fontFamily: "Helvetica", backgroundColor: "#FFFFFF", fontSize: 8, color: "#333333" },
  header: { position: "absolute", top: 28, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1.5, borderBottomColor: "#0B1437", paddingBottom: 10 },
  brand: { fontSize: 16, fontWeight: "bold", color: "#0B1437" },
  brandSub: { fontSize: 8, color: "#6C757D", marginTop: 2 },
  docTitle: { fontSize: 14, fontWeight: "bold", color: "#0B1437", textAlign: "right" },
  docRef: { fontSize: 8, color: "#6C757D", textAlign: "right", marginTop: 2 },
  controlBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: "8 12", backgroundColor: "#0B1437", borderRadius: 4, marginBottom: 12 },
  controlLabel: { color: "#FFFFFF", fontSize: 9, fontWeight: "bold" },
  controlValue: { color: "#FFFFFF", fontSize: 12, fontWeight: "bold" },
  note: { fontSize: 7, color: "#6C757D", marginBottom: 10 },
  claim: { marginBottom: 8, borderWidth: 0.5, borderColor: "#DDDDDD", borderRadius: 3 },
  claimHead: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#F0F0F8", padding: "4 6" },
  claimNo: { fontWeight: "bold", color: "#0B1437" },
  claimMeta: { color: "#6C757D" },
  badge: { fontSize: 6, fontWeight: "bold", color: "#0B1437", backgroundColor: "#E6E7F5", padding: "1 3", borderRadius: 2 },
  declineRow: { padding: "3 6", backgroundColor: "#FFF8E1", fontSize: 7, color: "#856404" },
  thead: { flexDirection: "row", backgroundColor: "#FAFAFC", borderBottomWidth: 0.5, borderBottomColor: "#DDDDDD", paddingVertical: 3, paddingHorizontal: 6 },
  trow: { flexDirection: "row", borderBottomWidth: 0.25, borderBottomColor: "#EEEEEE", paddingVertical: 2.5, paddingHorizontal: 6 },
  th: { fontSize: 7, fontWeight: "bold", color: "#6C757D" },
  cSvc: { width: "26%" },
  cNum: { width: "10.5%", textAlign: "right" },
  right: { textAlign: "right" },
  reasonRow: { paddingHorizontal: 6, paddingBottom: 2 },
  reason: { fontSize: 6.5, color: "#6C757D" },
  footer: { position: "absolute", bottom: 26, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: "#EEEEEE", paddingTop: 6, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: "#9CA3AF" },
});

export function RemittanceDocument({ data }: { data: RemittancePdfData }) {
  return (
    <Document title={`Remittance ${data.cycle}`} author="Medvex">
      <Page size="A4" style={s.page} wrap>
        {/* fixed page header — repeats on every page */}
        <View style={s.header} fixed>
          <View>
            <Text style={s.brand}>Medvex</Text>
            <Text style={s.brandSub}>Provider Network · Remittance advice</Text>
          </View>
          <View>
            <Text style={s.docTitle}>REMITTANCE — {data.cycle}</Text>
            <Text style={s.docRef}>Currency: {data.currency} · Status: {data.status}</Text>
            {data.voucherRef ? <Text style={s.docRef}>Voucher: {data.voucherRef}</Text> : null}
            <Text style={s.docRef}>Generated: {data.generatedAt ?? "—"} · v{data.version}</Text>
          </View>
        </View>

        <View style={s.controlBox}>
          <Text style={s.controlLabel}>Total payable to provider (control total)</Text>
          <Text style={s.controlValue}>{data.currency} {num(data.controlTotal)}</Text>
        </View>
        <Text style={s.note}>
          {data.conservationOk ? "Balances: line = claim = batch = voucher." : "Under review: totals do not fully reconcile."} {data.paymentFactsNote}
        </Text>

        {data.claims.map((c, i) => (
          <View key={i} style={s.claim} wrap>
            <View style={s.claimHead} wrap={false}>
              <Text>
                <Text style={s.claimNo}>{c.claimNumber}</Text>
                <Text style={s.claimMeta}> · {c.member}{c.memberNumber ? ` (${c.memberNumber})` : ""} · {c.serviceDate}</Text>
                {c.isSupplemental ? <Text style={s.badge}>  {c.submissionType}</Text> : null}
              </Text>
              <Text style={s.claimMeta}>Approved {num(c.approved)} · Paid {num(c.paid)}</Text>
            </View>
            {c.declineReason ? <Text style={s.declineRow}>{c.declineReason}</Text> : null}

            <View style={s.thead} wrap={false}>
              <Text style={[s.th, s.cSvc]}>Service</Text>
              <Text style={[s.th, s.cNum]}>Billed</Text>
              <Text style={[s.th, s.cNum]}>Allowed</Text>
              <Text style={[s.th, s.cNum]}>Disall.</Text>
              <Text style={[s.th, s.cNum]}>Member</Text>
              <Text style={[s.th, s.cNum]}>W/off</Text>
              <Text style={[s.th, s.cNum]}>Approved</Text>
              <Text style={[s.th, s.cNum]}>Paid</Text>
            </View>
            {c.lines.map((l, j) => (
              <View key={j} wrap={false}>
                <View style={s.trow}>
                  <Text style={s.cSvc}>{l.description}{l.cpt ? ` (${l.cpt})` : ""}</Text>
                  <Text style={s.cNum}>{num(l.billed)}</Text>
                  <Text style={s.cNum}>{l.allowed == null ? "—" : num(l.allowed)}</Text>
                  <Text style={s.cNum}>{num(l.disallowed)}</Text>
                  <Text style={s.cNum}>{num(l.memberShare)}</Text>
                  <Text style={s.cNum}>{num(l.writeoff)}</Text>
                  <Text style={s.cNum}>{num(l.approved)}</Text>
                  <Text style={s.cNum}>{num(l.paid)}</Text>
                </View>
                {l.reason ? (
                  <View style={s.reasonRow}><Text style={s.reason}>↳ {l.reason}</Text></View>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        {data.claimsShown < data.totalClaims ? (
          <Text style={s.note}>Showing {data.claimsShown} of {data.totalClaims} claims. Use the CSV export for the full set.</Text>
        ) : null}

        {/* fixed footer — page numbers repeat on every page */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Medvex Provider Network · Remittance {data.cycle}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
