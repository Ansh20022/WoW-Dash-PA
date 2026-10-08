import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy", testId, variant = "outline" }: { value: string; label?: string; testId?: string; variant?: "outline" | "default" | "secondary" }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      data-testid={testId}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); } catch { /* clipboard blocked */ }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </Button>
  );
}
