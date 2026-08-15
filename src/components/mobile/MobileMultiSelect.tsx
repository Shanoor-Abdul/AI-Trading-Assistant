"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MobileMultiSelectProps {
  selected: string[];
  options: string[];
  onChange: (value: string) => void;
  placeholder: string;
  icon?: ReactNode;
}

export function MobileMultiSelect({
  selected,
  options,
  onChange,
  placeholder,
  icon,
}: MobileMultiSelectProps) {
  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <span
              key={item}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-100"
            >
              <span className="truncate">{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(item)}
                className="shrink-0 rounded-full p-0.5 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Select value={null} onValueChange={(value) => value && onChange(value)}>
        <SelectTrigger className="h-9 w-full bg-zinc-900 border-zinc-800 text-sm focus:ring-0 focus:ring-offset-0">
          {icon}
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[10px] ${
                    selected.includes(option)
                      ? "border-purple-500 bg-purple-600 text-white"
                      : "border-zinc-700 bg-zinc-800"
                  }`}
                >
                  {selected.includes(option) ? "✓" : ""}
                </span>
                <span>{option}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
