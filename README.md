# mingpan-ai · 生辰八字排盘 + AI 命理解读

给小红书命理服务用的**手机聊天式**网页（像微信和"玄真大师"聊天）：

1. 大师打招呼，客户用自然语言发生辰，如「95年农历八月十五早上8点 女 成都，想问感情」；
2. 大模型只负责**提取信息**（JSON），缺什么追问什么，齐全后列出信息让客户**确认**；
3. 服务端用万年历**精确排盘**（干支绝不交给大模型算），在聊天里发一张命盘卡片；
4. 大模型按"老师的文风"**流式**写详批（命局总论 / 过往验证 / 所问之事 / 未来运势 / 开运建议，每节一个气泡）；
5. 客户继续追问（"我明年能结婚吗""2019年是不是不顺"），大师基于已排好的命盘 + 流年数据回答（追问里提到的年份会自动补算流年）。

每次回答前，先给出一张**评分卡**：问题健康度（0–100，过度/不健康/不道德的诉求给低分）+ 3–5 个维度（事业/财运/感情/健康/人际/学业）的命盘评分。维度**基准分由程序依据排盘确定性计算**（喜用/忌神 × 流年/大运干支、十神、刑冲合），大模型只能在 ±8 内微调，所以同一命盘多次提问结果一致。诉求明显过度或命盘不支持时，大师会明确说"不行"，并给出具体的八字理由与建设性的替代方向；涉及疾病一律建议遵医嘱；出现自伤/轻生信号时不算命，直接给出心理援助热线（400-161-9995 / 12356）。

服务端有**匿名账户与长期记忆**（PostgreSQL）：出生信息、命盘、对话、结构化事实（自述经历/偏好/问答要点）、对话滚动摘要、长期印象；每用户硬上限 128k tokens，超限时按"已摘要原文 → 最旧摘要并入长期印象 → 问答记录 → 最旧原文"顺序压缩，出生信息与命盘摘要永不删除。

- 排盘：[`lunar-javascript`](https://github.com/6tail/lunar-javascript)（6tail 寿星万年历），支持公历/农历（含闰月）、精确时间/时辰/不清楚时辰、常用城市真太阳时校正。专业盘：主星/副星、藏干十神、星运（十二长生）、自坐、空亡、纳音、神煞（天乙/太极/文昌/天德/月德贵人、禄神、羊刃、金舆、桃花、驿马、华盖、将星、红鸾、天喜、魁罡、空亡）、天干五合/冲、地支六合/三合/半合/三会/六冲/刑/害/破、旺相休囚死、日主旺衰、格局、用喜忌仇闲、命宫/身宫/胎元/胎息、起运/交运。
- 解读：默认**小米 MiMo `mimo-v2.6-pro`（关闭深度思考）**；可切换 DeepSeek / 通义 / Gemini / 任意 OpenAI 兼容接口；未配置 Key 时自动用内置模板。
- 文风：`apps/server/style/style-guide.md` + `apps/server/style/examples/`（真人口吻、少表情）。

> 页面底部有"仅供娱乐参考"免责声明，请保留。

## 目录（npm workspaces 单仓）

```
packages/core/        平台无关（无 DOM / Node 专属 API），Web、小程序、服务端共用
  src/bazi.ts pro.ts    排盘引擎 + 专业盘（神煞、干支关系、格局、宫位…）
  src/score.ts          问题健康度规则 + 维度确定性基准分 + 评分卡校验
  src/parse.ts fallback.ts cities.ts
  src/types.ts          共享类型（Chart / ScoreCard / ChatEvent …）
  src/client.ts sse.ts  API 客户端（传输层可插拔：fetch 流 / wx.request）+ 增量 SSE 解析
  src/chatState.ts text.ts  聊天状态机（纯函数）、气泡切分、轻量 Markdown 块
  src/browser.ts        前端轻量入口（不含排盘引擎）
apps/server/          TypeScript 后端（Express）
  src/server.ts         路由：/api/v1/*（Bearer token）、旧版 /api/chat 兼容、静态托管 apps/web/dist
  src/chat.ts           聊天流程：危机识别 → 提取 → 确认 → 排盘 → 评分卡 + 流式详批 → 追问
  src/memory.ts         记忆：事实 / 滚动摘要 / 长期印象 / 128k 预算 / 上下文组装
  src/store/            存储接口 + PostgreSQL 实现（pg.ts，含迁移）+ 内存实现（开发用）
  src/identity.ts       匿名签名 token（Cookie + Authorization 头）、管理员鉴权
  src/llm.ts prompt.ts security.ts ratelimit.ts
  prompts/  style/      提示词与文风
apps/web/             React + TypeScript + Vite（构建为同源静态资源，无外部 CDN，严格 CSP）
  src/hooks/            useChat（数据逻辑）、useSmartScroll（智能滚动）
  src/components/       纯展示组件：Chat / ChartCard / ScoreCard / Composer …
deploy/               服务器部署脚本（Postgres 容器、备份 cron）
scripts/              排盘自测、截图、演示
functions/            云函数入口（旧，需先 npm run build）
```

## 本地运行

```bash
npm install
cp .env.example .env     # MIMO_API_KEY；可选 DATABASE_URL（不填则用内存存储）、SESSION_SECRET、ADMIN_TOKEN
npm run build            # core → server → web
npm start                # http://localhost:3000
npm run dev -w @mingpan/web   # 前端热更新（代理 /api 到 3000）
npm test                 # 排盘自测
```

## 接口（v1）

鉴权：`POST /api/v1/session` 返回 `{ uid, token }`；之后在请求头带 `Authorization: Bearer <token>`（Web 同时写 HttpOnly Cookie；小程序不依赖 Cookie）。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/chat` | SSE 流式。请求 `{ cid, messages, pending, profile, nowYear, ui }`（`ui:'card'` 时信息齐全只返回 `pending`，由前端确认卡片调用 `/api/v1/profiles`；`profileId` 指定当前命主。已排盘后服务端识别：更正生辰 → `pending.correction`（预填更正卡片，按钮走 PATCH）；想看另一个人 → `pending.newPerson`（带称呼的新卡片）或 `switch`（已有档案）；合盘 → `compat` 事件 + 解读）；事件 `text/delta/bubble/chart/pending/profile/switch/compat/quick/crisis/error/done` |
| POST | `/api/v1/chat?stream=0` | 非流式：一次返回 `{ events: [[event, data], …] }` |
| POST | `/api/v1/chat?mode=poll` → GET `/api/v1/jobs/:id?after=n`（别名 `/api/v1/chat/jobs/:id`） | 轮询模式（小程序 `wx.request` 不支持流式时）：返回增量事件、`next`、`done` |
| POST | `/api/v1/conversations` | 添加命主 / 新对话：返回 `{ cid }` |
| GET | `/api/v1/conversations/:cid/messages` | 对话原文（换设备、切换命主时重建聊天记录；不含 system 事件） |
| GET | `/api/v1/profiles` | 命主列表：`{ id, label（我/老公/妈妈…）, name, data, cid（该命主的对话）, version, bazi }` |
| GET | `/api/v1/profiles/:id` | 命主详情：生辰、按当前年份重排的命盘、历史版本 |
| GET | `/api/v1/profiles/:id/versions` | 生辰历史版本（更正前的旧盘，保留用于对比） |
| DELETE | `/api/v1/profiles/:id` | 删除命主（连同其对话与记忆） |
| POST | `/api/v1/compat` | 合盘：`{ a, b, question, cid }`（两位命主 id），SSE / `?stream=0` / `?mode=poll`；两人关系（日干合冲生克、年支生肖与日支夫妻宫的合冲刑害、五行互补）由程序计算 |
| POST | `/api/v1/profiles` | 确认生辰（软件操作，不是聊天消息）：`{ profile（含 label）, cid, nowYear }` → 校验（含大小月 / 闰月）+ 排盘 + 建档 → `{ profile:{…,id,label}, chart, intro, cid, switched }`；当前对话已属于别的命主时为新命主单独开对话（`switched:true` 与新 `cid`）；校验失败 422 `{ error }`。服务端在对话记忆里记一条 system 事件「用户确认了生辰信息：…」 |
| PATCH | `/api/v1/profiles/:id` | `{ profile }` 更正生辰：重排、记一个历史版本，返回 `{ …, recast, version, previous, intro }`，intro 含程序计算的新旧盘差异（四柱 / 日主 / 格局 / 喜用 / 大运）；旧盘结论在记忆里标记作废。`{ label, name }` 只改称呼不重排 |
| POST | `/api/v1/profiles/:id/reading` | 详批流式：`{ cid, nowYear, messages, recast }`；SSE / `?stream=0` / `?mode=poll`，事件同 chat |
| POST | `/api/v1/auth/wechat` | 小程序登录占位：`{ code }` → code2session → 绑定用户（需 `WECHAT_APPID/SECRET`） |
| GET / DELETE | `/api/v1/me` | 我的数据概览 / 删除我的全部数据 |
| GET | `/api/v1/me/export` | 下载我的全部数据（JSON） |
| POST | `/api/v1/me/migrate` | 旧版浏览器本地历史迁移到服务端（首次访问自动调用） |
| GET / DELETE | `/api/v1/admin/users[/:id]` | 管理（`Authorization: Bearer $ADMIN_TOKEN`；未配置时 404） |
| GET | `/api/health` | 健康检查 |

## 小程序规划（暂未开发）

- **框架**：推荐 **Taro（React）**。`packages/core` 无 DOM/Node 依赖，可直接复用排盘、评分、状态机与 API 客户端；Web 端的展示组件只收数据和回调，迁移时把 `div/span` 换成 Taro 的 `View/Text`，`useChat` 换一个 `wx.request` 传输层即可。
- **传输**：基础库支持时用 `wx.request({ enableChunked: true })` + `onChunkReceived` 喂给 `SSEParser`；否则用 `?mode=poll` 轮询或 `?stream=0` 一次性返回。
- **登录**：`wx.login` 拿 `code` → `POST /api/v1/auth/wechat`（服务端 code2session 换 openid，已留接口）→ 返回 token，存 `wx.setStorageSync`，请求头带 `Authorization`。
- **类目与审核风险**：命理/算命类内容在微信小程序属于**高风险、通常不予通过**的类目（"占卜、算命、风水"被明确限制）。建议定位为"传统文化 / 国学知识 / 万年历工具"，弱化"算命"字样，突出排盘工具与文化科普；AI 生成内容还需按《生成式人工智能服务管理暂行办法》做算法备案/安全评估，或接入已备案的大模型服务并在页面标注"AI 生成"。主体需企业资质，个人主体能选的类目很有限。

## 配置大模型

在 `.env` 或云平台「环境变量」里设置：

| 提供方 | 变量 | 默认模型 |
|---|---|---|
| 小米 MiMo（有 Key 时默认） | `LLM_PROVIDER=mimo` `MIMO_API_KEY=sk-...` | `mimo-v2.6-pro`（`MIMO_MODEL`；`mimo-v2.6-flash` 更快更便宜；`MIMO_THINKING=enabled` 开启深度思考） |
| DeepSeek（无 MiMo Key 时默认） | `LLM_PROVIDER=deepseek` `DEEPSEEK_API_KEY=sk-...` | `deepseek-chat`（`DEEPSEEK_MODEL` 可改） |
| 通义千问 | `LLM_PROVIDER=qwen` `DASHSCOPE_API_KEY=sk-...` | `qwen-plus`（`QWEN_MODEL`） |
| Gemini | `LLM_PROVIDER=gemini` `GEMINI_API_KEY=...` | `gemini-2.5-flash`（`GEMINI_MODEL`；`GEMINI_BASE_URL` 可填反代） |
| 其他兼容接口 | `LLM_PROVIDER=openai` `LLM_BASE_URL` `LLM_API_KEY` `LLM_MODEL` | —（Kimi、智谱、硅基流动等） |

- MiMo Key：<https://platform.xiaomimimo.com>（接口 `https://api.xiaomimimo.com/v1`，OpenAI 兼容）。`.env` 里可以写 `MIMO_API_KEY=${MIMO_API_KEY}` 引用系统环境变量，Key 不进仓库。
- DeepSeek Key：<https://platform.deepseek.com> ；通义 Key：阿里云「百炼」控制台。
- **Gemini 在中国大陆服务器无法直连**：要么部署到海外/香港，要么设置 `GEMINI_BASE_URL` 指向你自己的代理；大陆部署建议直接用 DeepSeek 或通义。
- 调用失败时自动回退到模板解读，页面不会报错（右下角会显示"模板解读"）。
- 其他：`LLM_TEMPERATURE`（默认 0.9）、`LLM_TIMEOUT_MS`（默认 60000）、`STYLE_MAX_EXAMPLES`（默认 3）。

## 调整文风（模仿老师的口吻）

1. **放范例**：把老师写过的满意解读，每篇存成一个 `.md` 或 `.txt` 放进 `style/examples/`（删掉客户真实姓名、生日等隐私）。按文件名排序，默认取前 3 篇注入提示词（篇数越多越贵、越慢，3 篇左右最合适）。可以删掉自带的两篇示例。
2. **起草文风指南**：把她的聊天记录/解读导出成 txt 放到一个文件夹，然后：
   ```bash
   npm run draft-style -- ./我的聊天记录
   ```
   会生成 `apps/server/style/style-guide.draft.md`（自动把手机号打码），人工检查修改后改名为 `apps/server/style/style-guide.md` 即生效。
3. **改提示词结构**：直接编辑 `apps/server/prompts/reading.md`（五个小标题、字数、禁忌都在里面）。改完无需重新构建，重启服务即可（云函数需重新上传）。

## 部署

### 方案 A：海外 / 香港（最简单，Gemini 也可直连）
任意支持 Node 的平台：Render、Railway、Fly.io、Vercel（需把 server.js 改为 serverless）、香港轻量服务器等，`npm start` 即可。缺点：大陆访问速度一般，部分平台默认域名在大陆可能不稳定。

### 方案 B：中国大陆（推荐，用 DeepSeek / 通义）

**1. 腾讯云 CloudBase（云开发）**
- 2026 年起每个账号可开 1 个**免费体验环境**（3000 资源点/月，每次可续 6 个月；不支持按量付费，超额会受限）。正式运营建议升级个人版（¥19.9/月，限时价，以官方为准）。
- 做法一（推荐，前后端分离）：
  1. 「静态网站托管」上传 `public/` 目录；
  2. 新建云函数（Node 18+），把整个项目（含 `node_modules`、`lib/`、`prompts/`、`style/`）打包上传，入口 `functions/cloudbase/index.main`，超时调到 60 秒；在函数配置里添加环境变量 `DEEPSEEK_API_KEY`；
  3. 「HTTP 访问服务」给函数绑定路径（如 `/bazi`）；
  4. 修改 `public/config.js`：`window.API_BASE = 'https://<环境默认域名>/bazi'`（前端会请求 `/bazi/api/chat`），重新上传。注意：静态托管平台不会带上 `lib/security.js` 的安全头，如需要可在平台的「自定义响应头」里配置同样的 CSP；若前端仍由 `server.js` 提供而 API 在别的域名，设置 `CSP_CONNECT_SRC=https://api域名`，API 端设置 `CORS_ORIGIN=前端域名`。
- 做法二：「云托管」直接用项目里的 `Dockerfile` 部署（监听 80 端口），前后端一体。注意云托管按 CPU/内存用量扣资源点，免费体验环境额度有限。

**2. 阿里云函数计算 FC 3.0**
- 新用户可领试用额度：每月 15 万 CU，连续 3 个月（需实名，超出部分按量计费，以官方为准）。
- 最省事：创建「**Web 函数**」，运行时 Node.js 20，启动命令 `node server.js`，监听端口 `9000`（代码会自动读取 `FC_SERVER_PORT`/`PORT`），上传整个项目目录（含 `node_modules`），超时 60 秒，配置环境变量 `DEEPSEEK_API_KEY`。前后端一体，无需改 `config.js`。
- 也可用「事件函数 + HTTP 触发器」，handler 为 `functions/aliyun-fc/index.handler`，前端放 OSS 静态网站。

### 关于 ICP 备案与域名
- 在大陆服务器上**绑定自己的域名**，必须先做 **ICP 备案**（个人可备案，约 1～3 周；需有该云厂商的备案资源，部分厂商要求购买一定时长的服务器）。另外，个人备案网站一般不允许经营性内容，"付费算命"属于敏感类目，审核时网站内容和名称请保守描述（如"传统文化/生肖星座科普"）。
- **不想备案的替代方案**：
  1. 直接使用平台提供的**默认域名**（CloudBase 环境默认域名、FC 自带的测试域名）。注意：阿里云 FC 默认域名在浏览器访问时可能被强制下载而非打开网页，建议走 CloudBase 默认域名，或只把 FC 当 API、前端放 CloudBase 静态托管；默认域名可能有频率限制，不适合大流量。
  2. 做成**微信小程序**（小程序本身无需网站备案，但需小程序备案和类目审核；**占卜/算命类目通常不能过审**，需包装成"传统文化/娱乐测试"，有被下架风险）。CloudBase 与小程序是同一套后端，`lib/` 可直接复用。
  3. 部署在**香港/海外**服务器，无需备案（方案 A），速度略慢。
- 小红书站内直接放外链容易被限流，常见做法是在私信里发链接、或做成图片里的二维码。

## 接口保护
- 按 IP 限流（`/api/chat`、`/api/reading`）：`RATE_LIMIT_PER_MIN`（默认 8 次/分钟）、`RATE_LIMIT_PER_DAY`（默认 100 次/天），超出返回 429。内存计数，单实例有效；多实例部署建议再加网关限流。
- 请求体上限：`MAX_BODY_BYTES`（默认 64KB，含对话历史），超出返回 413；服务端只取最近 20 条消息，单条用户消息截断到 500 字。
- 默认 `trust proxy = 1`（信任一跳代理，隧道/网关后也能拿到真实 IP）；直接暴露公网且无代理时可设 `TRUST_PROXY=false`。

## 样例
`samples/` 下：两份真实大模型详批（含排盘数据、耗时和 token 用量，`node scripts/gen-samples.js`），以及一段完整聊天记录 `chat-transcript.md`（`node scripts/chat-demo.js`）。

## 如何降低被微信 / 小红书 / 浏览器拦截的概率

**代码层面已做的（只能"减分"，不能保证不被拦）：**
- 所有资源同源：无外部 CDN、无第三方字体（标题字体为自托管的思源宋体子集 `public/assets/xz-display.woff2`，约 73KB，SIL OFL 授权）、无统计/广告/追踪代码、无 Cookie；头像、图标、纹理均为自制 SVG / 内联数据。
- 安全响应头（`lib/security.js`）：CSP（`default-src 'self'`、禁止内联脚本、`frame-ancestors 'none'`）、`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、`Permissions-Policy`；HTTPS 下自动加 HSTS。SSE 流式不受影响。
- 页面元信息齐全：charset、viewport、title、description、theme-color、favicon、apple-touch-icon、manifest、og 分享图；有 `robots.txt` 和《用户协议与隐私说明》（`terms.html`）。
- 措辞：标题与界面用"玄真 · 国学命理 / 传统文化 · 生辰解读"，避免"算命"等敏感词，保留"仅供娱乐参考"免责声明。
- 无弹窗、无跳转、JS 未混淆；默认 `trust proxy = 1`，限流按真实客户端 IP 计算。

**真正决定会不会被拦的（代码管不了）：**
1. **不要用 trycloudflare 随机域名对外**：`*.trycloudflare.com` 是公共免费隧道域名，常被微信/小红书标记为风险或直接拦截，而且从大陆访问不稳定、重启即换地址。只适合自己测试。
2. **正式做法：备案域名 + HTTPS + 国内云**。在腾讯云 / 阿里云买域名、完成 ICP 备案，部署到 CloudBase / 云托管 / 函数计算并绑定该域名，开启 HTTPS 证书（两家都有免费 DV 证书）。备案域名 + 国内机房，是微信内能正常打开的前提。
3. **被微信拦了就申诉**：微信打开显示"已停止访问该网页"时，可在微信的"网址安全检测/申诉"入口（腾讯安全中心 / 拦截页底部的申诉链接）提交说明。页面内容保持"传统文化、娱乐参考"的定位更容易通过。
4. **小红书限制外链**：笔记正文、评论里放链接会被折叠、限流甚至违规处理。建议把入口放在**主页简介 / 私信**里，或做成**微信小程序**，在笔记里引导"私信获取"。
5. 内容审核层面：命理/占卜类在各平台都属敏感类目，宣传文案避免"改命、转运、灵验、保证"等承诺性词语。

## 已知限制
- 旺衰/喜用神使用简化的"扶抑法"打分（天干 + 藏干权重 × 月令系数），对从格、化气格等特殊格局不做判断；需要更精细的可在 `lib/bazi.js` 调整。
- 子时采用"晚子时日柱不换日"（lunar-javascript sect=2）。选"时辰"时按该时辰起点（如辰时=08:00）排盘，不做真太阳时校正；真太阳时仅在"准确时间 + 能识别城市"时生效（内置约 50 个城市）。
- 填写出生城市会做真太阳时校正（如成都早上 8:00 → 约 06:59，卯时）；临近时辰边界时，时柱会因此变化，确认信息时可提醒客户。
- 大模型首次详批约 30～50 秒（流式输出，第一个字几秒内出现），追问约 10 秒。
- 过往验证是基于流年十神与刑冲合的**概率性描述**，并非真实事件，措辞已刻意保持弹性。
- 无用户系统、无支付、服务端不存储对话；限流为单实例内存计数。
