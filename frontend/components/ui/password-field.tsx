"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Field, Input } from "./form-controls";
import { Icon } from "./icon";

export interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name" | "type"> {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly leadingIcon?: ReactNode;
  readonly requiredIndicator?: "text" | "sr-only";
}

export function PasswordField({
  id,
  name,
  label,
  hint,
  error,
  required,
  requiredIndicator,
  leadingIcon,
  className = "",
  ...inputProps
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const actionLabel = visible ? "Ẩn mật khẩu" : "Hiện mật khẩu";

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      requiredIndicator={requiredIndicator}
      describedBy={inputProps["aria-describedby"]}
    >
      {(controlProps) => (
        <div className="group relative">
          {leadingIcon ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 grid w-10 place-items-center text-muted-foreground transition-colors duration-fast group-hover:text-foreground-soft group-focus-within:text-primary"
            >
              {leadingIcon}
            </span>
          ) : null}
          <Input
            {...inputProps}
            {...controlProps}
            id={id}
            name={name}
            type={visible ? "text" : "password"}
            required={required}
            aria-invalid={error ? true : inputProps["aria-invalid"]}
            className={`${leadingIcon ? "pl-10" : ""} pr-12 ${className}`}
          />
          <button
            type="button"
            aria-label={actionLabel}
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
            className="absolute inset-y-0 right-0 grid min-h-11 w-11 place-items-center rounded-control text-muted-foreground transition-[background-color,color,transform] duration-fast hover:bg-primary-subtle hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus motion-reduce:transform-none"
          >
            <Icon name={visible ? "eyeOff" : "eye"} className="h-5 w-5" />
          </button>
        </div>
      )}
    </Field>
  );
}
