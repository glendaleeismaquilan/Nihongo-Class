import { useId, useRef, useState, type DragEvent } from "react";
import { Icon } from "./ui";

/** Drag-and-drop file picker that is also a regular, keyboard-usable file input. */
export function FileDrop({
  accept,
  multiple,
  onFiles,
  label,
  hint,
  disabled,
}: {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`flex flex-col items-center justify-center gap-2 rounded-paper border border-dashed px-4 py-6 text-center ${over ? "border-ai bg-kasumi" : "border-line bg-paper"}`}
    >
      <Icon name="upload" className="text-ink-2" />
      <label htmlFor={id} className="cursor-pointer font-medium text-ai underline">
        {label}
      </label>
      <p className="text-sm text-ink-2" id={`${id}-hint`}>
        {hint ?? "Or drag files here."}
      </p>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
