import { auth } from "@/lib/auth";
import { HRSidebar } from "@/components/layouts/HRSidebar";
import { Breadcrumbs } from "@/components/layouts/Breadcrumbs";
import { TenantThemeInjector } from "@/components/layouts/TenantThemeInjector";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function HRLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "HR_MANAGER") {
    redirect("/login");
  }

  const groupId = session.user.groupId;
  let groupName = "Manage Group";
  if (groupId) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true }
    });
    if (group) groupName = group.name;
  }

  return (
    <>
      {session.user.tenantId && (
        <TenantThemeInjector tenantId={session.user.tenantId} />
      )}
      <div className="flex min-h-screen bg-avenue-bg-alt/30">
        <HRSidebar groupName={groupName} userRole={session.user.role as string} />
        <div className="flex-1 ml-60 p-8">
          <Breadcrumbs />
          {children}
        </div>
      </div>
    </>
  );
}
