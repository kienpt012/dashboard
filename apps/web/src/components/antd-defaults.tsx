// Điểm nhập chung: giữ toàn bộ API Ant Design, chỉ đặt mặc định sticky cho Table.
// Nhờ vậy Kho văn bản cũng nhận bản sửa mà không sửa vùng mã đang được viết lại.
export * from 'antd/es';
import { Table as AntTable, type TableProps } from 'antd/es';
import { forwardRef } from 'react';
import { TABLE_STICKY } from './table-sticky';

const StickyTable = forwardRef<any, TableProps<any>>((props, ref) => (
  <AntTable {...props} ref={ref} sticky={props.sticky === false ? false : typeof props.sticky === 'object' ? { ...TABLE_STICKY, ...props.sticky } : TABLE_STICKY} />
));
StickyTable.displayName = 'IocTable';
export const Table = Object.assign(StickyTable, {
  SELECTION_COLUMN: AntTable.SELECTION_COLUMN, EXPAND_COLUMN: AntTable.EXPAND_COLUMN,
  SELECTION_ALL: AntTable.SELECTION_ALL, SELECTION_INVERT: AntTable.SELECTION_INVERT, SELECTION_NONE: AntTable.SELECTION_NONE,
  Column: AntTable.Column, ColumnGroup: AntTable.ColumnGroup, Summary: AntTable.Summary,
}) as typeof AntTable;
