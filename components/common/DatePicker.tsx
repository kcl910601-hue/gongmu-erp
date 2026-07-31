"use client";

import { useRef, useState } from "react";
import { format, isValid, parse } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, Trash2 } from "lucide-react";
import { Calendar } from "@/components/ui/Calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";

export type DatePickerProps = {
  value: string | null;
  onSave: (date: string | null) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  minYear?: number;
  maxYear?: number;
};

function parseDateInput(input: string): Date | null {
  const trimmed = input.trim();
  const normalized = /^\d{8}$/.test(trimmed)
    ? `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
    : trimmed;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const parsed = parse(normalized, "yyyy-MM-dd", new Date());
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === normalized
    ? parsed
    : null;
}

function toDateValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function toDisplayValue(value: string) {
  const date = parseDateInput(value);
  return date ? toDateValue(date) : value;
}

export function DatePicker({
  value,
  onSave,
  disabled = false,
  placeholder = "날짜를 선택하세요",
  className = "",
  id,
  name,
  minYear = 1900,
  maxYear = 2100,
}: DatePickerProps) {
  const savedValue = value || "";
  const [editingValue, setEditingValue] = useState(savedValue);
  const [isFocused, setIsFocused] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  const skipNextBlurRef = useRef(false);

  async function saveDate(nextValue: string | null) {
    if (disabled || isSavingRef.current) return;

    if (nextValue === savedValue || (nextValue === null && !savedValue)) {
      setEditingValue(savedValue);
      setError(null);
      return;
    }

    isSavingRef.current = true;
    try {
      await onSave(nextValue);
      setEditingValue(nextValue || "");
      setError(null);
    } catch {
      setError("날짜를 저장하지 못했습니다.");
    } finally {
      isSavingRef.current = false;
    }
  }

  async function commitInput() {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      await saveDate(null);
      return;
    }

    const parsed = parseDateInput(trimmed);
    if (!parsed) {
      setError("올바른 날짜를 입력하세요.");
      return;
    }

    await saveDate(toDateValue(parsed));
  }

  function restoreSavedValue() {
    setEditingValue(savedValue);
    setError(null);
  }

  async function selectDate(date: Date | undefined) {
    if (!date) return;
    const nextValue = toDateValue(date);
    setEditingValue(nextValue);
    setIsOpen(false);
    await saveDate(nextValue);
  }

  const selectedDate = parseDateInput(editingValue) || parseDateInput(savedValue);

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div
        className={`flex h-9 items-center rounded-lg border bg-white transition-colors focus-within:ring-2 focus-within:ring-blue-100 ${
          error ? "border-red-400" : "border-slate-200 focus-within:border-blue-400"
        }`}
      >
        <CalendarDays className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={isFocused ? editingValue : toDisplayValue(savedValue)}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          onFocus={() => {
            setEditingValue(savedValue);
            setIsFocused(true);
          }}
          onChange={(event) => {
            setEditingValue(event.target.value);
            setError(null);
          }}
          onBlur={() => {
            setIsFocused(false);
            if (skipNextBlurRef.current) {
              skipNextBlurRef.current = false;
              return;
            }
            void commitInput();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              skipNextBlurRef.current = true;
              restoreSavedValue();
              event.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
        />
        {savedValue && (
          <button
            type="button"
            disabled={disabled}
            aria-label="날짜 삭제"
            title="날짜 삭제"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setEditingValue("");
              void saveDate(null);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="달력 열기"
              title="달력 열기"
              onMouseDown={(event) => event.preventDefault()}
              className="mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CalendarDays className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3">
            <Calendar
              mode="single"
              selected={selectedDate || undefined}
              onSelect={(date) => void selectDate(date)}
              locale={ko}
              captionLayout="dropdown"
              startMonth={new Date(minYear, 0)}
              endMonth={new Date(maxYear, 11)}
              defaultMonth={selectedDate || new Date()}
            />
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => void selectDate(new Date())}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                오늘
              </button>
              <button
                type="button"
                disabled={!savedValue}
                onClick={() => {
                  setEditingValue("");
                  setIsOpen(false);
                  void saveDate(null);
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-40"
              >
                날짜 삭제
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
