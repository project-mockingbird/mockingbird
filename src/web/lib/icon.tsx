import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  path: string;
  title?: string;
  size?: number | string;
  className?: string;
  fill?: string;
};

export function Icon({
  path,
  title,
  size = 1,
  className,
  fill = "currentColor",
  ...rest
}: IconProps) {
  // Only emit a static transform when size differs from 1, so the CSS
  // transform property (e.g. Tailwind animate-spin) isn't shadowed by an
  // identity SVG transform attribute on default-sized icons.
  return (
    <svg
      {...(size !== 1 ? { transform: `scale(${size})` } : {})}
      viewBox="0 0 24 24"
      aria-label={title}
      className={className}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={path} fill={fill} />
    </svg>
  );
}
