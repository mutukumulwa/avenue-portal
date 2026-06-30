import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "whatsapp"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    
    // Brand rules: Primary uses pill shape (50px radius), Hanken Grotesk 700
    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-brand-indigo text-white hover:bg-brand-indigo-hover rounded-pill": variant === "primary",
            "bg-transparent text-brand-indigo border-2 border-brand-indigo hover:bg-brand-pink/20 rounded-pill": variant === "secondary" || variant === "outline",
            "bg-transparent hover:bg-brand-bg-alt text-brand-text-body": variant === "ghost",
            "bg-brand-error text-white hover:bg-red-700 rounded-pill": variant === "danger",
            "bg-brand-whatsapp text-white hover:bg-green-600 rounded-full": variant === "whatsapp",
            "h-10 px-7 py-3": size === "default",
            "h-8 px-4 text-xs": size === "sm",
            "h-12 px-8 text-base": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
