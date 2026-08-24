import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckboxField, CheckboxGroup, Field, Input, InputField, SelectField, TextareaField } from "./form-controls";

describe("shared form controls", () => {
  it("connects native inputs to visible labels, names, required text, and hints", () => {
    render(
      <InputField id="email" name="email" label="Email" type="email" required hint="Dùng email bạn thường kiểm tra." />
    );

    const input = screen.getByLabelText("Email (bắt buộc)");
    expect(input).toHaveAttribute("id", "email");
    expect(input).toHaveAttribute("name", "email");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-describedby", "email-hint");
    expect(screen.getByText("Dùng email bạn thường kiểm tra.")).toHaveAttribute("id", "email-hint");
  });

  it("prioritizes a nearby accessible error over hint text", () => {
    render(
      <InputField
        id="phone"
        name="phone"
        label="Số điện thoại"
        hint="Nhập số liên hệ."
        error="Số điện thoại không hợp lệ."
      />
    );

    const input = screen.getByLabelText("Số điện thoại");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "phone-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Số điện thoại không hợp lệ.");
    expect(screen.queryByText("Nhập số liên hệ.")).not.toBeInTheDocument();
  });

  it("supports a muted leading icon and visually quiet required indicator without replacing the label", () => {
    render(
      <InputField
        id="auth-email"
        name="email"
        label="Email"
        required
        requiredIndicator="sr-only"
        leadingIcon={<span data-testid="mail-icon">icon</span>}
      />
    );

    const input = screen.getByLabelText("Email (bắt buộc)");
    expect(input).toBeRequired();
    expect(input).toHaveClass("pl-10");
    expect(screen.getByText("(bắt buộc)")).toHaveClass("sr-only");
    expect(screen.getByTestId("mail-icon").parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("lets a standalone Field associate an Input with its label, hint, and error", () => {
    const view = render(
      <Field id="title" label="Tiêu đề" hint="Mô tả ngắn gọn.">
        {(controlProps) => <Input {...controlProps} name="title" />}
      </Field>
    );

    expect(screen.getByLabelText("Tiêu đề")).toHaveAttribute("aria-describedby", "title-hint");

    view.rerender(
      <Field id="title" label="Tiêu đề" error="Tiêu đề là bắt buộc.">
        {(controlProps) => <Input {...controlProps} name="title" />}
      </Field>
    );

    expect(screen.getByLabelText("Tiêu đề")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Tiêu đề")).toHaveAttribute("aria-describedby", "title-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Tiêu đề là bắt buộc.");
  });

  it("preserves native textarea and select behavior including disabled and read-only states", () => {
    render(
      <>
        <TextareaField id="description" name="description" label="Mô tả" readOnly defaultValue="Nội dung" />
        <SelectField id="status" name="status" label="Trạng thái" disabled defaultValue="draft">
          <option value="draft">Nháp</option>
        </SelectField>
      </>
    );

    expect(screen.getByLabelText("Mô tả")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Trạng thái")).toBeDisabled();
    expect(screen.getByLabelText("Mô tả").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Trạng thái").tagName).toBe("SELECT");
  });

  it("uses native checkbox semantics and accessible fieldset grouping", () => {
    const onChange = vi.fn();
    render(
      <CheckboxGroup id="amenities" legend="Tiện ích" required hint="Chọn các tiện ích có sẵn.">
        <CheckboxField id="wifi" name="amenities" label="Wi-Fi" value="wifi" onChange={onChange} />
      </CheckboxGroup>
    );

    const group = screen.getByRole("group", { name: "Tiện ích (bắt buộc)" });
    const checkbox = screen.getByRole("checkbox", { name: "Wi-Fi" });
    expect(group).toHaveAttribute("aria-describedby", "amenities-hint");
    expect(checkbox).toHaveAttribute("name", "amenities");
    expect(checkbox).toHaveAttribute("type", "checkbox");
    expect(checkbox).toHaveProperty("tabIndex", 0);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(checkbox).toBeChecked();
  });
});
