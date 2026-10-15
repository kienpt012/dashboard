import { LockOutlined } from '@ant-design/icons';
import { App, Avatar, Button, Card, Col, Descriptions, Form, Input, Row, Typography } from 'antd';
import { localityTitle, useLocality } from '@/app/locality';
import { useMe } from '@/app/session';
import { Page } from '@/components/Page';
import { errorText, http, session } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { initials, isGlobal, roleLabel } from '@/lib/roles';
import type { CurrentUser } from '@/types/auth';
import { STRONG_PASSWORD, STRONG_PASSWORD_RULE } from '../auth/ForgotPassword';

export default function Profile() {
  const user = useMe();
  const locality = useLocality();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ currentPassword: string; newPassword: string; confirm: string }>();

  async function change(values: { currentPassword: string; newPassword: string }) {
    try {
      const result = await http.post<{ accessToken: string; user: CurrentUser }>('/auth/change-password', { currentPassword: values.currentPassword, newPassword: values.newPassword });
      session.set(result.accessToken, result.user);
      form.resetFields();
      message.success('Đã đổi mật khẩu; các phiên đăng nhập khác đã bị thu hồi');
    } catch (error) {
      message.error(errorText(error, 'Không đổi được mật khẩu'));
    }
  }

  const title = localityTitle(locality);
  const scope = isGlobal(user) ? (locality.configured ? `Toàn ${title.charAt(0).toLocaleLowerCase('vi')}${title.slice(1)}` : 'Toàn địa phương') : user.department?.name ?? 'Chưa gán phòng ban';

  return (
    <Page title="Hồ sơ cá nhân">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card style={{ height: '100%' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
              <Avatar size={56} className="user-avatar" style={{ fontSize: 20 }}>
                {initials(user.fullName)}
              </Avatar>
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {user.fullName}
                </Typography.Title>
                <Typography.Text type="secondary">{user.username}</Typography.Text>
              </div>
            </div>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                { label: 'Vai trò', children: roleLabel[user.role] },
                { label: 'Chức vụ', children: user.position || '—' },
                { label: 'Phạm vi', children: scope },
                { label: 'Email công vụ', children: user.email || '—' },
                { label: 'Đăng nhập gần nhất', children: dateTime(user.lastLoginAt) },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Đổi mật khẩu" style={{ height: '100%' }}>
            <Form form={form} layout="vertical" requiredMark={false} onFinish={values => void change(values)} style={{ maxWidth: 420 }}>
              <Form.Item name="currentPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}>
                <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
              </Form.Item>
              <Form.Item
                name="newPassword"
                label="Mật khẩu mới"
                extra={STRONG_PASSWORD_RULE}
                dependencies={['currentPassword']}
                rules={[
                  { required: true, message: 'Nhập mật khẩu mới' },
                  { pattern: STRONG_PASSWORD, message: 'Mật khẩu chưa đủ mạnh' },
                  ({ getFieldValue }) => ({ validator: (_, value) => (!value || value !== getFieldValue('currentPassword') ? Promise.resolve() : Promise.reject(new Error('Phải khác mật khẩu hiện tại'))) }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="confirm"
                label="Nhập lại mật khẩu mới"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: 'Nhập lại mật khẩu' },
                  ({ getFieldValue }) => ({ validator: (_, value) => (!value || value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Chưa khớp'))) }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit">
                Đổi mật khẩu
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </Page>
  );
}
