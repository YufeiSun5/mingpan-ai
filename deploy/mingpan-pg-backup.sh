#!/bin/sh
# 每日 pg_dump（自定义格式，已压缩），保留最近 7 份
set -eu
DIR=/var/backups/mingpan-pg
F="$DIR/mingpan-$(date +%Y%m%d-%H%M).dump"
docker exec mingpan-pg pg_dump -U mingpan -d mingpan -Fc > "$F.tmp" && mv "$F.tmp" "$F"
chmod 600 "$F"
ls -1t "$DIR"/mingpan-*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "$(date '+%F %T') backup ok $(du -h "$F" | cut -f1) $F"
# 恢复：docker exec -i mingpan-pg pg_restore -U mingpan -d mingpan --clean < 备份文件
