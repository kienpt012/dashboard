import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Form, Input } from 'antd';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '@/app/session';
import { errorText, http, session } from '@/lib/api';
import type { CurrentUser } from '@/types/auth';
import { AuthShell } from './AuthShell';

function safeNext(value: string | null) {
  if (!value || value.startsWith('//')) return '/admin';
  if (!(value === '/admin' || value.startsWith('/admin/')) || value.startsWith('/admin/login')) return '/admin';
  return value;
}

export default function Login() {
  const user = useUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user && session.token) return <Navigate to={safeNext(params.get('next'))} replace />;

  async function submit(values: { username: string; password: string }) {
    setLoading(true);
    setError('');
    try {
      const data = await http.post<{ accessToken: string; user: CurrentUser }>('/auth/login', { username: values.username.trim(), password: values.password });
      session.set(data.accessToken, data.user);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (reason) {
      setError(errorText(reason, 'Không đăng nhập được'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Đăng nhập">
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 20 }} />}
      <Form layout="vertical" size="large" requiredMark={false} onFinish={submit} onValuesChange={() => setError('')}>
        <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
          <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
        </Form.Item>
        <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
        </Form.Item>
        <Flex justify="flex-end" style={{ marginTop: -8, marginBottom: 20 }}>
          <Link to="/admin/forgot-password">Quên mật khẩu?</Link>
        </Flex>
        <Button type="primary" htmlType="submit" block loading={loading}>
          Đăng nhập
        </Button>
      </Form>
    </AuthShell>
  );
}
