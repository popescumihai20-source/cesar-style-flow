import { Button } from "@/components/ui/button";
import { Delete, CornerDownLeft } from "lucide-react";

interface POSNumpadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter?: () => void;
}

export default function POSNumpad({ onDigit, onBackspace, onClear, onEnter }: POSNumpadProps) {
  const keys = [
    ["7", "8", "9"],
    ["4", "5", "6"],
    ["1", "2", "3"],
    [".", "0", "⌫"],
  ];

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {keys.map((row) =>
        row.map((key) => {
          if (key === "⌫") {
            return (
              <Button
                key={key}
                variant="outline"
                className="h-12 text-lg font-mono"
                onClick={onBackspace}
                type="button"
              >
                <Delete className="h-5 w-5" />
              </Button>
            );
          }
          return (
            <Button
              key={key}
              variant="outline"
              className="h-12 text-lg font-mono"
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
        className="h-12 text-xs font-medium col-span-1"
        onClick={onClear}
        type="button"
      >
        C
      </Button>
      <Button
        variant="default"
        className="h-12 text-sm font-bold col-span-2"
        onClick={onEnter}
        type="button"
      >
        <CornerDownLeft className="h-4 w-4 mr-1" />
        ENTER
      </Button>
    </div>
  );
}
