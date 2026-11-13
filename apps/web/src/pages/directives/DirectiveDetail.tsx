import { EditOutlined, FileTextOutlined, InboxOutlined, PlusOutlined, SnippetsOutlined } from '@ant-design/icons';
import { App, Button, Card, DatePicker, Descriptions, Flex, Grid, Select, Table, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DocumentViewer } from '@/components/DocumentViewer';
import { Page } from '@/components/Page';
import { Query } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { date, dateTime, until, vn } from '@/lib/format';
import { BulkTasks, DirectiveForm, PasteTasks, TaskForm } from './DirectiveForms';
import { DIRECTIVE_REFRESH, DirectiveMetrics, TaskProgress, TaskStatus } from './shared';
import type { DirectiveDetail as Detail, DirectiveOptions, DirectiveTask } from './types';
import './directives.css';

function DetailBody({ directive, options }: { directive: Detail; options: DirectiveOptions }) {
  const screens = Grid.useBreakpoint();
  const { modal } = App.useApp();
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [editor, setEditor] = useState<'document' | 'task' | 'paste' | 'bulk' | null>(null);
  const [editingTask, setEditingTask] = useState<DirectiveTask | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const dispatch = directive.permissions.canDispatch && directive.isActive;
  const tasks = directive.tasks;
  const selectedTasks = tasks.filter(task => selected.includes(task.id));
  const departments = options.departments.map(item => ({ value: item.id, label: item.name }));
  const saveTask = useAction(({ task, changes }: { task: DirectiveTask; changes: Record<string, unknown> }) => http.patch(`/directives/${directive.id}/tasks/${task.id}`, { ...changes, expectedVersion: task.version }), { success: 'Đã cập nhật nhiệm vụ', refresh: DIRECTIVE_REFRESH });
  const archiveTasks = useAction(() => http.post(`/directives/${directive.id}/bulk`, { tasks: selectedTasks.map(task => ({ id: task.id, expectedVersion: task.version })), isArchived: true }), { success: 'Đã lưu trữ nhiệm vụ đã chọn', refresh: DIRECTIVE_REFRESH, onDone: () => setSelected([]) });
  const archiveDocument = useAction(() => http.patch(`/directives/${directive.id}`, { expectedVersion: directive.version, isActive: !directive.isActive }), { success: directive.isActive ? 'Đã lưu trữ văn bản' : 'Đã khôi phục văn bản', refresh: DIRECTIVE_REFRESH });
  return <Page title={directive.name} tags={!directive.isActive && <Tag>Đã lưu trữ</Tag>} breadcrumb={[{ label: 'Văn bản chỉ đạo', to: '/admin/van-ban-chi-dao' }, { label: directive.docNumber || 'Chi tiết' }]} wide extra={<>
    {directive.sourceDocumentId && <Button icon={<FileTextOutlined />} onClick={() => setDocumentId(directive.sourceDocumentId)}>Mở văn bản</Button>}
    {directive.permissions.canDispatch && <>
      <Button icon={<EditOutlined />} onClick={() => setEditor('document')}>Sửa văn bản</Button>
      <Button icon={<InboxOutlined />} onClick={() => modal.confirm({ title: directive.isActive ? 'Lưu trữ văn bản chỉ đạo?' : 'Khôi phục văn bản chỉ đạo?', content: directive.docNumber || directive.name, okText: directive.isActive ? 'Lưu trữ' : 'Khôi phục', cancelText: 'Hủy', onOk: () => archiveDocument.mutateAsync() })}>{directive.isActive ? 'Lưu trữ' : 'Khôi phục'}</Button>
    </>}
  </>}>
    <Card className="directive-meta"><Descriptions column={{ xs: 1, sm: 2, xl: 3 }} size="small" items={[
      { label: 'Số ký hiệu', children: directive.docNumber || '—' },
      { label: 'Loại văn bản', children: options.kinds.find(item => item.value === directive.directiveKind)?.label || 'Nhiệm vụ' },
      { label: 'Ngày ban hành', children: date(directive.issuedDate) },
      { label: 'Cơ quan ban hành', children: directive.issuer || '—' },
      { label: 'Người ký', children: directive.signer || '—' },
    ]} /></Card>
    <Card className="card-flush" style={{ marginBottom: 16 }}><DirectiveMetrics summary={directive.summary} /></Card>
    <Card title="Nhiệm vụ được giao" className="card-flush">
      {dispatch && <Flex className="directive-toolbar" gap={10} justify="space-between" align="center" wrap>
        <div className="directive-task-actions"><Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingTask(null); setEditor('task'); }}>Thêm nhiệm vụ</Button><Button icon={<SnippetsOutlined />} onClick={() => setEditor('paste')}>Dán danh sách</Button></div>
        {selectedTasks.length > 0 && <Flex gap={8} align="center" wrap><span>Đã chọn {selectedTasks.length}</span><Button onClick={() => setEditor('bulk')}>Giao phòng / đặt hạn</Button><Button onClick={() => modal.confirm({ title: `Lưu trữ ${selectedTasks.length} nhiệm vụ?`, okText: 'Lưu trữ', cancelText: 'Hủy', onOk: () => archiveTasks.mutateAsync() })}>Lưu trữ</Button><Button type="text" onClick={() => setSelected([])}>Bỏ chọn</Button></Flex>}
      </Flex>}
      <Table rowKey="id" dataSource={tasks} scroll={{ x: dispatch ? 1560 : 1360 }} sticky pagination={{ defaultPageSize: 20, showSizeChanger: true }} rowSelection={dispatch ? { selectedRowKeys: selected, onChange: keys => setSelected(keys) } : undefined} columns={[
        { title: 'STT', key: 'index', width: 60, render: (_, task, index) => task.ordinal || index + 1 },
        { title: 'Nội dung nhiệm vụ', key: 'title', width: screens.md ? 300 : 240, render: (_, task) => <div className="directive-name"><Link to={`/admin/targets/${task.id}`}>{task.title}</Link><span className="directive-cell-meta">{task.dispatchedByName ? `Phân việc: ${task.dispatchedByName} · ${dateTime(task.dispatchedAt)}` : 'Chưa ghi nhận người phân việc'}</span></div> },
        { title: 'Phòng chủ trì', key: 'department', width: 210, render: (_, task) => dispatch ? <div className="directive-name"><span>{task.department.name}</span><Select className="directive-inline" aria-label={`Phòng chủ trì: ${task.title}`} value={task.departmentId} labelRender={() => 'Đổi phòng chủ trì'} options={departments} showSearch={{ optionFilterProp: 'label' }} disabled={saveTask.isPending} onChange={value => saveTask.mutate({ task, changes: { departmentId: value } })} /></div> : task.department.name },
        { title: 'Phòng phối hợp', key: 'coordinators', width: 210, render: (_, task) => dispatch ? <div className="directive-name"><span>{task.coordinators.map(item => item.department.name).join('; ') || '—'}</span><Select className="directive-inline" mode="multiple" maxTagCount={0} maxTagPlaceholder={() => 'Chọn phòng phối hợp'} placeholder="Chọn phòng phối hợp" aria-label={`Phòng phối hợp: ${task.title}`} value={task.coordinators.map(item => item.departmentId)} options={departments.filter(item => item.value !== task.departmentId)} showSearch={{ optionFilterProp: 'label' }} disabled={saveTask.isPending} onChange={values => saveTask.mutate({ task, changes: { coordinatorDepartmentIds: values } })} /></div> : task.coordinators.map(item => item.department.name).join('; ') || '—' },
        { title: 'Hạn hoàn thành', key: 'due', width: 170, render: (_, task) => <div className="directive-name">{dispatch ? <DatePicker value={vn(task.dueDate)} allowClear={false} format="DD/MM/YYYY" aria-label={`Hạn hoàn thành: ${task.title}`} style={{ width: '100%' }} disabled={saveTask.isPending} onChange={value => value && saveTask.mutate({ task, changes: { dueDate: value.format('YYYY-MM-DD') } })} /> : date(task.dueDate)}{task.status !== 'COMPLETED' && <span className={task.status === 'OVERDUE' ? 'directive-cell-meta tone-bad' : 'directive-cell-meta'}>{until(task.dueDate)}</span>}</div> },
        { title: 'Người phụ trách', key: 'assignee', width: 155, render: (_, task) => task.assignee?.fullName || <span className="muted">Chưa giao người</span> },
        { title: 'Tiến độ', dataIndex: 'progress', width: 135, render: value => <TaskProgress value={value} /> },
        { title: 'Trạng thái', dataIndex: 'status', width: 165, render: value => <TaskStatus status={value} /> },
        ...(dispatch ? [{ title: 'Sửa', key: 'edit', width: 70, render: (_: unknown, task: DirectiveTask) => <Tooltip title="Sửa nội dung và chỉ tiêu liên quan"><Button icon={<EditOutlined />} aria-label={`Sửa nhiệm vụ: ${task.title}`} onClick={() => { setEditingTask(task); setEditor('task'); }} /></Tooltip> }] : []),
      ]} />
    </Card>
    <DirectiveForm open={editor === 'document'} options={options} directive={directive} onClose={() => setEditor(null)} />
    <TaskForm open={editor === 'task'} options={options} directive={directive} task={editingTask} onClose={() => setEditor(null)} />
    <PasteTasks open={editor === 'paste'} options={options} directive={directive} onClose={() => setEditor(null)} />
    <BulkTasks open={editor === 'bulk'} options={options} directive={directive} tasks={selectedTasks} onClose={() => { setEditor(null); setSelected([]); }} />
    <DocumentViewer id={documentId} onClose={() => setDocumentId(null)} />
  </Page>;
}

export default function DirectiveDetail() {
  const { id } = useParams();
  const data = useApi<Detail>(id ? `/directives/${id}` : null);
  const options = useApi<DirectiveOptions>('/directives/options');
  return <div className="directive-page"><Query query={data}>{directive => <Query query={options}>{refs => <DetailBody key={directive.id} directive={directive} options={refs} />}</Query>}</Query></div>;
}
