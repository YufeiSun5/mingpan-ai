// 轻量 .env 加载（不依赖 dotenv）。已存在的系统环境变量优先；支持 ${VAR} 引用系统环境变量。
import * as fs from 'fs';
import * as path from 'path';
try {
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    const v = m[2].replace(/^["']|["']$/g, '').replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] || '');
    if (v !== '') process.env[m[1]] = v;
  }
} catch {}
