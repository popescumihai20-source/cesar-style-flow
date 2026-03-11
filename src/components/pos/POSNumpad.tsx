import { Button } from "@/components/ui/button";
import { Delete, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface POSNumpadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter?: () => void;
  compact?: boolean;
}

export default function POSNumpad({ onDigit, onBackspace, onClear, onEnter, compact = false }: POSNumpadProps) {
  const keys = [
    ["7", "8", "9"],
    ["4", "5", "6"],
    ["1", "2", "3"],
    [".", "0", "⌫"],
  ];

  const btnSize = compact ? "h-9 text-sm" : "h-10 text-base";

  return (
    <div className={cn("grid grid-cols-3 flex-1", compact ? "gap-0.5" : "gap-1")}>
      {keys.map((row) =>
        row.map((key) => {
          if (key === "⌫") {
            return (
              <Button
                key={key}
                variant="outline"
                className={cn(btnSize, "font-mono")}
                onClick={onBackspace}
                type="button"
              >
                <Delete className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </Button>
            );
          }
          return (
            <Button
              key={key}
              variant="outline"
              className={cn(btnSize, "font-mono")}
              onClick={() => onDigit(key)}
              type="button"
            >
              {key}
            </Button>
          );
        })
      )}
      <Button
        variant="destructive"
        className={cn(btnSize, "font-bold col-span-1")}
        onClick={onClear}
        type="button"
      >
        C
      </Button>
      <Button
        variant="default"
        className={cn(btnSize, "font-bold col-span-2 text-sm")}
        onClick={onEnter}
        type="button"
      >
        <CornerDownLeft className={compact ? "h-3.5 w-3.5 mr-1" : "h-4 w-4 mr-1"} />
        ENTER
      </Button>
    </div>
  );
}
