#!/bin/sh
# 构建镜像并仅重建 mingpan-ai 容器（127.0.0.1:3080 → 容器 8080，加入 mingpan-net）
set -eu
cd "$(dirname "$0")/.."
docker build -t mingpan-ai:latest .
docker rm -f mingpan-ai >/dev/null 2>&1 || true
docker run -d --name mingpan-ai --restart unless-stopped --network mingpan-net \
  -p 127.0.0.1:3080:8080 --env-file /etc/mingpan-ai/mingpan.env -e PORT=8080 \
  --memory 384m --log-opt max-size=10m --log-opt max-file=3 mingpan-ai:latest
for i in $(seq 1 20); do curl -fsS http://127.0.0.1:3080/api/health && break; sleep 1; done
