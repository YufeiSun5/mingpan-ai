# mingpan-ai · 生辰八字排盘 + AI 命理解读

给小红书命理服务用的**手机聊天式**网页（像微信和"玄真大师"聊天）：

1. 大师打招呼，客户用自然语言发生辰，如「95年农历八月十五早上8点 女 成都，想问感情」；
2. 大模型只负责**提取信息**（JSON），缺什么追问什么，齐全后列出信息让客户**确认**；
3. 服务端用万年历**精确排盘**（干支绝不交给大模型算），在聊天里发一张命盘卡片；
4. 大模型按"老师的文风"**流式**写详批（命局总论 / 过往验证 / 所问之事 / 未来运势 / 开运建议，每节一个气泡）；
5. 客户继续追问（"我明年能结婚吗""2019年是不是不顺"），大师基于已排好的命盘 + 流年数据回答（追问里提到的年份会自动补算流年）。

对话记录、待确认信息和命盘资料保存在浏览器 localStorage，每次请求带上最近的对话，服务端无状态（适合云函数）。

- 排盘：[`lunar-javascript`](https://github.com/6tail/lunar-javascript)（6tail 寿星万年历），结果确定、可复现；支持公历/农历（含闰月）、精确时间/时辰/不清楚时辰、常用城市真太阳时校正。
- 解读：配置了 `MIMO_API_KEY` 时默认用**小米 MiMo `mimo-v2.6-flash`**（MiMo 当前最强模型），否则默认 **DeepSeek**；可切换 **通义千问（DashScope）**、**Gemini**、任意 **OpenAI 兼容接口**；**未配置 Key 时自动使用内置模板生成器**，演示也能完整出结果。
- 文风：`style/style-guide.md`（语气规则）+ `style/examples/`（往期解读范例，作为 few-shot 注入提示词）。把老师的真实解读放进去，AI 就会模仿她的口吻。
- 部署：既能 `node server.js` 一体运行，也能拆成「静态前端 + 云函数」。

> 页面底部有"仅供娱乐参考"免责声明，请保留。

## 目录

```
public/            聊天前端（index.html / style.css / app.js / config.js / terms.html / robots.txt / manifest / assets/）
lib/security.js    安全响应头（CSP、HSTS 等）
lib/chat.js        聊天流程：提取 → 确认 → 排盘 → 流式详批 → 追问
lib/parse.js       规则版出生信息解析（无 Key 时兜底）
lib/bazi.js        排盘（四柱、十神、五行旺衰、喜用神、大运、流年、刑冲合）
lib/cities.js      城市经度表（真太阳时）
lib/prompt.js      组装提示词（读取 prompts/ 与 style/）
lib/llm.js         大模型调用层（deepseek / qwen / gemini / openai 兼容）
lib/fallback.js    无 Key 时的模板解读
lib/handler.js     与平台无关的业务入口
prompts/reading.md     ★ 首次详批提示词（可直接改措辞）
prompts/chat.md        ★ 追问对答提示词
prompts/extract.md     出生信息提取提示词（输出 JSON）
prompts/style-draft.md 起草文风指南用的提示词
style/style-guide.md   ★ 文风指南
style/examples/        ★ 往期解读范例（.md/.txt，按文件名排序取前 3 篇）
scripts/draft-style-guide.js  从聊天记录/解读文本自动起草文风指南
scripts/test-charts.js        排盘正确性自测
scripts/screenshot.js         聊天界面手机截图（走真实后端，顺带检查外部请求/CSP 报错）
scripts/make-icons.js         由 SVG 生成 PNG 图标与 og 分享图
scripts/chat-demo.js          端到端聊天演示，输出 samples/chat-transcript.md
scripts/gen-samples.js        生成两份样例详批到 samples/
functions/cloudbase/   腾讯云 CloudBase 云函数入口
functions/aliyun-fc/   阿里云函数计算（事件函数）入口
server.js / Dockerfile 一体化运行 / 容器部署（云托管、FC Web 函数）
```

## 本地运行

```bash
npm install
cp .env.example .env     # 填入 DEEPSEEK_API_KEY（不填则用模板解读）
npm start                # 打开 http://localhost:3000
npm test                 # 排盘自测（4 个已知命例）
```

## 接口
- `POST /api/chat`（主接口，SSE 流式）：请求 `{ messages:[{role,content}], pending, profile, action }`；事件 `text`（整条气泡）、`delta`（流式片段）、`bubble`（开始新一段流式回答）、`chart`（命盘数据）、`pending`（待确认信息）、`profile`（已确认资料）、`quick`（快捷回复）、`done`、`error`。
- 云函数不支持 SSE 时，同一接口返回 `{ events:[[event,data],...] }`，前端自动逐条回放（体验上是一次性出现）。想要真正的流式效果，请用「云托管」或「FC Web 函数」运行 `server.js`。
- `POST /api/reading`、`POST /api/chart`：旧的表单式接口，保留可用。

## 配置大模型

在 `.env` 或云平台「环境变量」里设置：

| 提供方 | 变量 | 默认模型 |
|---|---|---|
| 小米 MiMo（有 Key 时默认） | `LLM_PROVIDER=mimo` `MIMO_API_KEY=sk-...` | `mimo-v2.6-flash`（`MIMO_MODEL`；`mimo-v2.6-flash` 更快更便宜；`MIMO_THINKING=enabled` 开启深度思考） |
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
   会生成 `style/style-guide.draft.md`（自动把手机号打码），人工检查修改后改名为 `style/style-guide.md` 即生效。
3. **改提示词结构**：直接编辑 `prompts/reading.md`（五个小标题、字数、禁忌都在里面）。改完无需重新构建，重启服务即可（云函数需重新上传）。

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
