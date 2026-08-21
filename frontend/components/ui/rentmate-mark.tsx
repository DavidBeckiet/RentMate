export function RentMateMark({ className = "h-8 w-8" }: { readonly className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className={className}>
      <path d="m5 14.2 11-9 11 9v11.3a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 5 25.5V14.2Z" fill="currentColor" />
      <path d="M11.5 27v-8h9v8" fill="#E5F4F0" />
      <path d="M11.5 16.1h9" stroke="#E5F4F0" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="11.5" r="1.75" fill="#C95F42" />
    </svg>
  );
}
