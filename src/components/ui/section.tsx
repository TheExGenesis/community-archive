import { cn } from "@/utils/tailwind"
import type { HTMLAttributes } from "react"

interface SectionProps extends HTMLAttributes<HTMLElement> {
    size?: 'small' | 'medium' | 'large' | 'compact'
    // ... existing props ...
}

export function Section({
    className,
    size = 'medium',
    ...props
}: SectionProps) {
    const sizeClasses = {
        compact: 'my:2 md:my-2',
        small: 'my-8 md:my-8',
        medium: 'my-20 md:my-20',
        large: 'my-24 md:my-24'
    }

    return (
        <section
            className={cn(
                "px-4 md:px-12",
                sizeClasses[size],
                className
            )}
            {...props}
        />
    )
}
