import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MenuItemSize = "sm" | "md";
type MenuItemIconPlacement = "left" | "right";

interface MenuItemProps {
  label: string;
  icon?: ReactNode;
  showIcon?: boolean;
  iconPlacement?: MenuItemIconPlacement;
  size?: MenuItemSize;
  disabled?: boolean;
  onClick?: () => void;
}

// ---------------------------------------------------------------------------
// Token mappings
// ---------------------------------------------------------------------------

const sizeFontMap: Record<MenuItemSize, string> = {
  sm: "14px",
  md: "16px",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MenuItem({
  label,
  icon,
  showIcon = true,
  iconPlacement = "left",
  size = "sm",
  disabled = false,
  onClick,
}: MenuItemProps) {
  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-3)",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "var(--color-background-0)",
    color: disabled ? "var(--color-typography-400)" : "var(--color-typography-700)",
    fontSize: sizeFontMap[size],
    fontFamily: "Roboto, sans-serif",
    fontWeight: 400,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
    border: "none",
    width: "100%",
    textAlign: "left",
    transition: "background-color 0.15s",
    flexDirection: iconPlacement === "right" ? "row-reverse" : "row",
  };

  return (
    <button
      style={style}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = "var(--color-background-50)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--color-background-0)";
      }}
      onMouseDown={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = "var(--color-background-100)";
      }}
      onMouseUp={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = "var(--color-background-50)";
      }}
    >
      {showIcon && icon && <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}
