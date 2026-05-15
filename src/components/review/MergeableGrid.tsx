"use client";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import {
  CategoryCard,
  type CategoryCardData,
  type TrackLookupEntry,
} from "./CategoryCard";
import {
  mergeCategories,
  type DraftCategory,
} from "@/src/lib/categories/merge";

interface Props {
  categories: DraftCategory[];
  trackLookup: Record<string, TrackLookupEntry>;
  estimates: Record<string, number>;
  onChange: (next: DraftCategory[]) => void;
}

function DraggableCard({
  children,
  id,
}: {
  children: React.ReactNode;
  id: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });
  const { setNodeRef: setDrop, isOver } = useDroppable({ id });
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        setDrop(el);
      }}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.6 : 1,
        outline: isOver ? "1px solid var(--color-accent)" : "none",
      }}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

export function MergeableGrid({
  categories,
  trackLookup,
  estimates,
  onChange,
}: Props) {
  function onDragEnd(e: DragEndEvent) {
    const sourceId = String(e.active.id);
    const targetId = e.over ? String(e.over.id) : null;
    if (!targetId || sourceId === targetId) return;
    onChange(mergeCategories(categories, sourceId, targetId));
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: { staggerChildren: 0.04, delayChildren: 0.1 },
          },
        }}
      >
        {categories.map((cat) => {
          const tracks = cat.example_track_ids
            .map((id) => trackLookup[id])
            .filter(Boolean) as TrackLookupEntry[];
          return (
            <motion.div
              key={cat.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <DraggableCard id={cat.id}>
                <CategoryCard
                  category={cat as CategoryCardData}
                  tracks={tracks}
                  totalCount={estimates[cat.id] ?? tracks.length}
                  onRename={(name) =>
                    onChange(
                      categories.map((c) =>
                        c.id === cat.id ? { ...c, name } : c,
                      ),
                    )
                  }
                  onDelete={() =>
                    onChange(categories.filter((c) => c.id !== cat.id))
                  }
                />
              </DraggableCard>
            </motion.div>
          );
        })}
      </motion.div>
    </DndContext>
  );
}
