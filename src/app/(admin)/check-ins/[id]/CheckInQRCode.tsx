"use client";

import QRCode from "react-qr-code";

export function CheckInQRCode({ value }: { value: string }) {
  return (
    <div className="rounded-lg border border-[#EEEEEE] bg-white p-4">
      <div className="mx-auto w-full max-w-44 rounded-md bg-white p-2">
        <QRCode value={value} size={160} className="h-auto w-full" />
      </div>
      <p className="mt-3 break-all text-center text-[11px] text-avenue-text-muted">{value}</p>
    </div>
  );
}
