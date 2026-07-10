import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

/**
 * A minimal, typed data-grid used for the option-chain/strike tables, journal
 * list, and alert log — anywhere we render tabular mock (later: real) data
 * without pulling in a full grid library for Milestone 1.
 */
export function DataTable<T>({ columns, rows, rowKey, emptyMessage = "No data yet." }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="p-4 text-center text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.key} className={col.align === "right" ? "text-right" : undefined}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={rowKey(row)}>
            {columns.map((col) => (
              <TableCell
                key={col.key}
                className={col.align === "right" ? "text-right font-mono tabular" : undefined}
              >
                {col.render(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
