import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BadgeAction = "error" | "warning" | "success" | "info" | "muted";
type BadgeSize = "sm" | "md" | "lg" | "xl";
type BadgeVariant = "solid" | "outlined";

interface BadgeProps {
  label: string;
  action?: BadgeAction;
  size?: BadgeSize;
  variant?: BadgeVariant;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

// ---------------------------------------------------------------------------
// Token mappings
// ---------------------------------------------------------------------------

const actionTokens: Record<BadgeAction, { bg: string; text: string; border: string }> = {
  error:   { bg: "var(--color-error-background)",   text: "var(--color-error-800)",   border: "var(--color-error-300)" },
  warning: { bg: "var(--color-warning-background)", text: "var(--color-warning-800)", border: "var(--color-warning-300)" },
  success: { bg: "var(--color-success-background)", text: "var(--color-success-800)", border: "var(--color-success-300)" },
  info:    { bg: "var(--color-info-background)",    text: "var(--color-info-800)",    border: "var(--color-info-300)" },
  muted:   { bg: "var(--color-background-muted)",   text: "var(--color-background-800)", border: "var(--color-background-300)" },
};

const sizeFontMap: Record<BadgeSize, string> = {
  sm: "10px",
  md: "12px",
  lg: "14px",
  xl: "16px",
};

const sizeIconMap: Record<BadgeSize, string> = {
  sm: "12px",
  md: "14px",
  lg: "16px",
  xl: "18px",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Badge({
  label,
  action = "error",
  size = "sm",
  variant = "solid",
  iconLeft,
  iconRight,
}: BadgeProps) {
  const tokens = actionTokens[action];

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    paddingBlock: "var(--spacing-1)",
    paddingInline: "var(--spacing-2)",
    borderRadius: "var(--radius-xs)",
    backgroundColor: tokens.bg,
    color: tokens.text,
    fontSize: sizeFontMap[size],
    fontFamily: "Roboto, sans-serif",
    fontWeight: 400,
    lineHeight: 1.4,
    border: variant === "outlined" ? `1px solid ${tokens.border}` : "none",
  };

  const iconStyle: React.CSSProperties = {
    width: sizeIconMap[size],
    height: sizeIconMap[size],
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <span style={style}>
      {iconLeft && <span style={iconStyle}>{iconLeft}</span>}
      <span>{label}</span>
      {iconRight && <span style={iconStyle}>{iconRight}</span>}
    </span>
  );
}
