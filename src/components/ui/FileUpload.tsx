"use client";

import { useRef, useState } from "react";
import { Upload, X, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export type DocumentCategory =
  | "CLAIM_SUPPORT"
  | "LAB_RESULT"
  | "DISCHARGE_SUMMARY"
  | "ENDORSEMENT"
  | "INVOICE"
  | "AGREEMENT"
  | "TARIFF_SCHEDULE"
  | "QUOTATION"
  | "MEMBER_LIST";

interface FileUploadProps {
  category: DocumentCategory;
  claimId?: string;
  preauthId?: string;
  groupId?: string;
  endorsementId?: string;
  onUploadComplete?: (documentId: string, fileUrl: string, fileName: string) => void;
  label?: string;
  accept?: string;
}

interface UploadedFile {
  name: string;
  documentId: string;
  fileUrl: string;
}

export function FileUpload({
  category,
  claimId,
  preauthId,
  groupId,
  endorsementId,
  onUploadComplete,
  label = "Upload Document",
  accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFile[]>([]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setError(null);
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", category);
      if (claimId) fd.append("claimId", claimId);
      if (preauthId) fd.append("preauthId", preauthId);
      if (groupId) fd.append("groupId", groupId);
      if (endorsementId) fd.append("endorsementId", endorsementId);

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }

      const entry: UploadedFile = {
        name: file.name,
        documentId: data.documentId,
        fileUrl: data.url,
      };
      setUploaded((prev) => [...prev, entry]);
      onUploadComplete?.(data.documentId, data.url, file.name);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-avenue-text-muted uppercase">{label}</p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg px-6 py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors
          ${dragging
            ? "border-avenue-indigo bg-avenue-indigo/5"
            : "border-[#EEEEEE] hover:border-avenue-indigo/50 hover:bg-[#F8F9FA]"
          }`}
      >
        {uploading ? (
          <Loader2 size={28} className="text-avenue-indigo animate-spin" />
        ) : (
          <Upload size={28} className="text-avenue-text-muted" />
        )}
        <div className="text-center">
          <p className="text-sm font-semibold text-avenue-text-heading">
            {uploading ? "Uploading…" : "Drag & drop or click to select"}
          </p>
          <p className="text-xs text-avenue-text-muted mt-0.5">PDF, Images, Word, Excel — max 10 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-[#DC3545] bg-[#DC3545]/5 border border-[#DC3545]/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Uploaded files */}
      {uploaded.length > 0 && (
        <div className="space-y-2">
          {uploaded.map((f) => (
            <div key={f.documentId} className="flex items-center gap-2 text-sm bg-[#28A745]/5 border border-[#28A745]/20 rounded-lg px-3 py-2">
              <CheckCircle size={14} className="text-[#28A745] shrink-0" />
              <FileText size={14} className="text-avenue-text-muted shrink-0" />
              <a
                href={f.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-avenue-indigo hover:underline truncate"
              >
                {f.name}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
