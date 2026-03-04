"use client";

import { Loader2, FilePlus, FilePen, Trash2, FileSearch, FolderInput, CheckCircle2 } from "lucide-react";

type StrReplaceArgs = {
  command: "view" | "create" | "str_replace" | "insert" | "undo_edit";
  path: string;
};

type FileManagerArgs = {
  command: "rename" | "delete";
  path: string;
  new_path?: string;
};

function getStrReplaceLabel(args: StrReplaceArgs): { icon: React.ReactNode; text: string } {
  const name = args.path?.split("/").pop() ?? args.path;
  switch (args.command) {
    case "create":
      return { icon: <FilePlus className="w-3.5 h-3.5" />, text: `Creating ${name}` };
    case "str_replace":
    case "insert":
      return { icon: <FilePen className="w-3.5 h-3.5" />, text: `Editing ${name}` };
    case "view":
      return { icon: <FileSearch className="w-3.5 h-3.5" />, text: `Reading ${name}` };
    default:
      return { icon: <FilePen className="w-3.5 h-3.5" />, text: `Updating ${name}` };
  }
}

function getFileManagerLabel(args: FileManagerArgs): { icon: React.ReactNode; text: string } {
  const name = args.path?.split("/").pop() ?? args.path;
  switch (args.command) {
    case "rename":
      return { icon: <FolderInput className="w-3.5 h-3.5" />, text: `Renaming ${name}` };
    case "delete":
      return { icon: <Trash2 className="w-3.5 h-3.5" />, text: `Deleting ${name}` };
    default:
      return { icon: <FilePen className="w-3.5 h-3.5" />, text: name };
  }
}

interface ToolCallDisplayProps {
  toolName: string;
  args: Record<string, unknown>;
  state: string;
}

export function ToolCallDisplay({ toolName, args, state }: ToolCallDisplayProps) {
  const done = state === "result";

  let icon: React.ReactNode;
  let text: string;

  if (toolName === "str_replace_editor") {
    ({ icon, text } = getStrReplaceLabel(args as unknown as StrReplaceArgs));
  } else if (toolName === "file_manager") {
    ({ icon, text } = getFileManagerLabel(args as unknown as FileManagerArgs));
  } else {
    icon = <FilePen className="w-3.5 h-3.5" />;
    text = toolName;
  }

  return (
    <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs border border-neutral-200">
      <span className={done ? "text-emerald-600" : "text-blue-500"}>
        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      </span>
      <span className="text-neutral-500">{icon}</span>
      <span className="text-neutral-700">{text}</span>
    </div>
  );
}
