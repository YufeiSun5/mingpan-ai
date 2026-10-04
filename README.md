# mingpan-ai · 生辰八字排盘 + AI 命理解读

给小红书命理服务用的手机网页：客户自己填写生辰 → 程序**精确排盘**（四柱、十神、五行、纳音、大运、流年）→ 大模型按"老师的文风"写一份解读（命局总论 / 过往验证 / 所问之事 / 未来运势 / 开运建议）。

- 排盘：[`lunar-javascript`](https://github.com/6tail/lunar-javascript)（6tail 寿星万年历），结果确定、可复现；支持公历/农历（含闰月）、精确时间/时辰/不清楚时辰、常用城市真太阳时校正。
- 解读：默认 **DeepSeek**，可切换 **通义千问（DashScope）**、**Gemini**、任意 **OpenAI 兼容接口**；**未配置 Key 时自动使用内置模板生成器**，演示也能完整出结果。
- 文风：`style/style-guide.md`（语气规则）+ `style/examples/`（往期解读范例，作为 few-shot 注入提示词）。把老师的真实解读放进去，AI 就会模仿她的口吻。
- 部署：既能 `node server.js` 一体运行，也能拆成「静态前端 + 云函数」。

> 页面底部有"仅供娱乐参考"免责声明，请保留。

## 目录

```
public/            前端（index.html / style.css / app.js / config.js）
lib/bazi.js        排盘（四柱、十神、五行旺衰、喜用神、大运、流年、刑冲合）
lib/cities.js      城市经度表（真太阳时）
lib/prompt.js      组装提示词（读取 prompts/ 与 style/）
lib/llm.js         大模型调用层（deepseek / qwen / gemini / openai 兼容）
lib/fallback.js    无 Key 时的模板解读
lib/handler.js     与平台无关的业务入口
prompts/reading.md     ★ 解读提示词模板（可直接改措辞）
prompts/style-draft.md 起草文风指南用的提示词
style/style-guide.md   ★ 文风指南
style/examples/        ★ 往期解读范例（.md/.txt，按文件名排序取前 3 篇）
scripts/draft-style-guide.js  从聊天记录/解读文本自动起草文风指南
scripts/test-charts.js        排盘正确性自测
scripts/screenshot.js         手机视口截图
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

## 配置大模型

在 `.env` 或云平台「环境变量」里设置：

| 提供方 | 变量 | 默认模型 |
|---|---|---|
| DeepSeek（默认） | `LLM_PROVIDER=deepseek` `DEEPSEEK_API_KEY=sk-...` | `deepseek-chat`（`DEEPSEEK_MODEL` 可改） |
| 通义千问 | `LLM_PROVIDER=qwen` `DASHSCOPE_API_KEY=sk-...` | `qwen-plus`（`QWEN_MODEL`） |
| Gemini | `LLM_PROVIDER=gemini` `GEMINI_API_KEY=...` | `gemini-2.5-flash`（`GEMINI_MODEL`；`GEMINI_BASE_URL` 可填反代） |
| 其他兼容接口 | `LLM_PROVIDER=openai` `LLM_BASE_URL` `LLM_API_KEY` `LLM_MODEL` | —（Kimi、智谱、硅基流动等） |

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
  4. 修改 `public/config.js`：`window.API_BASE = 'https://<环境默认域名>/bazi'`（前端会请求 `/bazi/api/reading`），重新上传。
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

## 已知限制
- 旺衰/喜用神使用简化的"扶抑法"打分（天干 + 藏干权重 × 月令系数），对从格、化气格等特殊格局不做判断；需要更精细的可在 `lib/bazi.js` 调整。
- 子时采用"晚子时日柱不换日"（lunar-javascript sect=2）。选"时辰"时按该时辰起点（如辰时=08:00）排盘，不做真太阳时校正；真太阳时仅在"准确时间 + 能识别城市"时生效（内置约 50 个城市）。
- 过往验证是基于流年十神与刑冲合的**概率性描述**，并非真实事件，措辞已刻意保持弹性。
- 无用户系统、无支付、无数据存储；生产环境建议加接口限流（防止 Key 被刷）。
