import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BarcodePreviewProps {
  value: string;
}

export function BarcodePreview({ value }: BarcodePreviewProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value && /^\d{17,}$/.test(value)) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width: 1.5,
          height: 50,
          displayValue: true,
          fontSize: 12,
          margin: 4,
        });
      } catch {
        // invalid barcode
      }
    }
  }, [value]);

  const isValid = /^\d{17,}$/.test(value);

  if (!isValid) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs font-mono text-muted-foreground cursor-pointer underline decoration-dotted">
            {value}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-white p-2">
          <svg ref={svgRef} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
