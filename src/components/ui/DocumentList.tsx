"use client";

import { FileText, Download, Image as ImageIcon, FileSpreadsheet, File } from "lucide-react";

interface Doc {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  category: string;
  createdAt: Date;
}

function fileIcon(mimeType: string | null) {
  if (!mimeType) return <File size={16} className="text-avenue-text-muted" />;
  if (mimeType.startsWith("image/")) return <ImageIcon size={16} className="text-[#17A2B8]" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return <FileSpreadsheet size={16} className="text-[#28A745]" />;
  return <FileText size={16} className="text-avenue-indigo" />;
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ documents }: { documents: Doc[] }) {
  if (documents.length === 0) {
    return <p className="text-sm text-avenue-text-muted py-4">No documents attached yet.</p>;
  }

  return (
    <div className="divide-y divide-[#EEEEEE]">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 py-3">
          <div className="shrink-0">{fileIcon(doc.mimeType)}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-avenue-text-heading truncate">{doc.fileName}</p>
            <p className="text-xs text-avenue-text-muted">
              {doc.category.replace(/_/g, " ")}
              {doc.fileSize && ` · ${formatBytes(doc.fileSize)}`}
              {` · ${new Date(doc.createdAt).toLocaleDateString()}`}
            </p>
          </div>
          <a
            href={doc.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1 text-xs font-bold text-avenue-indigo hover:text-avenue-secondary transition-colors"
          >
            <Download size={13} /> Download
          </a>
        </div>
      ))}
    </div>
  );
}
