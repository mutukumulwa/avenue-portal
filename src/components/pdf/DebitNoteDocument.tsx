import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type DebitNoteData = {
  invoiceNumber: string;
  groupName: string;
  period: string;
  memberCount: number;
  ratePerMember: number;
  totalAmount: number;
  stampDuty: number;
  trainingLevy: number;
  phcf: number;
  taxTotal: number;
  dueDate: string;
  issuedDate: string;
};

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", backgroundColor: "#FFFFFF", fontSize: 10, color: "#333333" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1.5, borderBottomColor: "#0B1437", paddingBottom: 18, marginBottom: 20 },
  brand: { fontSize: 20, fontWeight: "bold", color: "#0B1437" },
  brandSub: { fontSize: 9, color: "#6C757D", marginTop: 3 },
  docTitle: { fontSize: 22, fontWeight: "bold", color: "#0B1437", textAlign: "right" },
  docRef: { fontSize: 9, color: "#6C757D", textAlign: "right", marginTop: 3 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 9, fontWeight: "bold", color: "#6C757D", textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.8 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  label: { color: "#6C757D" },
  value: { fontWeight: "bold", color: "#333333" },
  tableHeader: { flexDirection: "row", backgroundColor: "#F0F0F8", padding: "8 10", borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  tableHeaderText: { fontWeight: "bold", color: "#0B1437", fontSize: 9, textTransform: "uppercase" },
  tableRow: { flexDirection: "row", padding: "8 10", borderBottomWidth: 1, borderBottomColor: "#EEEEEE" },
  tableRowAlt: { flexDirection: "row", padding: "8 10", backgroundColor: "#F8F9FA", borderBottomWidth: 1, borderBottomColor: "#EEEEEE" },
  col1: { flex: 1 },
  col2: { width: 100, textAlign: "right" },
  totalRow: { flexDirection: "row", padding: "10 10", backgroundColor: "#0B1437", borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  totalLabel: { flex: 1, fontWeight: "bold", color: "#FFFFFF", fontSize: 11 },
  totalValue: { width: 100, textAlign: "right", fontWeight: "bold", color: "#FFFFFF", fontSize: 11 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#EEEEEE", marginVertical: 16 },
  notice: { backgroundColor: "#FFF8E1", padding: 10, borderRadius: 4, fontSize: 9, color: "#6C757D", borderLeftWidth: 3, borderLeftColor: "#FFC107" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: "#EEEEEE", paddingTop: 10, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 8, color: "#9CA3AF" },
});

export function DebitNoteDocument({ data }: { data: DebitNoteData }) {
  const basePremium = data.memberCount * data.ratePerMember;

  return (
    <Document title={`Debit Note – ${data.invoiceNumber}`} author="AiCare Platform">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>AiCare</Text>
            <Text style={s.brandSub}>Membership Management Platform</Text>
          </View>
          <View>
            <Text style={s.docTitle}>DEBIT NOTE</Text>
            <Text style={s.docRef}>Ref: {data.invoiceNumber}</Text>
            <Text style={s.docRef}>Issued: {data.issuedDate}</Text>
          </View>
        </View>

        {/* Billed To */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Billed To</Text>
          <View style={s.row}>
            <Text style={s.label}>Group / Employer</Text>
            <Text style={s.value}>{data.groupName}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Coverage Period</Text>
            <Text style={s.value}>{data.period}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Payment Due</Text>
            <Text style={s.value}>{data.dueDate}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Charge Breakdown */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Charge Breakdown</Text>

          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, s.col1]}>Description</Text>
            <Text style={[s.tableHeaderText, s.col2]}>Amount (KES)</Text>
          </View>

          {/* Base Premium */}
          <View style={s.tableRow}>
            <View style={s.col1}>
              <Text style={{ fontWeight: "bold" }}>Basic Premium</Text>
              <Text style={{ color: "#6C757D", fontSize: 9, marginTop: 2 }}>
                {data.memberCount} member{data.memberCount !== 1 ? "s" : ""} × KES {data.ratePerMember.toLocaleString()} per member
              </Text>
            </View>
            <Text style={s.col2}>{basePremium.toLocaleString()}</Text>
          </View>

          {/* Stamp Duty */}
          <View style={s.tableRowAlt}>
            <View style={s.col1}>
              <Text>Stamp Duty</Text>
              <Text style={{ color: "#6C757D", fontSize: 9, marginTop: 2 }}>Statutory flat levy – Insurance Act Cap 487</Text>
            </View>
            <Text style={s.col2}>{data.stampDuty.toLocaleString()}</Text>
          </View>

          {/* Training Levy */}
          <View style={s.tableRow}>
            <View style={s.col1}>
              <Text>Training Levy (0.2%)</Text>
              <Text style={{ color: "#6C757D", fontSize: 9, marginTop: 2 }}>Insurance Training Levy – IRA Regulations</Text>
            </View>
            <Text style={s.col2}>{data.trainingLevy.toLocaleString()}</Text>
          </View>

          {/* PHCF */}
          <View style={s.tableRowAlt}>
            <View style={s.col1}>
              <Text>PHCF (0.25%)</Text>
              <Text style={{ color: "#6C757D", fontSize: 9, marginTop: 2 }}>Primary Health Care Fund – Legal Notice No. 162</Text>
            </View>
            <Text style={s.col2}>{data.phcf.toLocaleString()}</Text>
          </View>

          {/* Total */}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total Due</Text>
            <Text style={s.totalValue}>KES {data.totalAmount.toLocaleString()}</Text>
          </View>
        </View>

        {/* Payment Notice */}
        <View style={s.notice}>
          <Text style={{ fontWeight: "bold", marginBottom: 4 }}>Payment Instructions</Text>
          <Text>Please remit payment by {data.dueDate} quoting invoice reference {data.invoiceNumber}. Late payment may result in suspension of membership benefits per the group agreement terms.</Text>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>AiCare Membership Platform · Confidential</Text>
          <Text style={s.footerText}>This debit note is computer-generated and valid without a signature.</Text>
        </View>
      </Page>
    </Document>
  );
}
