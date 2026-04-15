import { requireRole, ROLES } from "@/lib/rbac";
import { Phone, Mail, MessageSquare } from "lucide-react";
import { ComplaintForm } from "./ComplaintForm";

export default async function MemberSupportPage() {
  await requireRole(ROLES.MEMBER);

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Support</h1>
        <p className="text-avenue-text-muted mt-1 text-sm">We are here to help with any questions about your cover.</p>
      </div>

      {/* Contact channels */}
      <div className="grid gap-3">
        {[
          { icon: Phone,        title: "24/7 Helpline",  desc: "Emergency medical queries and authorizations.", action: "0800 720 999",              href: "tel:0800720999" },
          { icon: MessageSquare,title: "WhatsApp",       desc: "Chat with a representative in minutes.",        action: "+254 700 000 000",           href: "https://wa.me/254700000000" },
          { icon: Mail,         title: "Email",          desc: "Non-urgent queries answered within 24 hours.",  action: "member@avenue.healthcare",   href: "mailto:member@avenue.healthcare" },
        ].map(item => {
          const Icon = item.icon;
          return (
            <a
              key={item.title}
              href={item.href}
              className="bg-white border border-[#EEEEEE] rounded-lg p-4 flex items-center gap-4 hover:border-avenue-indigo/30 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 bg-avenue-indigo/10 rounded-lg flex items-center justify-center shrink-0">
                <Icon size={20} className="text-avenue-indigo" />
              </div>
              <div>
                <p className="font-bold text-avenue-text-heading group-hover:text-avenue-indigo transition-colors">{item.title}</p>
                <p className="text-xs text-avenue-text-muted">{item.desc}</p>
                <p className="text-sm font-semibold text-avenue-indigo mt-0.5">{item.action}</p>
              </div>
            </a>
          );
        })}
      </div>

      {/* Complaint / grievance form */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-4">
        <div>
          <h2 className="font-bold text-avenue-text-heading font-heading">Submit a Grievance</h2>
          <p className="text-xs text-avenue-text-muted mt-0.5">
            Use this form for formal complaints about Avenue services, network facilities, or billing disputes.
            You will receive a reference number on submission.
          </p>
        </div>
        <ComplaintForm />
      </div>
    </div>
  );
}
