import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";
import { InviteUserModal } from "./InviteUserModal";
import { ROLE_PERMISSIONS } from "@/lib/constants";
import {
  updateUserAccessAction,
  upsertIntegrationAction,
  upsertNotificationTemplateAction,
} from "./actions";

export default async function SettingsPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const tenantId = session.user.tenantId;

  const [users, integrations, templates, groups, brokers, members, fundGroups] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, lastLoginAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.integrationConfig.findMany({ where: { tenantId } }),
    prisma.notificationTemplate.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.group.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.broker.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.member.findMany({
      where: { tenantId, user: null },
      select: { id: true, firstName: true, lastName: true, memberNumber: true, group: { select: { name: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 250,
    }),
    prisma.group.findMany({ where: { tenantId, fundingMode: "SELF_FUNDED" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const roleColor = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN": return "bg-[#292A83]/10 text-[#292A83]";
      case "CLAIMS_OFFICER": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "FINANCE_OFFICER": return "bg-[#28A745]/10 text-[#28A745]";
      case "MEDICAL_OFFICER": return "bg-[#F5C6B6]/50 text-[#a0522d]";
      case "BROKER_USER": return "bg-[#FFC107]/10 text-[#856404]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

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
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Settings</h1>
        <p className="text-avenue-text-body font-body mt-1">Manage users, integrations, and notification templates.</p>
      </div>

      {/* Users */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-avenue-text-heading font-heading">Users & Roles</h2>
          <InviteUserModal
            groups={groups}
            brokers={brokers}
            members={members.map(m => ({
              id: m.id,
              name: `${m.firstName} ${m.lastName}`,
              memberNumber: m.memberNumber,
              groupName: m.group.name,
            }))}
            fundGroups={fundGroups}
          />
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Last Login</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Update Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-semibold text-avenue-text-heading">{u.firstName} {u.lastName}</td>
                  <td className="px-5 py-3">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${roleColor(u.role)}`}>
                      {u.role.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-KE") : "Never"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${u.isActive ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#DC3545]/10 text-[#DC3545]"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <form action={updateUserAccessAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="role" defaultValue={u.role} className="border border-[#EEEEEE] rounded-md px-2 py-1 text-xs bg-white">
                        {Object.keys(ROLE_PERMISSIONS).map(role => (
                          <option key={role} value={role}>{role.replace(/_/g, " ")}</option>
                        ))}
                        <option value="HR_MANAGER">HR MANAGER</option>
                        <option value="FUND_ADMINISTRATOR">FUND ADMINISTRATOR</option>
                      </select>
                      <select name="isActive" defaultValue={String(u.isActive)} className="border border-[#EEEEEE] rounded-md px-2 py-1 text-xs bg-white">
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                      <button type="submit" className="text-xs font-bold text-avenue-indigo hover:text-avenue-secondary">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-avenue-text-body">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-avenue-text-heading font-heading">Role Capabilities</h2>
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Capabilities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
              {Object.entries({
                ...ROLE_PERMISSIONS,
                HR_MANAGER: ["HR_PORTAL_ONLY"],
                FUND_ADMINISTRATOR: ["FUND_PORTAL_ONLY"],
              }).map(([role, permissions]) => (
                <tr key={role}>
                  <td className="px-5 py-3 font-bold text-avenue-text-heading">{role.replace(/_/g, " ")}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {permissions.map(p => (
                        <span key={p} className="bg-[#E6E7E8] text-[#6C757D] px-2 py-0.5 rounded text-[10px] font-bold">{p}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Integrations */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-avenue-text-heading font-heading">Integrations</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {["SMART", "SLADE360", "HMS", "SHA"].map((provider) => {
            const cfg = integrations.find((i) => i.provider === provider);
            return (
              <div key={provider} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-avenue-text-heading">{provider}</h3>
                    <p className="text-xs text-avenue-text-muted mt-0.5">
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
                  <div className="text-xs text-avenue-text-muted space-y-1 mb-3">
                    {cfg.apiBaseUrl && <div>URL: {cfg.apiBaseUrl}</div>}
                    {cfg.lastSyncAt && <div>Last sync: {new Date(cfg.lastSyncAt).toLocaleString("en-KE")}</div>}
                  </div>
                )}
                <form action={upsertIntegrationAction} className="space-y-2">
                  <input type="hidden" name="provider" value={provider} />
                  <input name="apiBaseUrl" defaultValue={cfg?.apiBaseUrl ?? ""} placeholder="API base URL" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-xs outline-none focus:border-avenue-indigo" />
                  <input name="apiKey" defaultValue={cfg?.apiKey ?? ""} placeholder="API key" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-xs outline-none focus:border-avenue-indigo" />
                  <input name="apiSecret" type="password" defaultValue={cfg?.apiSecret ?? ""} placeholder="API secret" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-xs outline-none focus:border-avenue-indigo" />
                  <textarea name="config" rows={2} defaultValue={cfg?.config ? JSON.stringify(cfg.config, null, 2) : ""} placeholder='{"timeout": 30}' className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-xs outline-none focus:border-avenue-indigo" />
                  <div className="flex items-center justify-between">
                    <select name="isEnabled" defaultValue={String(cfg?.isEnabled ?? false)} className="border border-[#EEEEEE] rounded-md px-2 py-1 text-xs bg-white">
                      <option value="false">Disabled</option>
                      <option value="true">Enabled</option>
                    </select>
                    <button type="submit" className="text-avenue-indigo text-sm font-semibold hover:text-avenue-secondary transition-colors">
                      {cfg ? "Save Configuration" : "Connect"}
                    </button>
                  </div>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      {/* Notification Templates */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-avenue-text-heading font-heading">Notification Templates</h2>
        </div>
        <form action={upsertNotificationTemplateAction} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm grid md:grid-cols-2 gap-3">
          <input name="name" required placeholder="Template name" className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          <input name="type" required placeholder="WELCOME, CLAIM_APPROVED..." className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          <select name="channel" defaultValue="EMAIL" className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm bg-white">
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
            <option value="BOTH">Both</option>
          </select>
          <input name="subject" placeholder="Email subject" className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          <textarea name="bodyTemplate" required rows={3} placeholder="Message body with {{variables}}" className="md:col-span-2 border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          <div className="md:col-span-2 flex justify-between items-center">
            <select name="isActive" defaultValue="true" className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm bg-white">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <button type="submit" className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors">
              Add Template
            </button>
          </div>
        </form>
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Template Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Channel</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-semibold text-avenue-text-heading">{t.name}</td>
                  <td className="px-5 py-3">
                    <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-1 rounded text-xs font-bold">{t.type}</span>
                  </td>
                  <td className="px-5 py-3">{t.channel}</td>
                  <td className="px-5 py-3">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${t.isActive ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#6C757D]/10 text-[#6C757D]"}`}>
                      {t.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <form action={upsertNotificationTemplateAction} className="flex flex-wrap gap-1.5">
                      <input type="hidden" name="templateId" value={t.id} />
                      <input type="hidden" name="name" value={t.name} />
                      <input type="hidden" name="type" value={t.type} />
                      <input type="hidden" name="channel" value={t.channel} />
                      <input type="hidden" name="subject" value={t.subject ?? ""} />
                      <input type="hidden" name="bodyTemplate" value={t.bodyTemplate} />
                      <input type="hidden" name="isActive" value={String(!t.isActive)} />
                      <button className="text-avenue-indigo text-sm font-semibold hover:text-avenue-secondary">
                        {t.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-avenue-text-body">No templates configured.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
