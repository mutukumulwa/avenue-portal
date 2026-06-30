import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MessageSquare, Phone, Mail } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { submitBrokerSupportAction } from "./actions";

export default async function BrokerSupportPage(
  props: { searchParams: Promise<{ submitted?: string; error?: string }> }
) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const searchParams = await props.searchParams;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { brokerId: true },
  });

  const groups = user?.brokerId
    ? await prisma.group.findMany({
        where: { tenantId: session.user.tenantId, brokerId: user.brokerId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const recentRequests = groups.length > 0
    ? await prisma.serviceRequest.findMany({
        where: { tenantId: session.user.tenantId, groupId: { in: groups.map((group) => group.id) } },
        include: { group: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : [];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Support</h1>
        <p className="text-avenue-text-muted mt-1">Get help with your account, groups, or submissions.</p>
      </div>

      <div className="grid gap-4">
        {[
          { icon: Phone, title: "Call Us", desc: "Speak directly to an underwriter or customer service rep.", action: "0800 720 999", href: "tel:0800720999" },
          { icon: Mail, title: "Email Support", desc: "Send us a query and receive a response within 24 hours.", action: "support@medvex.co.ug", href: "mailto:support@medvex.co.ug" },
          { icon: MessageSquare, title: "WhatsApp", desc: "Chat with us on WhatsApp for quick turnaround.", action: "+254 700 000 000", href: "https://wa.me/254700000000" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.title}
              href={item.href}
              className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm flex items-start gap-4 hover:border-avenue-indigo/30 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 bg-avenue-indigo/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon size={20} className="text-avenue-indigo" />
              </div>
              <div>
                <h2 className="font-bold text-avenue-text-heading group-hover:text-avenue-indigo transition-colors">{item.title}</h2>
                <p className="text-sm text-avenue-text-body mt-0.5">{item.desc}</p>
                <p className="text-sm font-semibold text-avenue-indigo mt-1">{item.action}</p>
              </div>
            </a>
          );
        })}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="font-bold text-avenue-text-heading font-heading">Submit a Query</h2>
        {searchParams.submitted && (
          <p className="rounded-md border border-[#28A745]/30 bg-[#28A745]/10 px-3 py-2 text-sm font-semibold text-[#28A745]">
            Query submitted.
          </p>
        )}
        {searchParams.error && (
          <p className="rounded-md border border-[#DC3545]/30 bg-[#DC3545]/10 px-3 py-2 text-sm font-semibold text-[#DC3545]">
            Could not submit the query. Check the required fields and group.
          </p>
        )}
        {groups.length === 0 ? (
          <p className="text-sm text-avenue-text-body">
            No groups are currently linked to your broker profile, so a tracked support request cannot be opened from the portal.
          </p>
        ) : (
          <form action={submitBrokerSupportAction} className="space-y-4">
            <select
              name="groupId"
              required
              className="w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo bg-white"
            >
              <option value="">Select group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select
                name="category"
                required
                defaultValue="GENERAL"
                className="w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo bg-white"
              >
                <option value="MEMBER_QUERY">Membership Query</option>
                <option value="CLAIM_QUERY">Claims Query</option>
                <option value="INVOICE_QUERY">Billing Query</option>
                <option value="CARD_REQUEST">Card Request</option>
                <option value="BENEFIT_QUERY">Benefit Query</option>
                <option value="GENERAL">General Support</option>
              </select>
              <select
                name="priority"
                required
                defaultValue="NORMAL"
                className="w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo bg-white"
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <input
              name="subject"
              required
              placeholder="Subject"
              className="w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo"
            />
            <textarea
              name="body"
              required
              placeholder="Describe your issue..."
              rows={5}
              className="w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo"
            />
            <button type="submit" className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors">
              Send Query
            </button>
          </form>
        )}
      </div>

      {recentRequests.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm space-y-3">
          <h2 className="font-bold text-avenue-text-heading font-heading">Recent Queries</h2>
          <div className="divide-y divide-[#EEEEEE]">
            {recentRequests.map((request) => (
              <div key={request.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-avenue-text-heading">{request.subject}</p>
                  <span className="text-[10px] font-bold uppercase text-avenue-text-muted">{request.status.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-avenue-text-muted mt-1">{request.group.name} · {request.category.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
