import { useMemo, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';

function statusBadgeVariant(status: unknown): 'default' | 'success' | 'warning' | 'danger' {
  const value = String(status ?? '');
  if (value === 'active' || value === 'approved' || value === 'live') return 'success';
  if (value === 'pending' || value === 'submitted' || value === 'waiting') return 'warning';
  if (value === 'denied') return 'danger';
  return 'default';
}

function CellBadge({ children, variant }: { children: ReactNode; variant: 'default' | 'success' | 'warning' | 'danger' }) {
  const colors = {
    default: { background: 'var(--hcaf-surface-elevated)', color: 'var(--hcaf-text)' },
    success: { background: 'rgba(34,197,94,0.15)', color: 'var(--hcaf-success)' },
    warning: { background: 'rgba(245,158,11,0.15)', color: 'var(--hcaf-warning)' },
    danger: { background: 'rgba(239,68,68,0.15)', color: 'var(--hcaf-danger)' },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        ...colors[variant],
      }}
    >
      {children}
    </span>
  );
}

function formatCell(columnId: string, value: unknown) {
  if (columnId === 'status' || columnId === 'agentStatus') {
    return <CellBadge variant={statusBadgeVariant(value)}>{String(value ?? '—')}</CellBadge>;
  }

  if ((columnId === 'copay' || columnId === 'amount') && typeof value === 'number') {
    return `$${value.toFixed(2)}`;
  }

  return String(value ?? '—');
}

const thStyle = {
  textAlign: 'left' as const,
  padding: '6px 8px',
  borderBottom: '1px solid var(--hcaf-border)',
  color: 'var(--hcaf-text-muted)',
  fontWeight: 600,
  textTransform: 'capitalize' as const,
  userSelect: 'none' as const,
  whiteSpace: 'nowrap' as const,
};

const tdStyle = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--hcaf-border)',
};

export function DataTable({
  rows,
  columns,
  sortable = true,
}: {
  rows: Array<Record<string, unknown>>;
  columns: string[];
  sortable?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columnDefs = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      columns.map((col) => ({
        id: col,
        accessorKey: col,
        header: col,
        cell: ({ getValue }) => formatCell(col, getValue()),
        enableSorting: sortable,
      })),
    [columns, sortable],
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortable ? getSortedRowModel() : undefined,
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  style={{
                    ...thStyle,
                    cursor: sortable && header.column.getCanSort() ? 'pointer' : 'default',
                  }}
                  onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {sortable && header.column.getIsSorted() === 'asc' ? ' ↑' : null}
                  {sortable && header.column.getIsSorted() === 'desc' ? ' ↓' : null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} style={tdStyle}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
