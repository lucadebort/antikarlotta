interface AvatarProps {
  /** Size preset */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  /** Show notification badge */
  badge?: boolean;
  /** Display variant */
  variant?: "Text" | "Image";
}

export function Avatar({
  size = "xs",
  badge = true,
  variant = "Image",
  }: AvatarProps) {
  return (
    <div>
      {variant === "Image" && src ? (
        <img src={src} alt={alt} />
      ) : (
        <span>{alt?.slice(0, 2).toUpperCase()}</span>
      )}
      {badge && <span />}
    </div>
  );
}
