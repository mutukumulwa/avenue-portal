import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Mail } from "lucide-react";
import Link from "next/link";
import { lettersService } from "@/server/services/letters.service";
import { revalidatePath } from "next/cache";
import type { LetterType } from "@/server/templates/pdf/letter.template";

const LETTER_TYPES: Array<{ value: LetterType; label: string; description: string }> = [
  { value: "WELCOME",                    label: "Welcome Letter",             description: "Issued when a member first activates" },
  { value: "RENEWAL_NOTICE",             label: "Renewal Notice",             description: "Sent 60 days before cover end" },
  { value: "LAPSE_NOTICE",               label: "Lapse Notice",               description: "Informs member their cover has lapsed" },
  { value: "REINSTATEMENT_CONFIRMATION", label: "Reinstatement Confirmation", description: "Confirms cover has been reinstated" },
  { value: "TERMINATION_NOTICE",         label: "Termination Notice",         description: "Formal termination notification" },
  { value: "CUSTOM_MEMO",                label: "Custom Memo",                description: "Free-form letter with custom content" },
];

async function generateLetterAction(formData: FormData) {
  "use server";
  const { requireRole, ROLES } = await import("@/lib/rbac");
  const session    = await requireRole(ROLES.OPS);
  const memberId   = formData.get("memberId") as string;
  const letterType = formData.get("letterType") as LetterType;
  const context: Record<string, string> = {};
  const renewalDate   = formData.get("renewalDate")   as string;
  const effectiveDate = formData.get("effectiveDate") as string;
  const reason        = formData.get("reason")        as string;
  const content       = formData.get("content")       as string;
  if (renewalDate)   context.renewalDate   = renewalDate;
  if (effectiveDate) context.effectiveDate = effectiveDate;
  if (reason)        context.reason        = reason;
  if (content)       context.content       = content;

  await lettersService.generateLetter({
    tenantId:      session.user.tenantId,
    memberId,
    letterType,
    generatedById: session.user.id,
    context,
  });
  revalidatePath(`/members/${memberId}/letters`);
}

export default async function MemberLettersPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const member = await prisma.member.findUnique({
    where: { id, tenantId },
    select: { id: true, firstName: true, lastName: true, memberNumber: true },
  });
  if (!member) notFound();

  const letters = await lettersService.getMemberLetters(id, tenantId);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/members/${id}`} className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-brand-text-heading font-heading">
            Letters — {member.firstName} {member.lastName}
          </h1>
          <p className="text-sm text-brand-text-muted mt-0.5">{member.memberNumber}</p>
        </div>
      </div>

      {/* Generate letter form */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-brand-text-heading text-sm flex items-center gap-2">
          <FileText size={15} className="text-brand-indigo" /> Generate Letter
        </h2>
        <form action={generateLetterAction} className="space-y-4">
          <input type="hidden" name="memberId" value={id} />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Letter Type</label>
              <select name="letterType" required
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none">
                {LETTER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Effective / Renewal Date (if applicable)</label>
              <input name="effectiveDate" type="date"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-text-muted mb-1">Reason / Additional Context (optional)</label>
            <input name="reason" type="text" placeholder="e.g. non-payment of contributions"
              className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-text-muted mb-1">Custom memo content (Custom Memo type only)</label>
            <textarea name="content" rows={3} placeholder="Enter the body of your custom memo here…"
              className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm resize-none" />
          </div>

          <div className="flex justify-end">
            <button type="submit"
              className="bg-brand-indigo text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors flex items-center gap-2">
              <FileText size={14} /> Generate & Download
            </button>
          </div>
        </form>
      </div>

      {/* Letter history */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EEEEEE] flex items-center gap-2">
          <Mail size={15} className="text-brand-text-muted" />
          <h2 className="font-semibold text-brand-text-heading text-sm">Letter History</h2>
          <span className="ml-auto text-xs text-brand-text-muted">{letters.length} letter{letters.length !== 1 ? "s" : ""}</span>
        </div>
        {letters.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-brand-text-muted">No letters generated yet.</p>
        ) : (
          <div className="divide-y divide-[#EEEEEE]">
            {letters.map((l) => (
              <div key={l.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-brand-text-heading">{l.subject}</p>
                  <p className="text-xs text-brand-text-muted mt-0.5">
                    {new Date(l.sentAt).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#28A745]/10 text-[#28A745]">
                  {l.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
