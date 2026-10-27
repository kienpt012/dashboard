import {
  AppstoreAddOutlined,
  BgColorsOutlined,
  CheckCircleFilled,
  CheckOutlined,
  CloudOutlined,
  EditOutlined,
  ExclamationCircleFilled,
  LoadingOutlined,
  MoreOutlined,
  RedoOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Modal, Segmented, Select, Tooltip } from 'antd';
import { useMe } from '@/app/session';
import { isGlobal } from '@/lib/roles';
import { SpaceTabs } from './SpaceTabs';
import { BREAKPOINT_LABEL, type DeskBreakpoint, type DeskSpace } from './types';
import { useDesk } from './useDesk';

// Đầu bàn làm việc: không gian, phòng đang xem, trạng thái lưu, nút tùy biến và menu. Thanh công cụ nổi khi tùy biến.

export function SaveIndicator() {
  const { save, store } = useDesk();
  if (save === 'idle') return null;
  const content = {
    saving: [<LoadingOutlined key="i" />, 'Đang lưu…'],
    saved: [<CheckCircleFilled key="i" />, 'Đã lưu'],
    offline: [<CloudOutlined key="i" />, 'Ngoại tuyến — sẽ lưu khi có mạng'],
    error: [<ExclamationCircleFilled key="i" />, 'Chưa lưu được'],
  }[save];
  return (
    <span className={`desk-save ${save}`} role="status">
      {content}
      {save === 'error' && (
        <button type="button" className="desk-link" onClick={() => store.retry()}>
          Thử lại
        </button>
      )}
    </span>
  );
}

export function DepartmentFocus({ space }: { space: DeskSpace }) {
  const user = useMe();
  const desk = useDesk();
  if (!isGlobal(user)) {
    return user.department ? <span className="desk-chip">{user.department.name}</span> : null;
  }
  if (!desk.focusDepartments.length) return <span className="desk-chip muted">Chưa có phòng ban</span>;
  return (
    <Select
      className="desk-focus"
      value={space.config.focusDepartmentId ?? undefined}
      placeholder="Chọn phòng cần xem"
      onChange={value => desk.store.updateSpace(space.id, config => ({ ...config, focusDepartmentId: value }))}
      popupMatchSelectWidth={false}
      showSearch
      optionFilterProp="title"
      options={desk.focusDepartments.map(department => ({
        value: department.id,
        title: department.name,
        label: (
          <span className="desk-focus-option">
            <i style={{ background: department.color }} />
            {department.name}
          </span>
        ),
      }))}
      aria-label="Phòng đang xem"
    />
  );
}

export function DeskHeader({ space, onBackground, onLibrary }: { space: DeskSpace; onBackground: () => void; onLibrary: () => void }) {
  const desk = useDesk();
  const { store } = desk;
  return (
    <div className="desk-header">
      <SpaceTabs />
      <div className="desk-header-actions">
        <DepartmentFocus space={space} />
        <SaveIndicator />
        <Button className="desk-glass-btn" type={desk.editing ? 'primary' : 'default'} icon={desk.editing ? <CheckOutlined /> : <EditOutlined />} onClick={() => store.setEditing(!desk.editing)}>
          {desk.editing ? 'Xong' : 'Tùy biến'}
        </Button>
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              { key: 'library', icon: <AppstoreAddOutlined />, label: 'Thêm widget', onClick: onLibrary },
              { key: 'background', icon: <BgColorsOutlined />, label: 'Hình nền và giao diện', onClick: onBackground },
            ],
          }}
        >
          <Button className="desk-glass-btn" icon={<MoreOutlined />} aria-label="Thêm thao tác" />
        </Dropdown>
      </div>
    </div>
  );
}

export function EditToolbar({ onLibrary, onBackground }: { onLibrary: () => void; onBackground: () => void }) {
  const desk = useDesk();
  const { store } = desk;
  if (!desk.editing) return null;
  return (
    <div className="desk-edit-bar" role="toolbar" aria-label="Tùy biến bàn làm việc">
      <Button type="primary" icon={<AppstoreAddOutlined />} onClick={onLibrary}>
        Thêm widget
      </Button>
      <Button icon={<BgColorsOutlined />} onClick={onBackground}>
        Hình nền
      </Button>
      <span className="desk-edit-sep" />
      <Tooltip title="Hoàn tác (Ctrl Z)">
        <Button icon={<UndoOutlined />} disabled={!desk.canUndo} onClick={store.undo} aria-label="Hoàn tác" />
      </Tooltip>
      <Tooltip title="Làm lại (Ctrl Y)">
        <Button icon={<RedoOutlined />} disabled={!desk.canRedo} onClick={store.redo} aria-label="Làm lại" />
      </Tooltip>
      <span className="desk-edit-sep" />
      <Segmented
        value={desk.previewBreakpoint ?? 'desktop'}
        onChange={value => store.setPreviewBreakpoint(value === 'desktop' ? null : (value as DeskBreakpoint))}
        options={(['desktop', 'tablet', 'mobile'] as DeskBreakpoint[]).map(value => ({ value, label: BREAKPOINT_LABEL[value] }))}
      />
      <span className="desk-edit-sep" />
      <Button type="primary" icon={<CheckOutlined />} onClick={() => store.setEditing(false)}>
        Xong
      </Button>
    </div>
  );
}

export function ConflictDialog() {
  const desk = useDesk();
  const conflict = desk.conflict;
  const space = conflict?.kind === 'space' ? desk.spaces.find(item => item.id === conflict.id) : null;
  return (
    <Modal
      open={Boolean(conflict)}
      title="Bàn làm việc vừa được sửa ở nơi khác"
      closable={false}
      mask={{ closable: false }}
      footer={[
        <Button key="theirs" onClick={() => void desk.store.resolveConflict('theirs')}>
          Dùng bản mới nhất
        </Button>,
        <Button key="mine" type="primary" onClick={() => void desk.store.resolveConflict('mine')}>
          Giữ bản của tôi
        </Button>,
      ]}
    >
      {space ? `Không gian “${space.name}”` : 'Cài đặt giao diện'} vừa được thay đổi ở một tab hoặc máy khác. Chọn “Giữ bản của tôi” để ghi bản đang thấy lên máy chủ, hoặc “Dùng bản mới nhất” để tải bản kia về.
    </Modal>
  );
}
