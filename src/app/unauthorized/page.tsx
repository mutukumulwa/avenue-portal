import { ShieldX } from "lucide-react";
import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
      <ShieldX size={48} className="text-[#DC3545] mb-4" />
      <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Access Denied</h1>
      <p className="text-avenue-text-body mt-2 max-w-sm">
        You do not have permission to view this page. Contact your system administrator if you believe this is an error.
      </p>
      <Link
        href="/login"
        className="mt-6 bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors text-sm"
      >
        Back to Login
      </Link>
    </div>
  );
}
