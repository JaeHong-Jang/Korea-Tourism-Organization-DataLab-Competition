// shadcn 버튼의 접근성 구조를 유지하고 인파예보 토큰으로 모양을 정의한다.
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/class-names";

const buttonVariants = cva("cc-button", {
  variants: {
    variant: {
      default: "cc-button--primary",
      outline: "cc-button--outline",
      ghost: "cc-button--ghost",
    },
    size: {
      default: "cc-button--default",
      sm: "cc-button--small",
      icon: "cc-button--icon",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

// 링크를 버튼처럼 표시할 때도 같은 포커스와 크기를 적용한다.
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
