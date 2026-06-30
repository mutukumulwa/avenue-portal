import { requireRole, ROLES } from "@/lib/rbac";
import { MemberNotificationService } from "@/server/services/member-notification.service";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { markAllMemberNotificationsReadAction, markMemberNotificationReadAction } from "./actions";

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" });
}

function priorityTone(priority: string, unread: boolean) {
  if (priority === "HIGH") return unread ? "border-[#DC3545]/30 bg-[#DC3545]/5" : "border-[#EEEEEE] bg-white";
  if (priority === "LOW") return "border-[#EEEEEE] bg-white";
  return unread ? "border-[#17A2B8]/30 bg-[#17A2B8]/5" : "border-[#EEEEEE] bg-white";
}

export default async function MemberNotificationsPage() {
  const session = await requireRole(ROLES.MEMBER);
  const inbox = await MemberNotificationService.getInboxForUser(session.user.id, session.user.tenantId);

  if (!inbox) redirect("/login");

  return (
    <div className="space-y-6 font-ui">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-brand-text-muted">Member inbox</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-text-heading">Notifications</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-text-muted">
            Pre-auth decisions, wallet updates, benefit alerts, and document availability notices.
          </p>
        </div>
        <form action={markAllMemberNotificationsReadAction}>
          <button className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#EEEEEE] bg-white px-4 py-2.5 text-sm font-semibold text-brand-indigo shadow-sm hover:bg-[#F8F9FA]">
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        </form>
      </div>

      <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-brand-indigo/10 text-brand-indigo">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-brand-text-muted">Unread</p>
            <p className="text-2xl font-bold tabular-nums text-brand-text-heading">{inbox.unreadCount}</p>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {inbox.notifications.map((notification) => {
          const unread = notification.readAt === null;
          return (
            <article key={notification.id} className={`rounded-[8px] border p-5 shadow-sm ${priorityTone(notification.priority, unread)}`}>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand-indigo/10 px-2.5 py-1 text-[10px] font-bold uppercase text-brand-indigo">
                      {notification.typeLabel}
                    </span>
                    {unread && (
                      <span className="rounded-full bg-[#28A745]/10 px-2.5 py-1 text-[10px] font-bold uppercase text-[#1F7A34]">
                        New
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-base font-bold text-brand-text-heading">{notification.title}</h2>
                  <p className="mt-1 text-sm text-brand-text-muted">{notification.body}</p>
                  <p className="mt-2 text-xs text-brand-text-muted">{formatDate(notification.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  {unread && (
                    <form action={markMemberNotificationReadAction}>
                      <input type="hidden" name="notificationId" value={notification.id} />
                      <button className="rounded-[8px] border border-[#EEEEEE] bg-white px-3 py-2 text-xs font-semibold text-brand-indigo hover:bg-[#F8F9FA]">
                        Mark read
                      </button>
                    </form>
                  )}
                  {notification.href && (
                    <Link href={notification.href} className="inline-flex items-center gap-1 rounded-[8px] bg-brand-indigo px-3 py-2 text-xs font-semibold text-white">
                      Open <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {inbox.notifications.length === 0 && (
          <div className="rounded-[8px] border border-dashed border-[#D6DCE5] bg-white p-8 text-center shadow-sm">
            <h2 className="text-base font-bold text-brand-text-heading">No notifications yet</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-brand-text-muted">
              Updates about approvals, payments, benefits, and documents will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
