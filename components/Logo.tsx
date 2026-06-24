import { cn } from "@/lib/utils";

export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 shadow-[0_8px_20px_-8px_rgba(79,70,229,0.8)]">
        <svg
          className="h-4 w-4 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
        </svg>
      </span>
      {showText && (
        <span className="text-base font-semibold tracking-tight text-zinc-50">
          GenSpec
        </span>
      )}
    </span>
  );
}
