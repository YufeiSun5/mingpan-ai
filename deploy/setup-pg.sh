#!/bin/sh
# 在服务器上以 root 运行：创建专用 PostgreSQL 容器 mingpan-pg（私有网络，不暴露端口，低内存调优）。
# 不触碰其他项目的 postgres。幂等：已存在则跳过。
set -eu
ENV=/etc/mingpan-ai/mingpan.env
docker network inspect mingpan-net >/dev/null 2>&1 || docker network create mingpan-net
mkdir -p /var/lib/mingpan-pg /var/backups/mingpan-pg && chmod 700 /var/backups/mingpan-pg
if ! grep -q '^PG_PASSWORD=' "$ENV"; then
  PW=$(openssl rand -hex 24)
  { echo "PG_PASSWORD=$PW"; echo "DATABASE_URL=postgres://mingpan:$PW@mingpan-pg:5432/mingpan"; } >> "$ENV"
fi
grep -q '^SESSION_SECRET=' "$ENV" || echo "SESSION_SECRET=$(openssl rand -hex 32)" >> "$ENV"
grep -q '^ADMIN_TOKEN=' "$ENV" || echo "ADMIN_TOKEN=$(openssl rand -hex 24)" >> "$ENV"
chown root:root "$ENV"; chmod 600 "$ENV"
PW=$(grep '^PG_PASSWORD=' "$ENV" | cut -d= -f2)
if ! docker ps -a --format '{{.Names}}' | grep -qx mingpan-pg; then
  printf 'POSTGRES_USER=mingpan\nPOSTGRES_DB=mingpan\nPOSTGRES_PASSWORD=%s\n' "$PW" > /etc/mingpan-ai/pg.env && chmod 600 /etc/mingpan-ai/pg.env
  docker run -d --name mingpan-pg --network mingpan-net --restart unless-stopped \
    --memory 160m --memory-swap 320m --shm-size 64m \
    --env-file /etc/mingpan-ai/pg.env \
    -v /var/lib/mingpan-pg:/var/lib/postgresql/data \
    --log-opt max-size=10m --log-opt max-file=3 \
    postgres:16-alpine \
    -c shared_buffers=32MB -c max_connections=20 -c work_mem=2MB -c maintenance_work_mem=16MB \
    -c effective_cache_size=96MB -c wal_buffers=1MB -c max_wal_size=256MB -c min_wal_size=32MB \
    -c autovacuum_max_workers=1 -c max_worker_processes=2 -c max_parallel_workers=0 -c max_parallel_workers_per_gather=0
fi
for i in $(seq 1 30); do docker exec mingpan-pg pg_isready -U mingpan -d mingpan >/dev/null 2>&1 && break; sleep 1; done
docker exec mingpan-pg pg_isready -U mingpan -d mingpan
install -m 755 "$(dirname "$0")/mingpan-pg-backup.sh" /usr/local/bin/mingpan-pg-backup.sh
printf '# mingpan-ai：每日 04:17 备份 mingpan-pg，保留 7 份\n17 4 * * * root /usr/local/bin/mingpan-pg-backup.sh >> /var/log/mingpan-pg-backup.log 2>&1\n' > /etc/cron.d/mingpan-pg-backup
chmod 644 /etc/cron.d/mingpan-pg-backup
echo "mingpan-pg ready"
