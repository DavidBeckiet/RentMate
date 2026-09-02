import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";
import { cx } from "./class-names";

export type FieldControlAccessibilityProps = Readonly<{
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}>;

export interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: ReactNode;
  readonly error?: string;
  readonly required?: boolean;
  readonly requiredIndicator?: "text" | "sr-only";
  readonly describedBy?: string;
  readonly children: (controlProps: FieldControlAccessibilityProps) => ReactNode;
}

interface FieldPresentationProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly hint?: ReactNode;
  readonly error?: string;
}

export interface InputFieldProps
  extends FieldPresentationProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> {
  readonly leadingIcon?: ReactNode;
  readonly requiredIndicator?: "text" | "sr-only";
}

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

export interface RadioFieldProps
  extends FieldPresentationProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name" | "type"> {}

export interface RadioGroupProps {
  readonly id: string;
  readonly legend: string;
  readonly hint?: ReactNode;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

const controlClasses =
  "min-h-12 w-full max-w-full rounded-control border border-border-strong bg-surface px-4 py-2.5 text-base font-sans font-medium text-foreground shadow-surface outline-none placeholder:font-normal placeholder:text-muted-foreground transition-[background-color,border-color,box-shadow] duration-standard focus:border-primary focus:ring-[3px] focus:ring-primary/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-muted-foreground read-only:bg-surface-subtle aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-subtle";

function labelText(label: string, required?: boolean, requiredIndicator: "text" | "sr-only" = "text") {
  return (
    <>
      {label}
      {required ? (
        <>
          {" "}
          <span className={requiredIndicator === "sr-only" ? "sr-only" : "text-danger"}>(bắt buộc)</span>
        </>
      ) : null}
    </>
  );
}

function descriptionId(id: string, hint: ReactNode, error: string | undefined, existing?: string) {
  return [existing, error ? `${id}-error` : hint ? `${id}-hint` : undefined].filter(Boolean).join(" ") || undefined;
}

function FieldMessage({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  if (error) {
    return (
      <p id={`${id}-error`} role="alert" className="border-l-2 border-danger pl-2 text-ui-sm font-semibold text-danger">
        {error}
      </p>
    );
  }

  return hint ? (
    <p id={`${id}-hint`} className="text-ui-sm text-muted-foreground">
      {hint}
    </p>
  ) : null;
}

export function Field({ id, label, hint, error, required, requiredIndicator, describedBy, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-ui-sm font-semibold text-foreground">
        {labelText(label, required, requiredIndicator)}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": descriptionId(id, hint, error, describedBy)
      })}
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}

export const FormField = Field;

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...inputProps },
  ref
) {
  return <input ref={ref} {...inputProps} className={cx(controlClasses, className)} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...textareaProps },
  ref
) {
  return <textarea ref={ref} {...textareaProps} className={cx(controlClasses, "min-h-28 resize-y", className)} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...selectProps },
  ref
) {
  return (
    <select ref={ref} {...selectProps} className={cx(controlClasses, className)}>
      {children}
    </select>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Checkbox(
  { className, type = "checkbox", ...checkboxProps },
  ref
) {
  return (
    <input
      {...checkboxProps}
      ref={ref}
      type={type}
      className={cx(
        "h-5 w-5 rounded-control border border-border-strong accent-primary focus-visible:ring-[3px] focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    />
  );
});

export const Radio = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Radio(
  { className, type = "radio", ...radioProps },
  ref
) {
  return (
    <input
      {...radioProps}
      ref={ref}
      type={type}
      className={cx(
        "h-5 w-5 border border-border-strong accent-primary focus-visible:ring-[3px] focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    />
  );
});

export function InputField({
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
}: InputFieldProps) {
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
      {(controlProps) => {
        const input = (
          <Input
            {...inputProps}
            {...controlProps}
            name={name}
            required={required}
            aria-invalid={error ? true : inputProps["aria-invalid"]}
            className={cx(leadingIcon ? "pl-10" : undefined, className)}
          />
        );

        return leadingIcon ? (
          <div className="group relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center text-muted-foreground transition-colors duration-fast group-hover:text-foreground-soft group-focus-within:text-primary"
            >
              {leadingIcon}
            </span>
            {input}
          </div>
        ) : (
          input
        );
      }}
    </Field>
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
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      describedBy={textareaProps["aria-describedby"]}
    >
      {(controlProps) => (
        <Textarea
          {...textareaProps}
          {...controlProps}
          name={name}
          required={required}
          aria-invalid={error ? true : textareaProps["aria-invalid"]}
          className={className}
        />
      )}
    </Field>
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
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      describedBy={selectProps["aria-describedby"]}
    >
      {(controlProps) => (
        <Select
          {...selectProps}
          {...controlProps}
          name={name}
          required={required}
          aria-invalid={error ? true : selectProps["aria-invalid"]}
          className={className}
        >
          {children}
        </Select>
      )}
    </Field>
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
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 text-ui-sm text-foreground">
        <input
          {...checkboxProps}
          id={id}
          name={name}
          type="checkbox"
          required={required}
          aria-invalid={error ? true : checkboxProps["aria-invalid"]}
          aria-describedby={descriptionId(id, hint, error, checkboxProps["aria-describedby"])}
          className={cx(
            "mt-1 h-5 w-5 shrink-0 rounded-control border border-border-strong accent-primary focus-visible:ring-[3px] focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
            className
          )}
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
      <legend className="text-ui-sm font-semibold text-foreground">{labelText(legend, required)}</legend>
      <div className="space-y-1">{children}</div>
      <FieldMessage id={id} hint={hint} error={error} />
    </fieldset>
  );
}

export function RadioField({ id, name, label, hint, error, required, className = "", ...radioProps }: RadioFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 text-ui-sm text-foreground">
        <input
          {...radioProps}
          id={id}
          name={name}
          type="radio"
          required={required}
          aria-describedby={descriptionId(id, hint, error, radioProps["aria-describedby"])}
          className={cx(
            "mt-1 h-5 w-5 shrink-0 border border-border-strong accent-primary focus-visible:ring-[3px] focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
            className
          )}
        />
        <span className="pt-0.5">{labelText(label, required)}</span>
      </label>
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}

export function RadioGroup({ id, legend, hint, error, required, disabled, children }: RadioGroupProps) {
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <fieldset
      id={id}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={messageId}
      className="space-y-2"
    >
      <legend className="text-ui-sm font-semibold text-foreground">{labelText(legend, required)}</legend>
      <div className="space-y-1">{children}</div>
      <FieldMessage id={id} hint={hint} error={error} />
    </fieldset>
  );
}
