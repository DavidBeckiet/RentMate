import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldPresentationProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly hint?: ReactNode;
  readonly error?: string;
}

export interface InputFieldProps
  extends FieldPresentationProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> {}

export interface TextareaFieldProps
  extends FieldPresentationProps,
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "name"> {}

export interface SelectFieldProps
  extends FieldPresentationProps,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "name"> {
  readonly children: ReactNode;
}

export interface CheckboxFieldProps
  extends FieldPresentationProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name" | "type"> {}

export interface CheckboxGroupProps {
  readonly id: string;
  readonly legend: string;
  readonly hint?: ReactNode;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

const controlClasses =
  "min-h-12 w-full border-2 border-heroDark-950 bg-rent-surface px-4 py-2.5 text-base font-semibold text-rent-ink shadow-glass-sm outline-none placeholder:font-normal placeholder:text-rent-subtle transition-[background-color,box-shadow,transform] duration-200 focus:-translate-x-0.5 focus:-translate-y-0.5 focus:bg-white focus:shadow-glass disabled:cursor-not-allowed disabled:bg-[#dfddd5] disabled:text-rent-subtle aria-[invalid=true]:border-rose-700 aria-[invalid=true]:bg-rose-50";

function labelText(label: string, required?: boolean) {
  return (
    <>
      {label}
      {required ? (
        <>
          {" "}
          <span className="text-rose-700">(bắt buộc)</span>
        </>
      ) : null}
    </>
  );
}

function descriptionId(id: string, hint: ReactNode, error: string | undefined, existing: string | undefined) {
  return [existing, error ? `${id}-error` : hint ? `${id}-hint` : undefined].filter(Boolean).join(" ") || undefined;
}

function FieldMessage({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  if (error) {
    return (
      <p
        id={`${id}-error`}
        role="alert"
        className="border-l-4 border-rose-700 pl-2 text-sm font-semibold text-rose-800"
      >
        {error}
      </p>
    );
  }

  return hint ? (
    <p id={`${id}-hint`} className="text-sm text-rent-secondary">
      {hint}
    </p>
  ) : null;
}

export function InputField({ id, name, label, hint, error, required, className = "", ...inputProps }: InputFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-display text-sm font-bold text-rent-ink">
        {labelText(label, required)}
      </label>
      <input
        {...inputProps}
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : inputProps["aria-invalid"]}
        aria-describedby={descriptionId(id, hint, error, inputProps["aria-describedby"])}
        className={`${controlClasses} ${className}`}
      />
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}

export function TextareaField({
  id,
  name,
  label,
  hint,
  error,
  required,
  className = "",
  ...textareaProps
}: TextareaFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-display text-sm font-bold text-rent-ink">
        {labelText(label, required)}
      </label>
      <textarea
        {...textareaProps}
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : textareaProps["aria-invalid"]}
        aria-describedby={descriptionId(id, hint, error, textareaProps["aria-describedby"])}
        className={`${controlClasses} min-h-28 resize-y ${className}`}
      />
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  id,
  name,
  label,
  hint,
  error,
  required,
  className = "",
  children,
  ...selectProps
}: SelectFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-display text-sm font-bold text-rent-ink">
        {labelText(label, required)}
      </label>
      <select
        {...selectProps}
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : selectProps["aria-invalid"]}
        aria-describedby={descriptionId(id, hint, error, selectProps["aria-describedby"])}
        className={`${controlClasses} ${className}`}
      >
        {children}
      </select>
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}

export function CheckboxField({
  id,
  name,
  label,
  hint,
  error,
  required,
  className = "",
  ...checkboxProps
}: CheckboxFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-rent-ink">
        <input
          {...checkboxProps}
          id={id}
          name={name}
          type="checkbox"
          required={required}
          aria-invalid={error ? true : checkboxProps["aria-invalid"]}
          aria-describedby={descriptionId(id, hint, error, checkboxProps["aria-describedby"])}
          className={`mt-1 h-5 w-5 shrink-0 border-2 border-heroDark-950 text-brandBlue-600 focus:ring-2 focus:ring-rent-coral focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
        />
        <span className="pt-0.5">{labelText(label, required)}</span>
      </label>
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}

export function CheckboxGroup({ id, legend, hint, error, required, disabled, children }: CheckboxGroupProps) {
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <fieldset
      id={id}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={messageId}
      className="space-y-2"
    >
      <legend className="font-display text-sm font-bold text-rent-ink">{labelText(legend, required)}</legend>
      <div className="space-y-1">{children}</div>
      <FieldMessage id={id} hint={hint} error={error} />
    </fieldset>
  );
}
