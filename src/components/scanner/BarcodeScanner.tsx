import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function BarcodeScanner({ open, onClose, onScan }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerId = "barcode-scanner-container";

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 120 } },
        (decodedText) => {
          if (cancelled) return;
          cancelled = true;
          onScan(decodedText);
          scanner.stop().catch(() => {});
          onClose();
        },
        () => {} // ignore scan failures
      )
      .catch((err) => {
        if (!cancelled) {
          setError("Nu s-a putut accesa camera. Verifică permisiunile.");
          console.error("Scanner error:", err);
        }
      });

    return () => {
      cancelled = true;
      scanner.stop().catch(() => {});
      scannerRef.current = null;
    };
  }, [open, onScan, onClose]);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Scanează cod de bare
          </DialogTitle>
        </DialogHeader>
        <div
          id={containerId}
          className="w-full rounded-lg overflow-hidden bg-muted min-h-[240px]"
        />
        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}
        <Button variant="outline" size="sm" onClick={onClose} className="w-full">
          <X className="h-4 w-4 mr-1" /> Închide
        </Button>
      </DialogContent>
    </Dialog>
  );
}
