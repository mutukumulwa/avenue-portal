"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { FileUpload } from "@/components/ui/FileUpload";
import { DocumentList } from "@/components/ui/DocumentList";

interface Doc {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  category: string;
  createdAt: Date;
}

export function ClaimDocuments({
  claimId,
  initialDocuments,
}: {
  claimId: string;
  initialDocuments: Doc[];
}) {
  const [docs, setDocs] = useState<Doc[]>(initialDocuments);

  const handleUpload = (documentId: string, fileUrl: string, fileName: string) => {
    setDocs((prev) => [
      ...prev,
      {
        id: documentId,
        fileName,
        fileUrl,
        fileSize: null,
        mimeType: null,
        category: "CLAIM_SUPPORT",
        createdAt: new Date(),
      },
    ]);
  };

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
      <h3 className="text-sm font-bold text-avenue-text-heading uppercase tracking-wide flex items-center gap-2">
        <Paperclip size={16} className="text-avenue-indigo" /> Supporting Documents
      </h3>
      <DocumentList documents={docs} />
      <div className="pt-2 border-t border-[#EEEEEE]">
        <FileUpload
          category="CLAIM_SUPPORT"
          claimId={claimId}
          onUploadComplete={handleUpload}
          label="Attach Document"
        />
      </div>
    </div>
  );
}
