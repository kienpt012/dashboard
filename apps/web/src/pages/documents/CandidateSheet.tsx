import { FileExcelOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Checkbox, Descriptions, Flex, Modal, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { invalidate } from '@/hooks/useApi';
import { errorText, http, saveBlob } from '@/lib/api';

type Issue = { row: number; message: string };
type SheetResult = {
  applied: boolean;
  updates: { row: number; id: string; name: string; fields: string[] }[];
  creates: { row: number; name: string }[];
  drops: { row: number; id: string; name: string }[];
  reordered: number;
  unchanged: number;
  notInFile: { id: string; name: string }[];
  errors: Issue[];
  warnings: Issue[];
  totalRows: number;
  submitted?: number;
  incomplete?: { id: string; name: string; missing: string[] }[];
};

const FIELD_LABELS: Record<string, string> = {
  name: 'tên',
  ordinal: 'STT',
  parentName: 'chỉ tiêu cha',
  description: 'ghi chú',
  category: 'lĩnh vực',
  groupName: 'nhóm',
  unit: 'đơn vị tính',
  targetValue: 'giá trị kế hoạch',
  targetText: 'kế hoạch ghi bằng chữ',
  direction: 'chiều đánh giá',
  frequency: 'kỳ báo cáo',
  deadline: 'hạn',
  responsibleDepartmentId: 'phòng chủ trì',
};

function IssueList({ items, type }: { items: Issue[]; type: 'error' | 'warning' }) {
  if (!items.length) return null;
  return (
    <Alert
      type={type}
      showIcon
      title={type === 'error' ? `${items.length} lỗi cần sửa trong file trước khi cập nhật` : `${items.length} lưu ý`}
      description={
        <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 180, overflow: 'auto' }}>
          {items.map((item, index) => <li key={index}>Hàng {item.row}: {item.message}</li>)}
        </ul>
      }
    />
  );
}

function NameList({ title, items }: { title: string; items: { key: string; text: string }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <Typography.Text strong>{title} ({items.length})</Typography.Text>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18, maxHeight: 160, overflow: 'auto' }}>
        {items.map(item => <li key={item.key}>{item.text}</li>)}
      </ul>
    </div>
  );
}

/**
 * Bảng chỉ tiêu theo khuôn Phụ lục 1: chuyên viên tải về, chuẩn hoá trong Excel, tải lên lại; hệ thống hiện trước các
 * thay đổi rồi mới ghi, và có thể trình luôn để từng phòng chủ trì nhận đề xuất của phòng mình.
 */
export function CandidateSheetActions({ documentId, documentCode }: { documentId: string; documentCode: string }) {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SheetResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [submit, setSubmit] = useState(true);

  async function download() {
    setDownloading(true);
    try {
      saveBlob(await http.blob(`/documents/${documentId}/candidate-sheet`), `Bang_chi_tieu_${documentCode}.xlsx`);
    } catch (error) {
      message.error(errorText(error, 'Không tạo được bảng chỉ tiêu'));
    } finally {
      setDownloading(false);
    }
  }

  async function send(chosen: File, apply: boolean) {
    const body = new FormData();
    body.append('file', chosen);
    return http.post<SheetResult>(`/documents/${documentId}/candidate-sheet?apply=${apply ? 1 : 0}&submit=${apply && submit ? 1 : 0}`, body);
  }

  async function check(chosen: File) {
    setChecking(true);
    try {
      setFile(chosen);
      setPreview(await send(chosen, false));
    } catch (error) {
      message.error(errorText(error, 'Không đọc được bảng'));
    } finally {
      setChecking(false);
      if (input.current) input.current.value = '';
    }
  }

  async function apply() {
    if (!file) return;
    setApplying(true);
    try {
      const result = await send(file, true);
      setPreview(null);
      setFile(null);
      await invalidate(client, ['/candidates', '/my-work', '/documents']);
      const parts = [
        `${result.updates.length} chỉ tiêu được sửa`,
        `${result.creates.length} chỉ tiêu thêm mới`,
        `${result.drops.length} chỉ tiêu bị loại`,
        ...(result.submitted !== undefined && submit ? [`${result.submitted} đề xuất đã trình đến phòng chủ trì`] : []),
      ];
      if (result.incomplete?.length) {
        modal.warning({
          title: 'Đã cập nhật bảng chỉ tiêu',
          content: (
            <>
              <p>{parts.join(', ')}.</p>
              <p>{result.incomplete.length} đề xuất chưa trình vì còn thiếu thông tin:</p>
              <ul style={{ paddingLeft: 18, maxHeight: 200, overflow: 'auto' }}>
                {result.incomplete.map(item => <li key={item.id}>{item.name}: thiếu {item.missing.join(', ')}</li>)}
              </ul>
            </>
          ),
        });
      } else {
        message.success(`Đã cập nhật: ${parts.join(', ')}.`);
      }
    } catch (error) {
      message.error(errorText(error, 'Không cập nhật được bảng'));
    } finally {
      setApplying(false);
    }
  }

  const blocked = Boolean(preview?.errors.length);
  const nothing = preview && !preview.updates.length && !preview.creates.length && !preview.drops.length && !preview.reordered;
  return (
    <>
      <Button icon={<FileExcelOutlined />} loading={downloading} onClick={() => void download()}>
        Tải bảng chỉ tiêu
      </Button>
      <Button icon={<UploadOutlined />} loading={checking} onClick={() => input.current?.click()}>
        Tải bảng đã chuẩn hoá
      </Button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={event => {
          const chosen = event.target.files?.[0];
          if (chosen) void check(chosen);
        }}
      />
      <Modal
        open={Boolean(preview)}
        title="Xem trước thay đổi từ bảng chỉ tiêu"
        width={720}
        onCancel={() => { setPreview(null); setFile(null); }}
        okText={submit ? 'Cập nhật và trình' : 'Cập nhật'}
        okButtonProps={{ disabled: blocked || (Boolean(nothing) && !submit), loading: applying }}
        onOk={() => void apply()}
        destroyOnHidden
      >
        {preview && (
          <Flex vertical gap={12}>
            <Descriptions
              size="small"
              column={2}
              items={[
                { label: 'Số hàng chỉ tiêu', children: preview.totalRows },
                { label: 'Không đổi', children: preview.unchanged },
                { label: 'Sửa', children: preview.updates.length },
                { label: 'Thêm mới', children: preview.creates.length },
                { label: 'Loại', children: preview.drops.length },
                { label: 'Đổi thứ tự', children: preview.reordered },
              ]}
            />
            <IssueList items={preview.errors} type="error" />
            <IssueList items={preview.warnings} type="warning" />
            <NameList
              title="Chỉ tiêu được sửa"
              items={preview.updates.map(item => ({ key: item.id, text: `Hàng ${item.row}: ${item.name} (${item.fields.map(field => FIELD_LABELS[field] ?? field).join(', ')})` }))}
            />
            <NameList title="Chỉ tiêu thêm mới" items={preview.creates.map(item => ({ key: `n${item.row}`, text: `Hàng ${item.row}: ${item.name}` }))} />
            <NameList title="Chỉ tiêu bị loại" items={preview.drops.map(item => ({ key: item.id, text: `Hàng ${item.row}: ${item.name}` }))} />
            {preview.notInFile.length > 0 && (
              <Alert
                type="info"
                showIcon
                title={`${preview.notInFile.length} đề xuất chưa duyệt không có trong file và được giữ nguyên`}
                description={'Muốn loại chỉ tiêu, hãy chọn "Bỏ" ở cột Xử lý thay vì xoá hàng.'}
              />
            )}
            <Checkbox checked={submit} onChange={event => setSubmit(event.target.checked)}>
              Trình luôn các đề xuất đủ thông tin; mỗi phòng chủ trì nhận đề xuất của phòng mình để duyệt
            </Checkbox>
          </Flex>
        )}
      </Modal>
    </>
  );
}
