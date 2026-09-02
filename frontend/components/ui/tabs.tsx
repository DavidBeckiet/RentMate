"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode
} from "react";
import { cx } from "./class-names";

export type TabsVariant = "underline" | "segmented";

interface TabsContextValue {
  readonly value: string | undefined;
  readonly setValue: (value: string) => void;
  readonly idPrefix: string;
  readonly variant: TabsVariant;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tabs primitives must be rendered inside Tabs.");
  return context;
}

export interface TabsProps {
  readonly defaultValue?: string;
  readonly value?: string;
  readonly onValueChange?: (value: string) => void;
  readonly variant?: TabsVariant;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Tabs({ defaultValue, value, onValueChange, variant = "underline", children, className }: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const idPrefix = useId();
  const currentValue = value ?? internalValue;
  const setValue = (nextValue: string) => {
    if (nextValue === currentValue) return;
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, setValue, idPrefix, variant }}>
      <div className={cx("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} role="tablist" className={cx("flex min-w-0 gap-1 overflow-x-auto", className)} />;
}

export interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly value: string;
}

export function TabsTrigger({ value, className, onKeyDown, onClick, ...props }: TabsTriggerProps) {
  const context = useTabsContext();
  const selected = context.value === value;
  const tabId = `${context.idPrefix}-${value}-tab`;
  const panelId = `${context.idPrefix}-${value}-panel`;

  const handleKeyDown: NonNullable<TabsTriggerProps["onKeyDown"]> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    if (tabs.length === 0) return;
    const index = tabs.indexOf(event.currentTarget);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (index + 1) % tabs.length
            : event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? (index - 1 + tabs.length) % tabs.length
              : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    tabs[nextIndex]?.focus();
    const nextValue = tabs[nextIndex]?.getAttribute("data-tab-value");
    if (nextValue) context.setValue(nextValue);
  };

  return (
    <button
      {...props}
      type={props.type ?? "button"}
      id={tabId}
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      data-tab-value={value}
      onClick={(event) => {
        context.setValue(value);
        onClick?.(event);
      }}
      onKeyDown={handleKeyDown}
      className={cx(
        "min-h-11 shrink-0 border-b-2 border-transparent px-3 py-2 text-ui-sm font-semibold text-muted-foreground transition-[border-color,color,background-color] duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus focus-visible:ring-offset-2 aria-[selected=true]:border-primary aria-[selected=true]:text-primary-hover",
        context.variant === "segmented" &&
          "rounded-control border-transparent aria-[selected=true]:border-primary/20 aria-[selected=true]:bg-primary-subtle",
        className
      )}
    />
  );
}

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  readonly value: string;
}

export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const context = useTabsContext();
  const active = context.value === value;
  return (
    <div
      {...props}
      id={`${context.idPrefix}-${value}-panel`}
      role="tabpanel"
      aria-labelledby={`${context.idPrefix}-${value}-tab`}
      tabIndex={0}
      hidden={!active}
      className={cx("pt-4 outline-none focus-visible:ring-[3px] focus-visible:ring-focus", className)}
    />
  );
}
