"use client";

import { useState } from "react";
import { formatPhone } from "@/lib/format";

type Props = {
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  id?: string;
};

export default function PhoneInput({ name, defaultValue = "", required, className, id }: Props) {
  const [value, setValue] = useState(formatPhone(defaultValue));

  return (
    <input
      id={id}
      type="tel"
      name={name}
      value={value}
      onChange={(e) => setValue(formatPhone(e.target.value))}
      required={required}
      autoComplete="tel"
      inputMode="tel"
      placeholder="555-123-4567"
      maxLength={12}
      className={className}
    />
  );
}
