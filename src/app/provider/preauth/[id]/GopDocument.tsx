import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { GopData } from "./gop-artifact";

function money(n: number) {
  return `UGX ${Math.round(n).toLocaleString("en-UG")}`;
}

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", backgroundColor: "#FFFFFF", fontSize: 10, color: "#333333" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1.5, borderBottomColor: "#0B1437", paddingBottom: 18, marginBottom: 20 },
  brand: { fontSize: 20, fontWeight: "bold", color: "#0B1437" },
  brandSub: { fontSize: 9, color: "#6C757D", marginTop: 3 },
  docTitle: { fontSize: 20, fontWeight: "bold", color: "#0B1437", textAlign: "right" },
  docRef: { fontSize: 9, color: "#6C757D", textAlign: "right", marginTop: 3 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 9, fontWeight: "bold", color: "#6C757D", textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.8 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  label: { color: "#6C757D" },
  value: { fontWeight: "bold", color: "#333333" },
  amountBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: "12 14", backgroundColor: "#0B1437", borderRadius: 4, marginVertical: 8 },
  amountLabel: { color: "#FFFFFF", fontSize: 11, fontWeight: "bold" },
  amountValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "bold" },
  statement: { backgroundColor: "#F0F0F8", padding: 12, borderRadius: 4, fontSize: 9, color: "#333333", lineHeight: 1.5, marginTop: 8 },
  notice: { backgroundColor: "#FFF8E1", padding: 10, borderRadius: 4, fontSize: 8, color: "#6C757D", borderLeftWidth: 3, borderLeftColor: "#FFC107", marginTop: 12 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: "#EEEEEE", paddingTop: 10, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 8, color: "#9CA3AF" },
});

export function GopDocument({ data }: { data: GopData }) {
  return (
    <Document title={`Guarantee of Payment – ${data.gopNumber}`} author="Medvex">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>Medvex</Text>
            <Text style={s.brandSub}>Provider Network</Text>
          </View>
          <View>
            <Text style={s.docTitle}>GUARANTEE OF PAYMENT</Text>
            <Text style={s.docRef}>GOP: {data.gopNumber}</Text>
            <Text style={s.docRef}>Pre-auth: {data.preauthNumber}</Text>
            <Text style={s.docRef}>Issued: {data.issuedAt}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Issued to facility</Text>
          <View style={s.row}><Text style={s.label}>Provider</Text><Text style={s.value}>{data.providerName}</Text></View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Member</Text>
          <View style={s.row}><Text style={s.label}>Name</Text><Text style={s.value}>{data.memberName}</Text></View>
          <View style={s.row}><Text style={s.label}>Member number</Text><Text style={s.value}>{data.memberNumber}</Text></View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Authorized service</Text>
          <View style={s.row}><Text style={s.label}>Service type</Text><Text style={s.value}>{data.serviceType}</Text></View>
          <View style={s.row}><Text style={s.label}>Benefit</Text><Text style={s.value}>{data.benefit}</Text></View>
          <View style={s.row}><Text style={s.label}>Valid from</Text><Text style={s.value}>{data.validFrom}</Text></View>
          <View style={s.row}><Text style={s.label}>Valid until</Text><Text style={s.value}>{data.validUntil}</Text></View>
        </View>

        <View style={s.amountBox}>
          <Text style={s.amountLabel}>Guaranteed amount</Text>
          <Text style={s.amountValue}>{money(data.approvedAmount)}</Text>
        </View>

        <Text style={s.statement}>
          This Guarantee of Payment confirms that the payer authorizes payment to the named
          facility for the service described above, up to the guaranteed amount, for the named
          member, when rendered within the validity period. Payment remains subject to the
          member&apos;s active cover, the applicable benefit limits and contract terms, and the
          submission of a valid claim. This guarantee is void if the pre-authorization is
          cancelled or expires before use.
        </Text>

        <Text style={s.notice}>
          Reference GOP {data.gopNumber} on the resulting claim. This document is system-generated
          from the authorized pre-authorization and does not require a signature.
        </Text>

        <View style={s.footer}>
          <Text style={s.footerText}>Medvex Provider Network</Text>
          <Text style={s.footerText}>GOP {data.gopNumber}</Text>
        </View>
      </Page>
    </Document>
  );
}
