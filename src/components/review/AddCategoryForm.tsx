"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { Input } from "@/src/components/design/Input";
import { Button } from "@/src/components/design/Button";

export function AddCategoryForm({
  onAdd,
}: {
  onAdd: (name: string, description: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  function submit() {
    if (!name.trim()) return;
    onAdd(name.trim(), desc.trim());
    setName("");
    setDesc("");
    setOpen(false);
  }

  return (
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div
          key="form"
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] p-8 space-y-6"
        >
          <Input
            label="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. trap with sad piano samples"
          />
          <Input
            label="Short description"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="how it feels"
          />
          <div className="flex items-center gap-6">
            <Button onClick={submit} disabled={!name.trim()}>
              Add
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </motion.div>
      ) : (
        <motion.button
          key="cta"
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border border-dashed border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] p-8 text-[var(--color-text-secondary)] transition-colors flex items-center gap-3 justify-center"
        >
          <Plus size={16} strokeWidth={1.25} />
          Add a category
        </motion.button>
      )}
    </AnimatePresence>
  );
}
