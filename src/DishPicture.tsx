import { useEffect, useId, useRef, useState } from "react";
import type { Dish } from "../shared/types";

/** Show an unmodified photograph from its original menu page, clipped in the UI. */
export function DishPicture({
  dish,
  className = "",
  eager = false,
}: {
  dish: Dish;
  className?: string;
  eager?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const clipId = useId();
  const [visible, setVisible] = useState(eager);
  useEffect(() => {
    if (eager || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [eager]);
  const crop = dish.imageCrop;
  const plate = !["drinks", "combos", "restaurant-only"].includes(
    dish.categoryId,
  );
  if (!crop)
    return (
      <img
        className={className}
        src={dish.image}
        alt={dish.localizedName}
        loading={eager ? "eager" : "lazy"}
      />
    );
  return (
    <svg
      ref={ref}
      className={"dish-photo " + className}
      viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={dish.localizedName}
    >
      <defs>
        <clipPath id={clipId}>
          {plate ? (
            <ellipse
              cx={crop.x + crop.width / 2}
              cy={crop.y + crop.height / 2}
              rx={crop.width / 2}
              ry={crop.height / 2}
            />
          ) : (
            <rect
              x={crop.x}
              y={crop.y}
              width={crop.width}
              height={crop.height}
              rx={crop.width * 0.18}
              ry={crop.height * 0.12}
            />
          )}
        </clipPath>
      </defs>
      {visible && (
        <image
          clipPath={`url(#${clipId})`}
          href={dish.image}
          width={crop.sourceWidth}
          height={crop.sourceHeight}
        />
      )}
    </svg>
  );
}
