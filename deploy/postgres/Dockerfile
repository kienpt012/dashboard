# PostgreSQL 17 (Alpine, giữ nguyên image gốc của volume hiện có) + pgvector cho B13–B14 (tìm chỉ tiêu gần nhất).
# Biên dịch pgvector ngay trên image Alpine thay vì đổi sang pgvector/pgvector (Debian): đổi musl sang glibc làm
# sai thứ tự sắp xếp của index trên volume cũ (xem docs/DEPLOYMENT.md), còn cách này không đụng tới dữ liệu.
FROM postgres:17-alpine

ARG PGVECTOR_VERSION=v0.8.7
RUN apk add --no-cache --virtual .build-deps git build-base \
 && git clone --depth 1 --branch "$PGVECTOR_VERSION" https://github.com/pgvector/pgvector.git /tmp/pgvector \
 && cd /tmp/pgvector \
 && make OPTFLAGS="" with_llvm=no \
 && make install with_llvm=no \
 && cd / && rm -rf /tmp/pgvector \
 && apk del .build-deps
