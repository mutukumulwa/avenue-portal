import { requireRole, ROLES } from "@/lib/rbac";
import { MemberAppService } from "@/server/services/member-app.service";
import { Download, EyeOff, FileText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

function formatDate(value: Date | null) {
  if (!value) return "Available now";
  return new Date(value).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCategory(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export default async function MemberDocumentsPage() {
  const session = await requireRole(ROLES.MEMBER);
  const repository = await MemberAppService.getDocumentsForUser(session.user.id, session.user.tenantId);

  if (!repository) redirect("/login");

  return (
    <div className="space-y-6 font-ui">
      <div>
        <p className="text-xs font-bold uppercase text-brand-text-muted">Member repository</p>
        <h1 className="mt-1 text-2xl font-bold text-brand-text-heading">Documents</h1>
        <p className="mt-1 max-w-2xl text-sm text-brand-text-muted">
          Membership cards, plan documents, pre-authorization letters, and visible care documents in one place.
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-brand-text-muted">Available documents</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-brand-text-heading">{repository.totalCount}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-brand-text-muted">Covered members</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-brand-text-heading">{repository.members.length}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-brand-text-muted">Hidden private docs</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-brand-text-heading">{repository.hiddenSensitiveCount}</p>
        </div>
      </section>

      {repository.hiddenSensitiveCount > 0 && (
        <section className="rounded-[8px] border border-[#17A2B8]/25 bg-[#17A2B8]/5 p-4">
          <div className="flex items-start gap-3">
            <EyeOff className="mt-0.5 h-5 w-5 text-[#0F6F7D]" />
            <div>
              <p className="font-bold text-brand-text-heading">Family privacy applied</p>
              <p className="mt-1 text-sm text-brand-text-muted">{repository.privacyNote}</p>
            </div>
          </div>
        </section>
      )}

      <div className="space-y-6">
        {repository.sections.map((section) => (
          <section key={section.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-bold text-brand-text-heading">{section.title}</h2>
              <span className="rounded-full bg-brand-indigo/10 px-2.5 py-1 text-xs font-bold text-brand-indigo">
                {section.documents.length}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {section.documents.map((document) => (
                <article key={document.id} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-brand-indigo/10 text-brand-indigo">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-brand-text-heading">{document.fileName}</p>
                      <p className="mt-1 text-sm text-brand-text-muted">{document.ownerName} · {document.source}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#F8F9FA] px-2.5 py-1 text-[10px] font-bold uppercase text-brand-text-muted">
                          {formatCategory(document.category)}
                        </span>
                        <span className="text-xs text-brand-text-muted">{formatDate(document.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={document.fileUrl}
                    className="mt-4 inline-flex items-center gap-2 rounded-[8px] bg-brand-indigo px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-indigo-hover"
                  >
                    <Download className="h-4 w-4" />
                    Open
                  </Link>
                </article>
              ))}
              {section.documents.length === 0 && (
                <div className="rounded-[8px] border border-dashed border-[#D6DCE5] bg-white p-6 text-center text-sm text-brand-text-muted">
                  No documents in this section yet.
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
