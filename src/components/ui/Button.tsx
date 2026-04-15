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
    
    // Avenue rules: Primary uses pill shape (50px radius), Lato 700
    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-avenue-indigo disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-avenue-indigo text-white hover:bg-avenue-indigo-hover rounded-pill": variant === "primary",
            "bg-transparent text-avenue-indigo border-2 border-avenue-indigo hover:bg-avenue-pink/20 rounded-pill": variant === "secondary" || variant === "outline",
            "bg-transparent hover:bg-avenue-bg-alt text-avenue-text-body": variant === "ghost",
            "bg-avenue-error text-white hover:bg-red-700 rounded-pill": variant === "danger",
            "bg-avenue-whatsapp text-white hover:bg-green-600 rounded-full": variant === "whatsapp",
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
