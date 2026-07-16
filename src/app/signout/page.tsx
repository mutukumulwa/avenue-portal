import { LogOut } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/lib/auth";

// CU-OBS-4: branded sign-out confirmation in place of the unbranded NextAuth
// default (registered via `pages.signOut` in src/lib/auth.ts).
export default function SignOutPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
      <LogOut size={48} className="text-brand-indigo mb-4" />
      <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Sign Out</h1>
      <p className="text-brand-text-body mt-2 max-w-sm">Are you sure you want to sign out?</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
        className="mt-6 flex items-center gap-3"
      >
        <button
          type="submit"
          className="bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors text-sm"
        >
          Sign Out
        </button>
        <Link
          href="/"
          className="px-6 py-2 rounded-full border border-[#EEEEEE] text-brand-text-body hover:border-brand-indigo hover:text-brand-indigo transition-colors text-sm font-semibold"
        >
          Cancel
        </Link>
      </form>
    </div>
  );
}
