import { requireRole, ROLES } from "@/lib/rbac";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, FileUp } from "lucide-react";
import { createExtractionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ContractImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole(ROLES.UNDERWRITING);
  const { error } = await searchParams;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/contracts" className="inline-flex items-center gap-1 text-sm text-[#6C757D] hover:text-[#06B9AB] mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to contracts
      </Link>
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-[#000523] mb-1">
        <FileUp className="w-6 h-6 text-[#06B9AB]" /> Import from source
      </h1>
      <p className="text-sm text-[#6C757D] mb-6">
        Paste a converted markdown rate letter. The extractor proposes tariff candidates with source provenance and flags
        ambiguities — it never guesses a rate and never activates anything. You confirm everything before it becomes a DRAFT contract.
      </p>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#DC3545]/10 px-4 py-3 text-sm text-[#DC3545]">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <form action={createExtractionAction} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#6C757D] mb-1">Source file name (optional)</label>
          <input name="fileName" placeholder="CIC Insurance tariff.md" className="rounded-lg border border-gray-200 px-3 py-2 text-sm w-full" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#6C757D] mb-1">Markdown source</label>
          <textarea name="markdown" rows={16} required placeholder="# CIC Insurance tariff&#10;&#10;## Page 1&#10;..." className="rounded-lg border border-gray-200 px-3 py-2 text-sm w-full font-mono" />
        </div>
        <div className="flex justify-end">
          <button type="submit" className="rounded-lg bg-[#06B9AB] px-5 py-2 text-sm font-medium text-white hover:bg-[#05a598]">Extract</button>
        </div>
      </form>
    </div>
  );
}
