export function RentMateMark({ className = "h-8 w-8" }: { readonly className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" fill="none" className={className}>
      <path d="M4 8h32v24H4z" fill="#DDF39A" stroke="currentColor" strokeWidth="2.5" />
      <path d="m10 20 10-8 10 8v10H10V20Z" fill="currentColor" />
      <path d="M17 30v-7h6v7" fill="#DDF39A" />
      <path d="M29 7v7M25.5 10.5h7" stroke="#F26B4F" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  );
}
