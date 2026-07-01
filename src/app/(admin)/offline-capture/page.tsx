import { requireRole, ROLES } from "@/lib/rbac";
import { CaptureClient } from "./CaptureClient";
import { CloudOff } from "lucide-react";

export default async function OfflineCapturePage() {
  await requireRole(ROLES.OPS);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CloudOff className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Offline Capture</h1>
          <p className="text-sm text-brand-text-muted">
            Point-of-care claim capture that works offline. Entries are buffered
            in the browser (IndexedDB) with an idempotency key and store-and-
            forward to the server on reconnect, where each is re-validated and
            becomes a claim (or is flagged for review — never lost).
          </p>
        </div>
      </div>
      <CaptureClient />
    </div>
  );
}
