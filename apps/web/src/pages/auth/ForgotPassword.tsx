import { Alert, Button, Form, Input, Result, Steps } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorText, http, session } from '@/lib/api';
import { AuthShell } from './AuthShell';

export const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/;
export const STRONG_PASSWORD_RULE = 'Tối thiểu 10 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt';

type Stage = 0 | 1 | 2 | 3;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>(0);
  const [identifier, setIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function run(task: () => Promise<void>) {
    setLoading(true);
    setError('');
    try {
      await task();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }

  const request = (value: string) =>
    run(async () => {
      const result = await http.post<{ message: string; expiresInMinutes: number }>('/auth/password-reset/request', { identifier: value.trim() });
      setIdentifier(value.trim());
      setNotice(result.message);
      setCooldown(60);
      setStage(1);
    });

  const verify = (otp: string) =>
    run(async () => {
      const result = await http.post<{ resetToken: string; expiresInMinutes: number }>('/auth/password-reset/verify', { identifier, otp: otp.trim() });
      setResetToken(result.resetToken);
      setNotice(`Đặt mật khẩu mới trong ${result.expiresInMinutes} phút`);
      setStage(2);
    });

  const complete = (newPassword: string) =>
    run(async () => {
      const result = await http.post<{ message: string }>('/auth/password-reset/complete', { resetToken, newPassword });
      session.clear();
      setNotice(result.message);
      setStage(3);
    });

  return (
    <AuthShell title="Khôi phục mật khẩu">
      <Steps size="small" current={stage} style={{ marginBottom: 24 }} items={[{ title: 'Tài khoản' }, { title: 'Mã xác thực' }, { title: 'Mật khẩu mới' }]} />
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      {notice && stage > 0 && stage < 3 && !error && <Alert type="info" title={notice} showIcon style={{ marginBottom: 16 }} />}

      {stage === 0 && (
        <Form layout="vertical" size="large" requiredMark={false} onFinish={({ identifier: value }) => void request(value)}>
          <Form.Item name="identifier" label="Tên đăng nhập hoặc email công vụ" rules={[{ required: true, message: 'Nhập tên đăng nhập hoặc email' }]}>
            <Input autoComplete="username" autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Gửi mã xác thực
          </Button>
        </Form>
      )}

      {stage === 1 && (
        <Form layout="vertical" size="large" requiredMark={false} onFinish={({ otp }) => void verify(otp)}>
          <Form.Item name="otp" label="Mã xác thực" rules={[{ required: true, pattern: /^\d{6}$/, message: 'Mã gồm 6 chữ số' }]}>
            <Input.OTP length={6} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Xác thực
          </Button>
          <Button type="link" block disabled={cooldown > 0 || loading} onClick={() => void request(identifier)} style={{ marginTop: 8 }}>
            {cooldown > 0 ? `Gửi lại mã sau ${cooldown} giây` : 'Gửi lại mã'}
          </Button>
        </Form>
      )}

      {stage === 2 && (
        <Form layout="vertical" size="large" requiredMark={false} onFinish={({ password }) => void complete(password)}>
          <Form.Item name="password" label="Mật khẩu mới" extra={STRONG_PASSWORD_RULE} rules={[{ required: true, pattern: STRONG_PASSWORD, message: 'Mật khẩu chưa đủ mạnh' }]}>
            <Input.Password autoComplete="new-password" autoFocus />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Nhập lại mật khẩu"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Nhập lại mật khẩu' },
              ({ getFieldValue }) => ({
                validator: (_, value) => (!value || value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu nhập lại chưa khớp'))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Đặt mật khẩu
          </Button>
        </Form>
      )}

      {stage === 3 && (
        <Result
          status="success"
          title="Đã đặt lại mật khẩu"
          subTitle={notice}
          extra={
            <Button type="primary" onClick={() => navigate('/admin/login', { replace: true })}>
              Đăng nhập
            </Button>
          }
        />
      )}

      {stage < 3 && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <Link to="/admin/login">Quay lại đăng nhập</Link>
        </div>
      )}
    </AuthShell>
  );
}
