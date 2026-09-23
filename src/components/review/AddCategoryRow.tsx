"use client";
import { useId, useRef, useState } from "react";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { nameKey } from "@/src/lib/categories/edits";
import { FieldTextarea } from "./FieldTextarea";
import { INDEX_TYPE, ROW_GRID, position } from "./CategoryRow";
import { useFocusAfterRender } from "./useFocusAfterRender";

export interface AddCategoryRowProps {
  /** The number the new category would take in the index. */
  number: number;
  /** nameKey() of every name already in the draft. */
  taken: ReadonlySet<string>;
  onAdd: (name: string, description: string) => void;
}

/** The index's last line: the next number, and a slot to fill. */
export function AddCategoryRow({ number, taken, onAdd }: AddCategoryRowProps) {
  const rootRef = useRef<HTMLLIElement>(null);
  const focusAfter = useFocusAfterRender(rootRef);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const errorId = useId();

  const key = nameKey(name);
  const clash = key !== "" && taken.has(key);
  const ready = key !== "" && !clash;

  function close() {
    setOpen(false);
    setName("");
    setDescription("");
    focusAfter("add");
  }

  function submit() {
    if (!ready) return;
    onAdd(name.trim(), description.trim());
    close();
  }

  const index = (
    <span aria-hidden className={INDEX_TYPE}>
      {position(number)}
    </span>
  );

  return (
    <li ref={rootRef}>
      {open ? (
        <form
          className={clsx(ROW_GRID, "gap-y-2 py-3")}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {index}
          <div className="min-w-0">
            <FieldTextarea
              face="display"
              data-focus="new-name"
              aria-label="New category name"
              placeholder="e.g. trap with sad piano samples"
              value={name}
              invalid={clash}
              aria-describedby={clash ? errorId : undefined}
              onValueChange={setName}
              onEnter={submit}
              onEscape={close}
            />
            {clash && (
              <p
                id={errorId}
                role="alert"
                className="mt-1 text-sm text-[var(--color-danger)]"
              >
                Another category is called this.
              </p>
            )}
          </div>
          <div className="col-start-2 min-w-0 lg:col-start-3">
            <FieldTextarea
              face="body"
              aria-label="New category description"
              placeholder="how it feels"
              value={description}
              onValueChange={setDescription}
              onEnter={submit}
              onEscape={close}
            />
          </div>
          <div className="col-start-2 -ml-1 flex gap-x-6 pt-3 lg:col-end-4">
            <Button type="submit" variant="ghost" size="sm" disabled={!ready}>
              Add
            </Button>
            <Button variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className={clsx(ROW_GRID, "py-3")}>
          {index}
          <Button
            variant="ghost"
            data-focus="add"
            className="-ml-1 justify-self-start"
            onClick={() => {
              setOpen(true);
              focusAfter("new-name");
            }}
          >
            Add a category
          </Button>
        </div>
      )}
    </li>
  );
}
