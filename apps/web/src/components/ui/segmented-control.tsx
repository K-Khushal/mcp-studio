import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  disabled?: boolean
}

interface SegmentedControlProps<T extends string>
  extends Omit<React.ComponentProps<typeof RadioGroupPrimitive.Root>, "value" | "defaultValue" | "onValueChange" | "children" | "dir"> {
  value: T
  onValueChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** Passed to the group; give it a name ("Theme", "Transport") since the visible options alone don't label it. */
  "aria-label"?: string
}

/**
 * A single-choice toggle: radiogroup with `aria-checked` options, one tab stop,
 * Left/Right (and Up/Down) moving the selection. Use for a mutually exclusive
 * setting; use `Tabs` when the choice swaps a panel.
 */
function SegmentedControl<T extends string>({ value, onValueChange, options, className, ...props }: SegmentedControlProps<T>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented-control"
      orientation="horizontal"
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      className={cn("flex w-fit rounded-lg border border-border bg-muted p-0.5", className)}
      {...props}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          data-slot="segmented-control-item"
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-[background-color,color] duration-150 ease-out outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm"
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

export { SegmentedControl }
export type { SegmentedOption }
