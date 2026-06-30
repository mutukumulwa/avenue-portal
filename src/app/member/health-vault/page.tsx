import { requireRole, ROLES } from "@/lib/rbac";
import { MemberHealthVaultService } from "@/server/services/member-health-vault.service";
import { addJournalEntryAction, addVitalEntryAction, revokeHealthShareAction, shareHealthRecordWithPreAuthAction, shareHealthRecordWithProviderAction, uploadHealthFileAction } from "./actions";
import { Activity, FileText, HeartPulse, NotebookPen, Share2, Upload, X } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VoiceNoteRecorder } from "./VoiceNoteRecorder";

function formatDate(value: Date | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value: Date | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatBytes(value: number | null) {
  if (!value) return "File";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function formatCategory(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function formatVital(value: number | null, suffix = "") {
  if (value === null) return "—";
  return `${value}${suffix}`;
}

function ShareWithPreAuthForm({
  preauthTargets,
  healthFileId,
  journalEntryId,
}: {
  preauthTargets: Array<{ id: string; preauthNumber: string; providerName: string; status: string }>;
  healthFileId?: string;
  journalEntryId?: string;
}) {
  if (preauthTargets.length === 0) {
    return (
      <p className="mt-3 rounded-[8px] bg-[#F8F9FA] px-3 py-2 text-xs text-brand-text-muted">
        Create or open a pre-authorization request before sharing this with a reviewer.
      </p>
    );
  }

  return (
    <form action={shareHealthRecordWithPreAuthAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
      {healthFileId && <input type="hidden" name="healthFileId" value={healthFileId} />}
      {journalEntryId && <input type="hidden" name="journalEntryId" value={journalEntryId} />}
      <select name="preauthId" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm">
        {preauthTargets.map((preauth) => (
          <option key={preauth.id} value={preauth.id}>
            {preauth.preauthNumber} · {preauth.providerName}
          </option>
        ))}
      </select>
      <select name="shareExpiry" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm">
        <option value="168">7 days</option>
        <option value="720">30 days</option>
        <option value="none">Until revoked</option>
      </select>
      <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-brand-indigo px-3 py-2 text-sm font-semibold text-white">
        <Share2 className="h-4 w-4" />
        Share
      </button>
    </form>
  );
}

function ShareWithProviderForm({
  providerTargets,
  healthFileId,
  journalEntryId,
}: {
  providerTargets: Array<{ id: string; name: string; tier: string; county: string | null }>;
  healthFileId?: string;
  journalEntryId?: string;
}) {
  if (providerTargets.length === 0) {
    return (
      <p className="mt-2 rounded-[8px] bg-[#F8F9FA] px-3 py-2 text-xs text-brand-text-muted">
        No active providers are available for direct sharing.
      </p>
    );
  }

  return (
    <form action={shareHealthRecordWithProviderAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
      {healthFileId && <input type="hidden" name="healthFileId" value={healthFileId} />}
      {journalEntryId && <input type="hidden" name="journalEntryId" value={journalEntryId} />}
      <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
        <select name="providerId" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm">
          {providerTargets.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name} · {provider.county ?? provider.tier}
            </option>
          ))}
        </select>
        <select name="shareExpiry" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm">
          <option value="168">7 days</option>
          <option value="720">30 days</option>
          <option value="none">Until revoked</option>
        </select>
      </div>
      <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm font-semibold text-brand-text-heading hover:bg-[#F8F9FA]">
        <Share2 className="h-4 w-4" />
        Share with provider
      </button>
    </form>
  );
}

function ActiveShares({
  shares,
  preauthTargets,
  providerTargets,
}: {
  shares: Array<{ id: string; providerId: string | null; preauthId: string | null; expiresAt: Date | null; createdAt: Date }>;
  preauthTargets: Array<{ id: string; preauthNumber: string; providerName: string }>;
  providerTargets: Array<{ id: string; name: string }>;
}) {
  const activeShares = shares.filter((share) => share.preauthId || share.providerId);
  if (activeShares.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {activeShares.map((share) => {
        const preauthTarget = preauthTargets.find((preauth) => preauth.id === share.preauthId);
        const providerTarget = providerTargets.find((provider) => provider.id === share.providerId);
        return (
          <form key={share.id} action={revokeHealthShareAction} className="flex items-center justify-between gap-2 rounded-[8px] bg-[#28A745]/10 px-3 py-2 text-xs text-[#1F7A34]">
            <input type="hidden" name="shareId" value={share.id} />
            {share.preauthId && <input type="hidden" name="preauthId" value={share.preauthId} />}
            {share.providerId && <input type="hidden" name="providerId" value={share.providerId} />}
            <span className="min-w-0 truncate">
              Shared with {preauthTarget ? `${preauthTarget.preauthNumber} · ${preauthTarget.providerName}` : providerTarget?.name ?? "provider"}
              {share.expiresAt ? ` · expires ${formatDateTime(share.expiresAt)}` : " · until revoked"}
            </span>
            <button type="submit" className="inline-flex shrink-0 items-center gap-1 font-bold">
              <X className="h-3.5 w-3.5" />
              Revoke
            </button>
          </form>
        );
      })}
    </div>
  );
}

export default async function MemberHealthVaultPage() {
  const session = await requireRole(ROLES.MEMBER);
  const vault = await MemberHealthVaultService.getVaultForUser(session.user.id, session.user.tenantId);

  if (!vault) redirect("/login");

  const latestVital = vault.vitals[0] ?? null;

  return (
    <div className="space-y-6 font-ui">
      <div>
        <p className="text-xs font-bold uppercase text-brand-text-muted">Private member workspace</p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-brand-text-heading">Health Vault</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-brand-text-muted">
          Keep lab results, prescriptions, vitals, and health notes together. Records stay private until sharing is explicitly enabled.
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <FileText className="h-5 w-5 text-brand-indigo" />
          <p className="mt-3 text-xs font-bold uppercase text-brand-text-muted">Health files</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-brand-text-heading">{vault.summary.fileCount}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <HeartPulse className="h-5 w-5 text-[#28A745]" />
          <p className="mt-3 text-xs font-bold uppercase text-brand-text-muted">Last vitals</p>
          <p className="mt-1 text-lg font-bold text-brand-text-heading">{formatDate(vault.summary.lastVitalAt)}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <NotebookPen className="h-5 w-5 text-[#17A2B8]" />
          <p className="mt-3 text-xs font-bold uppercase text-brand-text-muted">Journal notes</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-brand-text-heading">{vault.summary.journalCount}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <form action={uploadHealthFileAction} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-brand-indigo/10 text-brand-indigo">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-brand-text-heading">Upload a health file</h2>
              <p className="text-sm text-brand-text-muted">PDF, image, or Word document up to 10 MB.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold text-brand-text-heading">
              Title
              <input name="title" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 font-normal" placeholder="March lab results" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-brand-text-heading">
              Category
              <select name="category" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 font-normal">
                <option value="LAB_RESULT">Lab result</option>
                <option value="RADIOLOGY">Radiology</option>
                <option value="PRESCRIPTION">Prescription</option>
                <option value="DISCHARGE_SUMMARY">Discharge summary</option>
                <option value="REFERRAL">Referral</option>
                <option value="VACCINATION">Vaccination</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-brand-text-heading">
              Date on document
              <input name="capturedAt" type="date" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-brand-text-heading">
              File
              <input name="file" type="file" accept=".pdf,image/*,.doc,.docx" required className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-brand-text-heading">
              Notes
              <textarea name="notes" rows={3} className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 font-normal" placeholder="Optional context for a future doctor visit" />
            </label>
          </div>
          <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-[8px] bg-brand-indigo px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-indigo-hover">
            <Upload className="h-4 w-4" />
            Save file
          </button>
        </form>

        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Latest vitals</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[8px] bg-[#F8F9FA] p-3">
              <p className="text-xs font-bold uppercase text-brand-text-muted">BP</p>
              <p className="mt-1 font-bold tabular-nums text-brand-text-heading">
                {latestVital?.systolicBp && latestVital?.diastolicBp ? `${latestVital.systolicBp}/${latestVital.diastolicBp}` : "—"}
              </p>
            </div>
            <div className="rounded-[8px] bg-[#F8F9FA] p-3">
              <p className="text-xs font-bold uppercase text-brand-text-muted">Heart rate</p>
              <p className="mt-1 font-bold tabular-nums text-brand-text-heading">{formatVital(latestVital?.heartRate ?? null, " bpm")}</p>
            </div>
            <div className="rounded-[8px] bg-[#F8F9FA] p-3">
              <p className="text-xs font-bold uppercase text-brand-text-muted">Temp</p>
              <p className="mt-1 font-bold tabular-nums text-brand-text-heading">{formatVital(latestVital?.temperatureC ?? null, "°C")}</p>
            </div>
            <div className="rounded-[8px] bg-[#F8F9FA] p-3">
              <p className="text-xs font-bold uppercase text-brand-text-muted">SpO2</p>
              <p className="mt-1 font-bold tabular-nums text-brand-text-heading">{formatVital(latestVital?.oxygenSaturation ?? null, "%")}</p>
            </div>
          </div>

          <form action={addVitalEntryAction} className="mt-5 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold text-brand-text-heading">
              Recorded at
              <input name="recordedAt" type="datetime-local" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 font-normal" />
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <input name="systolicBp" type="number" min="40" max="260" placeholder="Sys BP" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2" />
              <input name="diastolicBp" type="number" min="30" max="180" placeholder="Dia BP" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2" />
              <input name="heartRate" type="number" min="30" max="220" placeholder="HR" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2" />
              <input name="temperatureC" type="number" step="0.1" min="30" max="45" placeholder="Temp" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2" />
              <input name="oxygenSaturation" type="number" min="50" max="100" placeholder="SpO2" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2" />
              <input name="weightKg" type="number" step="0.1" min="1" max="300" placeholder="Weight" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2" />
              <input name="bloodSugar" type="number" step="0.1" min="0" max="50" placeholder="Sugar" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 sm:col-span-2" />
            </div>
            <textarea name="notes" rows={2} placeholder="Optional notes" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2" />
            <button type="submit" className="inline-flex w-fit items-center gap-2 rounded-[8px] bg-brand-indigo px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-indigo-hover">
              <Activity className="h-4 w-4" />
              Save vitals
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <form action={addJournalEntryAction} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Add a health note</h2>
            <p className="mt-1 text-sm text-brand-text-muted">Capture symptoms, medication notes, and questions for a future doctor visit.</p>
            <div className="mt-4 grid gap-3">
              <select name="entryType" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2">
                <option value="NOTE">General note</option>
                <option value="SYMPTOM">Symptom</option>
                <option value="MEDICATION">Medication</option>
                <option value="QUESTION">Question for doctor</option>
              </select>
              <textarea name="noteText" rows={5} required className="rounded-[8px] border border-[#D6DCE5] px-3 py-2" placeholder="What changed, what you felt, or what you want to ask at the next visit" />
              <input name="tags" className="rounded-[8px] border border-[#D6DCE5] px-3 py-2" placeholder="Tags, separated by commas" />
            </div>
            <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-[8px] bg-brand-indigo px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-indigo-hover">
              <NotebookPen className="h-4 w-4" />
              Save note
            </button>
          </form>

          <VoiceNoteRecorder />
        </div>

        <div className="space-y-4">
          <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Recent files</h2>
            <div className="mt-4 space-y-3">
              {vault.files.slice(0, 5).map((file) => (
                <article key={file.id} className="rounded-[8px] border border-[#EEEEEE] p-3">
                  <Link href={file.fileUrl} className="block hover:text-brand-indigo">
                    <p className="font-bold text-brand-text-heading">{file.title}</p>
                    <p className="mt-1 text-sm text-brand-text-muted">{formatCategory(file.category)} · {formatBytes(file.fileSize)} · {formatDate(file.capturedAt ?? file.createdAt)}</p>
                    {file.notes && <p className="mt-2 text-sm text-brand-text-muted">{file.notes}</p>}
                  </Link>
                  <ActiveShares shares={file.shares} preauthTargets={vault.preauthTargets} providerTargets={vault.providerTargets} />
                  <ShareWithPreAuthForm preauthTargets={vault.preauthTargets} healthFileId={file.id} />
                  <ShareWithProviderForm providerTargets={vault.providerTargets} healthFileId={file.id} />
                </article>
              ))}
              {vault.files.length === 0 && <p className="py-6 text-center text-sm text-brand-text-muted">No health files yet.</p>}
            </div>
          </section>

          <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Recent notes</h2>
            <div className="mt-4 space-y-3">
              {vault.journalEntries.slice(0, 5).map((entry) => (
                <article key={entry.id} className="rounded-[8px] border border-[#EEEEEE] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-brand-indigo/10 px-2 py-0.5 text-[11px] font-bold uppercase text-brand-indigo">{formatCategory(entry.entryType)}</span>
                    <span className="text-xs text-brand-text-muted">{formatDateTime(entry.recordedAt)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-brand-text-heading">{entry.noteText}</p>
                  {entry.audioUrl && (
                    <audio controls src={entry.audioUrl} className="mt-3 w-full">
                      <track kind="captions" />
                    </audio>
                  )}
                  {entry.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-[#F8F9FA] px-2 py-0.5 text-[11px] text-brand-text-muted">{tag}</span>
                      ))}
                    </div>
                  )}
                  <ActiveShares shares={entry.shares} preauthTargets={vault.preauthTargets} providerTargets={vault.providerTargets} />
                  <ShareWithPreAuthForm preauthTargets={vault.preauthTargets} journalEntryId={entry.id} />
                  <ShareWithProviderForm providerTargets={vault.providerTargets} journalEntryId={entry.id} />
                </article>
              ))}
              {vault.journalEntries.length === 0 && <p className="py-6 text-center text-sm text-brand-text-muted">No journal notes yet.</p>}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
