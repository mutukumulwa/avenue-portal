import { redirect } from "next/navigation";

// The provider-scoped contract workspace has been unified into the single
// Contracts module (/contracts). This route now permanently redirects so any
// existing bookmarks/links continue to resolve.
export default async function LegacyContractRedirect({ params }: { params: Promise<{ id: string; contractId: string }> }) {
  const { contractId } = await params;
  redirect(`/contracts/${contractId}`);
}
