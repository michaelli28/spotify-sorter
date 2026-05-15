"use client";
import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import clsx from "clsx";

interface Props {
  trackId: string;
  title: string;
  artist_name: string;
  reasoning?: string;
  categoryId: string;
}

export function TrackChip({
  trackId,
  title,
  artist_name,
  reasoning,
  categoryId,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `chip:${trackId}`,
      data: { fromCategoryId: categoryId, trackId },
    });
  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
      className={clsx(
        "group relative flex items-baseline gap-3 py-1.5 px-2 -mx-2 cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
      title={reasoning}
    >
      <div className="flex-1 min-w-0">
        <span className="text-[var(--color-text-primary)] truncate">
          {title}
        </span>
        <span className="text-[var(--color-text-secondary)]">
          {" "}
          · {artist_name}
        </span>
      </div>
    </motion.div>
  );
}
