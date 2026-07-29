# Triển khai production trên VPS

Kiến trúc production dùng Nginx trên máy chủ làm reverse proxy công khai, trong khi web, API,
PostgreSQL và Ollama chỉ giao tiếp qua loopback hoặc mạng nội bộ Docker:

```text
Internet :80/:443 -> Nginx host -> 127.0.0.1:8080 -> web -> api:3000 -> PostgreSQL
                                                        -> Ollama trên Docker bridge
```

## Cấu trúc thư mục máy chủ

```text
/opt/ioc-laithieu/
  shared/.env          # bí mật production, không nằm trong Git
  releases/<git-sha>/  # từng bản phát hành bất biến
  current              # liên kết đến bản đã qua healthcheck gần nhất
  backups/             # pg_dump trước migration, giữ 14 ngày
```

`deploy/ioc-deploy` nhận đúng SHA và tệp phát hành tương ứng, khóa chống hai lượt triển khai chạy
đồng thời, sao lưu PostgreSQL, build image, chạy migration, chờ healthcheck và kiểm tra model Ollama.
Nếu bản mới lỗi, script cố gắng dựng lại bản `current`; tuyệt đối không xóa volume PostgreSQL.
Migration production phải tương thích tiến (additive/forward-compatible). Rollback ứng dụng không tự đảo
ngược schema hoặc dữ liệu; khi migration gây lỗi dữ liệu, quản trị viên phải khôi phục thủ công từ bản
`pg_dump` gần nhất sau khi xác nhận phạm vi ảnh hưởng.

## Bí mật và biến GitHub Actions

Repository secrets:

- `VPS_SSH_PRIVATE_KEY`: khóa Ed25519 của tài khoản triển khai riêng.
- `VPS_KNOWN_HOSTS`: SSH host key đã được xác minh của VPS.

Repository variables:

- `VPS_HOST`
- `VPS_PORT`
- `VPS_USER`

Các khóa ứng dụng như `POSTGRES_PASSWORD`, `JWT_SECRET`, `PASSWORD_RESET_PEPPER` và SMTP chỉ đặt
trong `/opt/ioc-laithieu/shared/.env` với quyền `600`. Không đưa chúng vào GitHub hoặc source.
Tham khảo cấu trúc tại `deploy/production.env.example`.

## Quy trình CI/CD

Mỗi pull request và mỗi push lên `main` đều chạy cài dependency, sinh Prisma Client, toàn bộ unit
test và production build. Riêng push lên `main`, sau khi CI đạt, job production sẽ:

1. Đóng gói chính xác commit hiện tại, không kèm `.env`, dependency hay thư mục làm việc cục bộ.
2. Tải release lên VPS bằng SSH key.
3. Gọi script triển khai cố định do `root` sở hữu.
4. Chỉ báo thành công khi web, API, database và model trích xuất đều sẵn sàng.

Runner cố định sẽ từ chối release nếu nội dung `deploy/ioc-deploy` trong Git khác bản đã được `root`
cài tại `/usr/local/sbin/ioc-deploy`. Cơ chế này ngăn khóa CI tự thay mã có quyền root; khi runner thay
đổi, quản trị viên phải rà soát và cài bản mới trên VPS trước khi cho phép job production chạy.

SMTP có thể để trống trong giai đoạn nghiệm thu IP. Khi trỏ tên miền, cập nhật `PUBLIC_APP_URL`,
`CORS_ORIGINS`, cấu hình SMTP và cấp TLS trước khi dùng tài khoản quản trị trong vận hành thật.

## Kiểm tra sau triển khai

```bash
curl --fail http://127.0.0.1:8080/api/health
docker compose --project-name ioc-laithieu \
  --env-file /opt/ioc-laithieu/shared/.env \
  --file /opt/ioc-laithieu/current/docker-compose.yml ps
systemctl status nginx ollama --no-pager
```
