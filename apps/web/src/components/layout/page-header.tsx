import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-panel-border pb-4">
      <div className="space-y-1">
        <h1 className="font-mono text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
