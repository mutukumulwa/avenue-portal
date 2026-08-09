import { MemberNav } from "@/components/layouts/MemberNav";
import { MemberInstallPrompt } from "@/components/member/MemberInstallPrompt";
import { getCachedSession } from "@/lib/auth";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  // DEF-001: load the session so the persistent shell can show the signed-in
  // actor. The member surface is still independently authorized per page.
  const session = await getCachedSession();
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <MemberNav actorName={session?.user?.name ?? null} />
      <main className="max-w-5xl mx-auto px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <MemberInstallPrompt />
        {children}
      </main>
    </div>
  );
}
