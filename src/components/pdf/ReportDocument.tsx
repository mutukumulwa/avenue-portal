import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    paddingBottom: 20,
    marginBottom: 20,
  },
  brand: { fontSize: 24, fontWeight: "bold", color: "#292A83" },
  date: { fontSize: 10, color: "#6C757D", marginTop: 8 },
  title: { fontSize: 18, fontWeight: "bold", color: "#333333", marginBottom: 15 },
  card: {
    backgroundColor: "#F8F9FA",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  label: { fontSize: 10, color: "#6C757D", textTransform: "uppercase", marginBottom: 5 },
  value: { fontSize: 24, color: "#292A83", fontWeight: "bold" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#6C757D",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#EEEEEE",
    paddingTop: 10,
  }
});

export const ReportDocument = ({ title, data }: { title: string, data: any }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Avenue Healthcare</Text>
          <Text style={styles.date}>Generated on {new Date().toLocaleDateString()}</Text>
        </View>
      </View>

      <Text style={styles.title}>{title}</Text>

      {data?.total !== undefined && (
        <View style={styles.card}>
          <Text style={styles.label}>Total Records</Text>
          <Text style={styles.value}>{data.total}</Text>
        </View>
      )}
      
      {data?.totalBilled !== undefined && (
        <View style={styles.card}>
          <Text style={styles.label}>Total Invoiced Activity (KES)</Text>
          <Text style={styles.value}>{Number(data.totalBilled).toLocaleString()}</Text>
        </View>
      )}

      <Text style={styles.footer}>
        Confidential Document · Generated via AiCare Membership Platform
      </Text>
    </Page>
  </Document>
);
