import Button from "@/components/ui/button/Button";

export default function SettingsPageHeader({
  title,
  description,
  onSave,
  saving,
  notice,
  noticeError,
  saveLabel = "Save changes",
}: {
  title: string;
  description: string;
  onSave?: () => void;
  saving?: boolean;
  notice?: string;
  noticeError?: boolean;
  saveLabel?: string;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-gray-200/80 pb-4 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between md:pb-5">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      {onSave && (
        <div className="flex items-center gap-3">
          {notice && (
            <span className={`text-xs ${noticeError ? "text-error-600 dark:text-error-400" : "text-success-600 dark:text-success-400"}`}>
              {notice}
            </span>
          )}
          <Button loading={saving} onClick={onSave}>
            {saveLabel}
          </Button>
        </div>
      )}
    </header>
  );
}
