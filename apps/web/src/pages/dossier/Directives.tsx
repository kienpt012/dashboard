import { DeleteOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, DatePicker, Flex, Form, Input, Modal, Popconfirm, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NoData } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { date, dateTime } from '@/lib/format';
import { can, WORKING } from '@/lib/roles';
import { directiveKindLabels, type DirectiveKind } from '@/types/domain';
import { useDossier, useDossierRun, type DossierDirective } from './context';
import { EvidenceList, EvidencePicker, uploadEvidenceFiles } from './evidence';

type DocumentOption = { id: string; code: string; title: string; docNumber?: string | null };
type Values = { kind: DirectiveKind; docNumber?: string; issuedDate?: Dayjs; issuer?: string; title: string; note?: string; sourceDocumentId?: string };

function DirectiveModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { d } = useDossier();
  const run = useDossierRun();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const documents = useApi<DocumentOption[]>(open ? '/documents' : null, { staleTime: 60_000 });

  async function submit(values: Values) {
    setSaving(true);
    const created = await run(async () => {
      const directive = await http.post<{ id: string }>(`/targets/${d.id}/directives`, {
        kind: values.kind,
        title: values.title.trim(),
        docNumber: values.docNumber?.trim() || undefined,
        issuedDate: values.issuedDate?.format('YYYY-MM-DD'),
        issuer: values.issuer?.trim() || undefined,
        note: values.note?.trim() || undefined,
        sourceDocumentId: values.sourceDocumentId || undefined,
      });
      if (files.length && directive?.id) {
        const failures = await uploadEvidenceFiles(d.id, files, { directiveId: directive.id });
        if (failures.length) message.warning(`Chưa tải được: ${failures.join('; ')}`);
      }
      return directive;
    }, 'Đã bổ sung văn bản chỉ đạo');
    setSaving(false);
    if (created) {
      form.resetFields();
      setFiles([]);
      onClose();
    }
  }

  return (
    <Modal title="Thêm văn bản chỉ đạo" open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" confirmLoading={saving} width={700} destroyOnHidden mask={{ closable: false }}>
      <Form form={form} layout="vertical" initialValues={{ kind: 'KE_HOACH' }} onFinish={values => void submit(values)} className="form-grid">
        <Form.Item name="kind" label="Loại văn bản" rules={[{ required: true }]}>
          <Select options={(Object.keys(directiveKindLabels) as DirectiveKind[]).map(key => ({ value: key, label: directiveKindLabels[key] }))} />
        </Form.Item>
        <Form.Item name="docNumber" label="Số hiệu">
          <Input maxLength={80} placeholder="Ví dụ: 125/KH-UBND" />
        </Form.Item>
        <Form.Item name="issuedDate" label="Ngày ban hành">
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="issuer" label="Cơ quan ban hành">
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="title" label="Trích yếu" className="span-2" rules={[{ required: true, min: 3, message: 'Ít nhất 3 ký tự' }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} />
        </Form.Item>
        <Form.Item name="note" label="Nội dung chỉ đạo chính" className="span-2">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1000} />
        </Form.Item>
        <Form.Item name="sourceDocumentId" label="Văn bản trong kho" className="span-2">
          <Select
            allowClear
            loading={documents.isLoading}
            showSearch={{ optionFilterProp: 'label' }}
            options={(documents.data ?? []).map(item => ({ value: item.id, label: `${item.docNumber || item.code} — ${item.title}` }))}
          />
        </Form.Item>
        <Form.Item label="Tệp văn bản" className="span-2" extra="Ảnh hoặc PDF, tối đa 10MB mỗi tệp">
          <EvidencePicker files={files} onChange={setFiles} label="Chọn tệp" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function DirectivesTab() {
  const { d, me } = useDossier();
  const run = useDossierRun();
  const [adding, setAdding] = useState(false);
  const canRemove = (item: DossierDirective) => can(me, WORKING) && (item.createdById === me.id || d.permissions.canEvaluate);

  return (
    <div className="tab-body">
      {d.sourceDocument && (
        <Alert
          type="info"
          showIcon
          icon={<FileTextOutlined />}
          style={{ marginBottom: 16 }}
          title={
            <span>
              Giao theo văn bản <Link to={`/admin/documents/${d.sourceDocument.id}`}>{d.sourceDocument.docNumber || d.sourceDocument.code}</Link> — {d.sourceDocument.title}
            </span>
          }
        />
      )}
      <Flex justify="space-between" align="center" className="tab-section-head">
        <Typography.Text strong>Văn bản chỉ đạo ({d.directives.length})</Typography.Text>
        {d.permissions.canContribute && !d.isArchived && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
            Thêm văn bản
          </Button>
        )}
      </Flex>
      {d.directives.length ? (
        d.directives.map(item => (
          <div key={item.id} className="entry">
            <Flex justify="space-between" align="flex-start" gap={12}>
              <Space size={8} wrap>
                <Tag color="geekblue">{item.kindLabel || directiveKindLabels[item.kind]}</Tag>
                {item.docNumber && <Typography.Text strong>Số {item.docNumber}</Typography.Text>}
                {item.issuedDate && <span className="muted">ngày {date(item.issuedDate)}</span>}
              </Space>
              {canRemove(item) && !d.isArchived && (
                <Popconfirm
                  title="Gỡ văn bản chỉ đạo?"
                  description="Văn bản và tệp đính kèm sẽ được gỡ khỏi hồ sơ."
                  okText="Gỡ"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => run(() => http.delete(`/targets/${d.id}/directives/${item.id}`), 'Đã gỡ văn bản')}
                >
                  <Tooltip title="Gỡ">
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Gỡ văn bản" />
                  </Tooltip>
                </Popconfirm>
              )}
            </Flex>
            <div className="entry-title">{item.title}</div>
            {item.issuer && (
              <div className="entry-line">
                <span className="entry-label">Ban hành</span>
                {item.issuer}
              </div>
            )}
            {item.note && (
              <div className="entry-line">
                <span className="entry-label">Nội dung</span>
                {item.note}
              </div>
            )}
            {item.sourceDocument && (
              <div className="entry-line">
                <span className="entry-label">Trong kho</span>
                <Link to={`/admin/documents/${item.sourceDocument.id}`}>
                  {item.sourceDocument.code} — {item.sourceDocument.title}
                </Link>
              </div>
            )}
            <EvidenceList targetId={d.id} items={item.evidences} />
            <div className="entry-meta" style={{ marginTop: 6 }}>
              {item.createdByName} · {dateTime(item.createdAt)}
            </div>
          </div>
        ))
      ) : (
        <NoData text="Chưa có văn bản chỉ đạo" />
      )}
      <DirectiveModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
