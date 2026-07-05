import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";
import { upsertIntegrationAction } from "../actions";

export default async function IntegrationsSettingsPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const tenantId = session.user.tenantId;

  const integrations = await prisma.integrationConfig.findMany({ where: { tenantId } });

  const integrationStatus = (status: string) => {
    switch (status) {
      case "CONNECTED": return "bg-[#28A745]/10 text-[#28A745]";
      case "ERROR": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Integrations</h1>
        <p className="text-brand-text-body font-body mt-1">Configure connections to external partner systems.</p>
      </div>

      <section className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          {["SMART", "SLADE360", "HMS", "SHA"].map((provider) => {
            const cfg = integrations.find((i) => i.provider === provider);
            return (
              <div key={provider} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-brand-text-heading">{provider}</h3>
                    <p className="text-xs text-brand-text-muted mt-0.5">
                      {provider === "SMART" && "Smart Applications International — Point-of-care benefit management"}
                      {provider === "SLADE360" && "Slade360 EDI — Electronic claims & eligibility"}
                      {provider === "HMS" && "Hospital Management System — HL7 FHIR integration"}
                      {provider === "SHA" && "SHA — Government compliance reporting"}
                    </p>
                  </div>
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${integrationStatus(cfg?.status ?? "DISCONNECTED")}`}>
                    {cfg?.status ?? "DISCONNECTED"}
                  </span>
                </div>
                {cfg && (
                  <div className="text-xs text-brand-text-muted space-y-1 mb-3">
                    {cfg.apiBaseUrl && <div>URL: {cfg.apiBaseUrl}</div>}
                    {cfg.lastSyncAt && <div>Last sync: {new Date(cfg.lastSyncAt).toLocaleString("en-UG")}</div>}
                  </div>
                )}
                <form action={upsertIntegrationAction} className="space-y-2">
                  <input type="hidden" name="provider" value={provider} />
                  <input name="apiBaseUrl" defaultValue={cfg?.apiBaseUrl ?? ""} placeholder="API base URL" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-xs outline-none focus:border-brand-indigo" />
                  <input name="apiKey" defaultValue={cfg?.apiKey ?? ""} placeholder="API key" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-xs outline-none focus:border-brand-indigo" />
                  <input name="apiSecret" type="password" defaultValue={cfg?.apiSecret ?? ""} placeholder="API secret" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-xs outline-none focus:border-brand-indigo" />
                  <textarea name="config" rows={2} defaultValue={cfg?.config ? JSON.stringify(cfg.config, null, 2) : ""} placeholder='{"timeout": 30}' className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-xs outline-none focus:border-brand-indigo" />
                  <div className="flex items-center justify-between">
                    <select name="isEnabled" defaultValue={String(cfg?.isEnabled ?? false)} className="border border-[#EEEEEE] rounded-md px-2 py-1 text-xs bg-white">
                      <option value="false">Disabled</option>
                      <option value="true">Enabled</option>
                    </select>
                    <button type="submit" className="text-brand-indigo text-sm font-semibold hover:text-brand-secondary transition-colors">
                      {cfg ? "Save Configuration" : "Connect"}
                    </button>
                  </div>
                </form>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
