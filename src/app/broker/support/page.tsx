import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MessageSquare, Phone, Mail } from "lucide-react";

export default async function BrokerSupportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Support</h1>
        <p className="text-avenue-text-muted mt-1">Get help with your account, groups, or submissions.</p>
      </div>

      <div className="grid gap-4">
        {[
          { icon: Phone, title: "Call Us", desc: "Speak directly to an underwriter or customer service rep.", action: "0800 720 999", href: "tel:0800720999" },
          { icon: Mail, title: "Email Support", desc: "Send us a query and receive a response within 24 hours.", action: "support@avenue.healthcare", href: "mailto:support@avenue.healthcare" },
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
        <input
          placeholder="Subject"
          className="w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo"
        />
        <textarea
          placeholder="Describe your issue..."
          rows={5}
          className="w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo"
        />
        <button className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors">
          Send Query
        </button>
      </div>
    </div>
  );
}
