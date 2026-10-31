import { cn } from "@/utils/tailwind"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
