import React, { FC } from "react";

interface FileInputProps {
  className?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  name?: string;
  /** Which kinds it takes, as the input's `accept` ("image/*,.pdf"). */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}

/**
 * A native file field (LIB-FILEINPUT) in the `field` register: the browser's
 * "Choose file" button drawn as a quiet segment at the start of the field. For
 * a drop target, use `common/DropZone`.
 */
const FileInput: FC<FileInputProps> = ({ className = "", onChange, id, name, accept, multiple, disabled }) => {
  return (
    <input
      type="file"
      id={id}
      name={name}
      accept={accept}
      multiple={multiple}
      disabled={disabled}
      className={`h-10 w-full cursor-pointer overflow-hidden rounded-lg border border-gray-300 bg-transparent text-sm text-gray-600 shadow-theme-xs transition-colors duration-150 ease-out file:mr-4 file:h-full file:cursor-pointer file:border-0 file:border-r file:border-solid file:border-gray-200 file:bg-gray-50 file:px-3 file:text-sm file:font-medium file:text-gray-700 hover:border-gray-400 hover:file:bg-gray-100 focus:border-brand-600 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:text-gray-400 dark:file:border-white/[0.08] dark:file:bg-white/[0.04] dark:file:text-gray-200 dark:hover:border-white/[0.16] dark:hover:file:bg-white/[0.07] dark:focus:border-brand-500 ${className}`}
      onChange={onChange}
    />
  );
};

export default FileInput;
