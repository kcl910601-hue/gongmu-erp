"use client";

import { useId } from "react";

type EditableComboboxProps = {
  value: string;
  options: Array<string | { value: string; label: string }>;
  placeholder: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function EditableCombobox({ value, options, placeholder, className, disabled, onChange }: EditableComboboxProps) {
  const id = useId();
  return (
    <>
      <input
        type="text"
        aria-autocomplete="list"
        list={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={id}>
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return <option key={value.toLocaleLowerCase("ko-KR")} value={value} label={label} />;
        })}
      </datalist>
    </>
  );
}
