"use client";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";
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
  onAddTrack?: (categoryId: string) => void;
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
        outline: isOver ? "2px solid var(--color-accent)" : "none",
        outlineOffset: isOver ? "-2px" : undefined,
      }}
      className="relative group"
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        className="absolute top-3 right-3 z-10 p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Drag to merge into another category"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      {children}
    </div>
  );
}

export function MergeableGrid({
  categories,
  trackLookup,
  estimates,
  onChange,
  onAddTrack,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd(e: DragEndEvent) {
    const sourceId = String(e.active.id);
    const targetId = e.over ? String(e.over.id) : null;
    if (!targetId || sourceId === targetId) return;
    onChange(mergeCategories(categories, sourceId, targetId));
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
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
                  onAddTrack={onAddTrack ? () => onAddTrack(cat.id) : undefined}
                />
              </DraggableCard>
            </motion.div>
          );
        })}
      </motion.div>
    </DndContext>
  );
}
