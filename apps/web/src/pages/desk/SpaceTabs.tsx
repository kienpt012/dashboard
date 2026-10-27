import { CopyOutlined, DeleteOutlined, EditOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Dropdown, Form, Input, Modal, Popover, Radio, Select, type MenuProps } from 'antd';
import { useState } from 'react';
import { DeskIcon } from './icons';
import { MAX_SPACES, type DeskSpace } from './types';
import { useDesk } from './useDesk';

// Thanh không gian: mỗi không gian một viên, bấm để chuyển (Alt 1…9), chuột phải hoặc nút ⋯ để đổi tên, nhân bản, sắp
// xếp, xoá; nút + để thêm không gian trống hoặc nhân bản.

export const SPACE_ICONS = ['home', 'team', 'dashboard', 'fund-projection-screen', 'aim', 'calendar', 'star', 'flag', 'rocket', 'environment', 'safety', 'fire', 'bulb', 'trophy', 'bank', 'apartment'];

type SpaceForm = { name: string; icon: string; mode?: 'empty' | 'copy' };

function IconSelect(props: { value?: string; onChange?: (value: string) => void }) {
  return (
    <Select
      {...props}
      options={SPACE_ICONS.map(name => ({ value: name, label: <span className="icon-option"><DeskIcon name={name} /> </span> }))}
      popupMatchSelectWidth={false}
      style={{ width: 84 }}
    />
  );
}

export function SpaceTabs() {
  const desk = useDesk();
  const { spaces, activeSpaceId, store } = desk;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<DeskSpace | null>(null);
  const [addForm] = Form.useForm<SpaceForm>();
  const [editForm] = Form.useForm<SpaceForm>();

  const menuFor = (space: DeskSpace, index: number): MenuProps['items'] => [
    { key: 'rename', icon: <EditOutlined />, label: 'Đổi tên, biểu tượng', onClick: () => (setEditing(space), editForm.setFieldsValue({ name: space.name, icon: space.icon })) },
    { key: 'copy', icon: <CopyOutlined />, label: 'Nhân bản', disabled: spaces.length >= MAX_SPACES, onClick: () => void store.addSpace(`${space.name} (bản sao)`.slice(0, 40), space.icon, space.id) },
    { key: 'left', icon: <LeftOutlined />, label: 'Chuyển sang trái', disabled: index === 0, onClick: () => void store.moveSpace(space.id, index - 1) },
    { key: 'right', icon: <RightOutlined />, label: 'Chuyển sang phải', disabled: index === spaces.length - 1, onClick: () => void store.moveSpace(space.id, index + 1) },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: 'Xoá không gian',
      danger: true,
      disabled: spaces.length <= 1,
      onClick: () =>
        Modal.confirm({
          title: `Xoá không gian “${space.name}”?`,
          content: 'Mọi widget trong không gian này và dữ liệu ghi chú, việc riêng của chúng sẽ bị xoá.',
          okText: 'Xoá',
          okButtonProps: { danger: true },
          cancelText: 'Huỷ',
          onOk: () => store.removeSpace(space.id),
        }),
    },
  ];

  const addContent = (
    <Form
      form={addForm}
      layout="vertical"
      initialValues={{ name: '', icon: 'star', mode: 'empty' }}
      requiredMark={false}
      style={{ width: 280 }}
      onFinish={async values => {
        const source = values.mode === 'copy' ? activeSpaceId ?? undefined : undefined;
        const id = await store.addSpace(values.name.trim(), values.icon, source);
        if (id) {
          setAdding(false);
          addForm.resetFields();
        }
      }}
    >
      <Form.Item label="Tên không gian" required>
        <div style={{ display: 'flex', gap: 8 }}>
          <Form.Item name="icon" noStyle>
            <IconSelect />
          </Form.Item>
          <Form.Item name="name" noStyle rules={[{ required: true, whitespace: true, message: 'Nhập tên không gian' }]}>
            <Input autoFocus maxLength={40} placeholder="Ví dụ: Giao ban thứ Hai" />
          </Form.Item>
        </div>
      </Form.Item>
      <Form.Item name="mode" label="Bắt đầu từ">
        <Radio.Group
          options={[
            { value: 'empty', label: 'Không gian trống' },
            { value: 'copy', label: 'Bản sao không gian đang mở' },
          ]}
        />
      </Form.Item>
      <Button type="primary" htmlType="submit" block>
        Thêm không gian
      </Button>
    </Form>
  );

  return (
    <div className="desk-spaces" role="tablist" aria-label="Không gian">
      {spaces.map((space, index) => {
        const active = space.id === activeSpaceId;
        return (
          <Dropdown key={space.id} menu={{ items: menuFor(space, index) }} trigger={['contextMenu']}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className={`desk-space${active ? ' active' : ''}`}
              onClick={() => store.setActiveSpace(space.id)}
              title={index < 9 ? `${space.name} (Alt ${index + 1})` : space.name}
            >
              <DeskIcon name={space.icon} size={14} />
              <span>{space.name}</span>
              {active && desk.editing && (
                <Dropdown menu={{ items: menuFor(space, index) }} trigger={['click']}>
                  <span className="desk-space-more" role="button" tabIndex={0} aria-label="Thao tác với không gian" onClick={event => event.stopPropagation()}>
                    ⋯
                  </span>
                </Dropdown>
              )}
            </button>
          </Dropdown>
        );
      })}
      {spaces.length < MAX_SPACES && (
        <Popover content={addContent} title="Thêm không gian" trigger="click" open={adding} onOpenChange={setAdding} placement="bottomLeft">
          <button type="button" className="desk-space add" aria-label="Thêm không gian">
            <PlusOutlined />
          </button>
        </Popover>
      )}
      <Modal title="Đổi tên không gian" open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => editForm.submit()} okText="Lưu" cancelText="Huỷ" destroyOnHidden>
        <Form
          form={editForm}
          layout="vertical"
          requiredMark={false}
          onFinish={values => {
            if (editing) store.updateSpace(editing.id, config => config, { name: values.name.trim(), icon: values.icon });
            setEditing(null);
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="icon" noStyle>
              <IconSelect />
            </Form.Item>
            <Form.Item name="name" style={{ flex: 1 }} rules={[{ required: true, whitespace: true, message: 'Nhập tên không gian' }]}>
              <Input maxLength={40} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
