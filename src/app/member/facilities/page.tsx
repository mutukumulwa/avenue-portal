import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MapPin, Phone } from "lucide-react";

export default async function MemberFacilitiesPage() {
  const session = await requireRole(ROLES.MEMBER);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { member: { select: { tenantId: true } } },
  });

  const tenantId = user?.member?.tenantId;
  if (!tenantId) redirect("/login");

  const providers = await prisma.provider.findMany({
    where: { tenantId, contractStatus: "ACTIVE" },
    orderBy: [{ tier: "asc" }, { name: "asc" }],
  });

  const tierLabel: Record<string, string> = {
    OWN: "Avenue Facilities",
    PARTNER: "Partner Facilities",
    PANEL: "Panel Providers",
  };

  const tierColor: Record<string, string> = {
    OWN: "bg-[#292A83]/10 text-[#292A83]",
    PARTNER: "bg-[#28A745]/10 text-[#28A745]",
    PANEL: "bg-[#17A2B8]/10 text-[#17A2B8]",
  };

  const grouped = providers.reduce<Record<string, typeof providers>>((acc, p) => {
    if (!acc[p.tier]) acc[p.tier] = [];
    acc[p.tier].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Healthcare Facilities</h1>
        <p className="text-avenue-text-muted mt-1">Accredited facilities where you can seek care.</p>
      </div>

      {["OWN", "PARTNER", "PANEL"].map((tier) => {
        const tierProviders = grouped[tier] ?? [];
        if (tierProviders.length === 0) return null;
        return (
          <div key={tier} className="space-y-3">
            <h2 className="font-bold text-avenue-text-heading font-heading">{tierLabel[tier]}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {tierProviders.map((p) => (
                <div key={p.id} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-avenue-text-heading">{p.name}</p>
                      <p className="text-xs text-avenue-text-muted">{p.type}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${tierColor[p.tier]}`}>
                      {p.tier}
                    </span>
                  </div>
                  {p.address && (
                    <div className="flex items-start gap-1.5 text-xs text-avenue-text-muted mt-2">
                      <MapPin size={12} className="mt-0.5 flex-shrink-0" />
                      <span>{p.address}{p.county ? `, ${p.county}` : ""}</span>
                    </div>
                  )}
                  {p.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-avenue-text-muted mt-1">
                      <Phone size={12} className="flex-shrink-0" />
                      <a href={`tel:${p.phone}`} className="hover:text-avenue-indigo">{p.phone}</a>
                    </div>
                  )}
                  {p.servicesOffered.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.servicesOffered.slice(0, 3).map((s) => (
                        <span key={s} className="bg-[#E6E7E8] text-[#6C757D] px-2 py-0.5 rounded text-[10px] font-bold">{s}</span>
                      ))}
                      {p.servicesOffered.length > 3 && (
                        <span className="text-[10px] text-avenue-text-muted">+{p.servicesOffered.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {providers.length === 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-8 text-center text-avenue-text-body shadow-sm">
          No facilities found. Please contact support.
        </div>
      )}
    </div>
  );
}
