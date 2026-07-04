import { GitBranch, Tag } from "lucide-react";
import { PendingButton } from "@/components/ui/PendingButton";
import { createBranchAction, setBranchActiveAction, createAliasAction, deleteAliasAction } from "./actions";

/**
 * PR-007: branch + alias management on the provider detail page. Branches make
 * branch-scoped contracts matchable (engine precedence: branch-scoped LISTED
 * beats ALL_BRANCHES); aliases resolve legal-vs-trading name variance.
 */
export function ProviderBranchesCard({
  providerId,
  branches,
  aliases,
}: {
  providerId: string;
  branches: Array<{ id: string; name: string; code: string | null; county: string | null; isActive: boolean }>;
  aliases: Array<{ id: string; aliasName: string; source: string | null }>;
}) {
  const inp = "rounded-lg border border-[#EEEEEE] px-2 py-1.5 text-sm";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-5">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
        <h2 className="font-bold text-brand-text-heading font-heading flex items-center gap-2">
          <GitBranch size={16} className="text-brand-indigo" /> Branches ({branches.length})
        </h2>
      </div>

      {branches.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {branches.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3">
              <div>
                <span className={`font-semibold ${b.isActive ? "text-brand-text-heading" : "text-brand-text-muted line-through"}`}>
                  {b.name}
                </span>
                <span className="text-xs text-brand-text-muted ml-2">
                  {b.code ? `${b.code} · ` : ""}{b.county ?? "—"}
                </span>
                {!b.isActive && (
                  <span className="ml-2 rounded-full bg-[#6C757D]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#6C757D]">inactive</span>
                )}
              </div>
              <form action={setBranchActiveAction}>
                <input type="hidden" name="providerId" value={providerId} />
                <input type="hidden" name="branchId" value={b.id} />
                <input type="hidden" name="isActive" value={b.isActive ? "false" : "true"} />
                <PendingButton className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                  b.isActive
                    ? "border-[#DC3545]/40 text-[#DC3545] hover:bg-[#DC3545]/10"
                    : "border-[#28A745]/40 text-[#28A745] hover:bg-[#28A745]/10"
                }`}>
                  {b.isActive ? "Deactivate" : "Reactivate"}
                </PendingButton>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-brand-text-muted">
          No branches — branch-scoped (LISTED) contracts for this provider cannot activate until branches exist.
        </p>
      )}

      <form action={createBranchAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="providerId" value={providerId} />
        <input name="name" required placeholder="Branch name (e.g. Kikuyu)" className={`${inp} flex-1 min-w-40`} />
        <input name="code" placeholder="Code" className={`${inp} w-24`} />
        <input name="county" placeholder="County" className={`${inp} w-32`} />
        <PendingButton className="rounded-full bg-brand-indigo px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-secondary">
          Add branch
        </PendingButton>
      </form>

      {/* Aliases (legal vs trading names) */}
      <div className="border-t border-[#EEEEEE] pt-4 space-y-3">
        <h3 className="text-sm font-bold text-brand-text-heading flex items-center gap-2">
          <Tag size={14} className="text-brand-indigo" /> Name aliases ({aliases.length})
        </h3>
        {aliases.length > 0 && (
          <ul className="space-y-1 text-sm">
            {aliases.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span>
                  {a.aliasName}
                  {a.source && <span className="text-xs text-brand-text-muted ml-2">({a.source})</span>}
                </span>
                <form action={deleteAliasAction}>
                  <input type="hidden" name="providerId" value={providerId} />
                  <input type="hidden" name="aliasId" value={a.id} />
                  <PendingButton className="text-xs text-[#DC3545] hover:underline">remove</PendingButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={createAliasAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="providerId" value={providerId} />
          <input name="aliasName" required placeholder="Alias (e.g. legal name)" className={`${inp} flex-1 min-w-40`} />
          <input name="source" placeholder="Source (optional)" className={`${inp} w-40`} />
          <PendingButton className="rounded-full border border-brand-indigo px-4 py-1.5 text-xs font-bold text-brand-indigo hover:bg-brand-indigo/5">
            Add alias
          </PendingButton>
        </form>
      </div>
    </div>
  );
}
