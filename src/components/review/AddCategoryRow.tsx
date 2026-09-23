"use client";
import { useId, useRef, useState } from "react";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { Tab } from "@/src/components/graphics/Tab";
import { nameKey } from "@/src/lib/categories/edits";
import { NAME_INSET, TAB_AT_DASHED } from "./CategoryRow";
import { FieldTextarea } from "./FieldTextarea";
import { useFocusAfterRender } from "./useFocusAfterRender";

export interface AddCategoryRowProps {
  /** The number the new category would take in the bin. */
  number: number;
  /** nameKey() of every name already in the draft. */
  taken: ReadonlySet<string>;
  onAdd: (name: string, description: string) => void;
}

/** The bin's last divider: a dashed blank with the next number, to fill in. */
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

  return (
    <li
      ref={rootRef}
      className={clsx(
        "relative rounded-[3px] border-[1.5px] border-dashed",
        open ? "border-ink bg-card" : "border-rule-strong",
      )}
    >
      <Tab
        catalogueNo={number}
        temperature={null}
        size="review"
        aria-hidden
        className={TAB_AT_DASHED}
      />
      {open ? (
        <form
          className="grid gap-y-4 p-4 max-tab:px-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
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
              <p id={errorId} role="alert" className="mt-1.5 text-danger">
                Another category is called this.
              </p>
            )}
          </div>
          <FieldTextarea
            face="body"
            aria-label="New category description"
            placeholder="how it feels"
            value={description}
            onValueChange={setDescription}
            onEnter={submit}
            onEscape={close}
          />
          <div className="flex gap-x-6">
            <Button type="submit" variant="quiet" disabled={!ready}>
              Add
            </Button>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className={clsx("flex min-h-[55px] items-center", NAME_INSET)}>
          <Button
            variant="quiet"
            data-focus="add"
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
