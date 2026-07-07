import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";
import { InviteUserModal } from "./InviteUserModal";
import { ROLE_PERMISSIONS } from "@/lib/constants";
import { updateUserAccessAction } from "./actions";

export default async function SettingsPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const tenantId = session.user.tenantId;

  const [users, groups, brokers, members, fundGroups, providers] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, lastLoginAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.group.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.broker.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.member.findMany({
      where: { tenantId, user: null },
      select: { id: true, firstName: true, lastName: true, memberNumber: true, group: { select: { name: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 250,
    }),
    prisma.group.findMany({ where: { tenantId, fundingMode: "SELF_FUNDED" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.provider.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const roleColor = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN": return "bg-[#0B1437]/10 text-[#0B1437]";
      case "CLAIMS_OFFICER": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "FINANCE_OFFICER": return "bg-[#28A745]/10 text-[#28A745]";
      case "MEDICAL_OFFICER": return "bg-[#F2715A]/50 text-[#C04A39]";
      case "BROKER_USER": return "bg-[#FFC107]/10 text-[#856404]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Users & Access</h1>
        <p className="text-brand-text-body font-body mt-1">Manage user accounts, roles and what each role can do.</p>
      </div>

      {/* Users */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-brand-text-heading font-heading">Users & Roles</h2>
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
            providers={providers}
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
            <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-semibold text-brand-text-heading">{u.firstName} {u.lastName}</td>
                  <td className="px-5 py-3">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${roleColor(u.role)}`}>
                      {u.role.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-UG") : "Never"}</td>
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
                      <button type="submit" className="text-xs font-bold text-brand-indigo hover:text-brand-secondary">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-brand-text-body">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-brand-text-heading font-heading">Role Capabilities</h2>
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Capabilities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
              {Object.entries({
                ...ROLE_PERMISSIONS,
                HR_MANAGER: ["HR_PORTAL_ONLY"],
                FUND_ADMINISTRATOR: ["FUND_PORTAL_ONLY"],
              }).map(([role, permissions]) => (
                <tr key={role}>
                  <td className="px-5 py-3 font-bold text-brand-text-heading">{role.replace(/_/g, " ")}</td>
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

    </div>
  );
}
