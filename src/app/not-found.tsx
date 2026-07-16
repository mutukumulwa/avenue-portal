import { FileQuestion } from "lucide-react";
import Link from "next/link";

// CU-OBS-4: branded 404 in place of the framework default (the Access-Denied
// page at /unauthorized is the styling reference).
export default function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
      <FileQuestion size={48} className="text-brand-indigo mb-4" />
      <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Page Not Found</h1>
      <p className="text-brand-text-body mt-2 max-w-sm">
        The page you are looking for does not exist or may have been moved. Check the address, or head
        back to your dashboard.
      </p>
      <Link
        href="/"
        className="mt-6 bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors text-sm"
      >
        Back to Home
      </Link>
    </div>
  );
}
