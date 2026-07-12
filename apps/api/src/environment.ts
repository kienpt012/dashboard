export function requireJwtSecret(value?: string): string {
  const secret = value?.trim();
  if (!secret || secret.length < 32 || secret === 'change-this-secret-in-production' || secret.startsWith('replace-')) {
    throw new Error('JWT_SECRET phải là chuỗi bí mật ngẫu nhiên có ít nhất 32 ký tự');
  }
  return secret;
}
