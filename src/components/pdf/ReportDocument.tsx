import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * Full report PDF, rendered client-side via @react-pdf/renderer.
 * Renders the report title, KPI cards and the complete data table.
 *
 * This deliberately avoids the server-side Puppeteer/Chromium route
 * (unreliable on Vercel serverless) — everything is produced in-browser.
 */
export type ReportPdfKpi = { label: string; value: string };

export type ReportPdfData = {
  kpis?: ReportPdfKpi[];
  headers?: string[];
  rows?: string[][];
  tenant?: string;
  generatedAt?: string;
  // Back-compat with the previous minimal shape (unused by the report page).
  total?: number;
  totalBilled?: number;
};

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", backgroundColor: "#FFFFFF", fontSize: 9, color: "#1a1a2e" },
  headerBar: {
    backgroundColor: "#0B1437",
    color: "#FFFFFF",
    padding: 16,
    marginBottom: 16,
    borderRadius: 4,
  },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },
  subtitle: { fontSize: 10, color: "#C7CCE5", marginTop: 4 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16, gap: 8 },
  kpiCard: {
    backgroundColor: "#F8F9FF",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    borderRadius: 4,
    padding: 10,
    minWidth: 120,
    flexGrow: 1,
  },
  kpiLabel: { fontSize: 8, color: "#6C757D", textTransform: "uppercase", marginBottom: 4, fontFamily: "Helvetica-Bold" },
  kpiValue: { fontSize: 15, color: "#0B1437", fontFamily: "Helvetica-Bold" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#0B1437" },
  tableHeaderCell: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8, padding: 5, textTransform: "uppercase" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#EEEEEE" },
  tableRowAlt: { backgroundColor: "#F8F9FF" },
  tableCell: { fontSize: 8, padding: 5, color: "#1a1a2e" },
  empty: { fontSize: 10, color: "#6C757D", padding: 16, textAlign: "center" },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 7,
    color: "#6C757D",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#EEEEEE",
    paddingTop: 8,
  },
});

export const ReportDocument = ({ title, data }: { title: string; data: ReportPdfData }) => {
  const kpis = data?.kpis ?? [];
  const headers = data?.headers ?? [];
  const rows = data?.rows ?? [];
  const landscape = headers.length > 5;
  const colWidth = headers.length > 0 ? `${100 / headers.length}%` : "100%";
  const tenant = data?.tenant ?? "Medvex";
  const generatedAt = data?.generatedAt ?? new Date().toLocaleDateString("en-UG");

  return (
    <Document title={title} author="Medvex">
      <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={styles.page}>
        <View style={styles.headerBar}>
          <Text style={styles.brand}>{tenant}</Text>
          <Text style={styles.subtitle}>
            {title} · {rows.length} record{rows.length === 1 ? "" : "s"} · Generated {generatedAt}
          </Text>
        </View>

        {kpis.length > 0 && (
          <View style={styles.kpiRow}>
            {kpis.map((k, i) => (
              <View key={i} style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{k.label}</Text>
                <Text style={styles.kpiValue}>{k.value}</Text>
              </View>
            ))}
          </View>
        )}

        {headers.length > 0 ? (
          <View>
            {/* Header row repeats on every page */}
            <View style={styles.tableHeaderRow} fixed>
              {headers.map((h, i) => (
                <Text key={i} style={[styles.tableHeaderCell, { width: colWidth }]}>
                  {h}
                </Text>
              ))}
            </View>
            {rows.map((row, ri) => (
              <View key={ri} style={[styles.tableRow, ri % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                {headers.map((_, ci) => (
                  <Text key={ci} style={[styles.tableCell, { width: colWidth }]}>
                    {row[ci] ?? ""}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No data available for this report.</Text>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Medvex Health Administration Platform · Confidential · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
};
