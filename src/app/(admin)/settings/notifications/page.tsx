import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";
import { upsertNotificationTemplateAction } from "../actions";

export default async function NotificationTemplatesSettingsPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const tenantId = session.user.tenantId;

  const templates = await prisma.notificationTemplate.findMany({ where: { tenantId }, orderBy: { name: "asc" } });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Notification Templates</h1>
        <p className="text-brand-text-body font-body mt-1">Manage the email and SMS templates sent to members and partners.</p>
      </div>

      <section className="space-y-4">
        <form action={upsertNotificationTemplateAction} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm grid md:grid-cols-2 gap-3">
          <input name="name" required placeholder="Template name" className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo" />
          <input name="type" required placeholder="WELCOME, CLAIM_APPROVED..." className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo" />
          <select name="channel" defaultValue="EMAIL" className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm bg-white">
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
            <option value="BOTH">Both</option>
          </select>
          <input name="subject" placeholder="Email subject" className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo" />
          <textarea name="bodyTemplate" required rows={3} placeholder="Message body with {{variables}}" className="md:col-span-2 border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo" />
          <div className="md:col-span-2 flex justify-between items-center">
            <select name="isActive" defaultValue="true" className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm bg-white">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <button type="submit" className="bg-brand-indigo hover:bg-brand-secondary text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors">
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
            <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-semibold text-brand-text-heading">{t.name}</td>
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
                      <button className="text-brand-indigo text-sm font-semibold hover:text-brand-secondary">
                        {t.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-brand-text-body">No templates configured.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
