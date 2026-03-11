# ZYM MVP 功能文档（2026-03-11）

## 1) 当前结论
- 结论：`Web + iOS + Server` 已达到当前定义的 `MVP production-ready` 目标。
- 验证方式：完成真实端到端测试（双账号注册登录、好友、群聊、@agent、图片/视频媒体分析、会话与安全边界）。
- 验证日期：`2026-03-11`（America/New_York）。

## 2) 已实现功能（跨端对齐）

### 2.1 账号与会话
- 用户注册/登录（JWT）。
- Refresh Token 刷新。
- 多会话管理（查看、撤销单设备会话）。
- 撤销后 token 与 WS 认证立即失效。

### 2.2 教练机器人（zj / lc）
- 登录后可选择教练人格：
- `zj`：鼓励型、委婉。
- `lc`：严格、直接。
- 群聊中支持 `@coach`、`@zj`、`@lc` 触发回复。
- 支持后续切换教练。

### 2.3 聊天与社交
- 私聊（DM）创建与收发。
- 群组创建、拉人、群消息。
- Inbox 聚合（coach / dms / groups）。
- 提及通知（mentions）与已读状态。
- WebSocket 实时认证、订阅、typing、消息推送。

### 2.4 媒体能力（图片/视频/文件）
- 聊天支持媒体上传（图片、视频等）。
- 上传后媒体可在 agent 对话中作为上下文参与分析。
- 媒体索引与分析产物落盘（用于可追踪与复查）。
- 视频分析链路支持帧提取路径（ffmpeg/ffprobe）并有回退处理。

### 2.5 Coach 核心能力（Skill-based + Typed Tools）
- 主路径已从 bash 脚本迁移到 `typed tools`（schema 化工具调用）。
- 已接入工具：
- `get_context`
- `get_profile`
- `set_profile`
- `list_recent_media`
- `inspect_media`
- `log_meal`
- `log_training`
- `search_knowledge`
- profile 写入后自动计算 `BMR/TDEE/daily_target`。
- meal / training 写入日记账（daily 结构化数据）。

### 2.6 社区功能
- 发帖（feed）。
- 点赞与评论。
- 好友关系建立（申请/接受）。
- 个人资料页（头像/信息/bio 等）。

### 2.7 健康与排行榜
- 健康数据同步接口（steps/calories）。
- 好友排行榜读取。
- iOS/Web 页面已打通对应数据展示链路。

### 2.8 Web UI 与 iOS UI
- iOS 维持现有较好视觉风格并补齐功能页链路。
- Web 完成组件化与视觉打磨，减少“模块方块感”：
- 新增会话项/媒体预览组件。
- 全局视觉 token、圆角与卡片层次优化。
- 亮色化方向与品牌一致性增强。

## 3) Agent 安全与防护（重点）

### 3.1 工具边界
- Agent 仅可发起严格 schema 的工具调用。
- 写操作经后端 typed tool 服务执行（而非 agent 任意写文件）。
- 读写权限由策略层控制（含只读场景下写工具禁用）。
- 兼容 legacy bash 工具，但默认非主路径，需显式开关。

### 3.2 知识库与防幻觉
- 新增向量知识检索工具 `search_knowledge`。
- 专业问题可先做知识检索再回答，降低 hallucination。
- 知识 ingestion 增加治理链路：
- request（待审）
- 风险标记（注入/超长等）
- admin review（approve/reject）
- apply（入库 + 审计 + 可选向量 upsert）

### 3.3 对话与媒体安全
- API gateway / auth middleware 统一鉴权与边界检查。
- 撤销会话 token 在 HTTP 与 WS 双通道都可拦截。
- 媒体 URL 与下载/分析流程加入安全约束（避免任意地址滥用）。

## 4) 数据与存储策略
- 长期数据：`profile.json` 等用户核心档案。
- 日志类数据：`daily.json`（餐食、训练等）。
- 媒体与分析：上传媒体索引 + 分析产物（可配置清理周期）。
- 知识治理：ingestion 请求与审计记录入库（SQLite）。

## 5) 真实测试结果（本次最终验收）

### 5.1 执行命令
- `cd server && npm run build`
- `cd server && npm run check:agent-security`
- `cd server && node scripts/e2e-real-check.mjs`
- `cd web && npm run build`
- `cd ios && xcodebuild -project ZYM.xcodeproj -scheme ZYM -sdk iphonesimulator -configuration Debug build`

### 5.2 结果
- `server build`：通过。
- `agent security check`：通过。
- `real e2e`：通过。
- `web build`：通过。
- `ios build`：通过。

### 5.3 E2E 覆盖到的核心行为
- 双账号真实注册登录。
- 会话刷新、会话撤销、撤销后 token/WS 失效。
- 加好友、私聊、未读/已读。
- 发帖、评论、点赞、提及通知。
- 建群、拉人、`@coach` 与 `@lc` 群聊回复。
- 直接 coach 对话写 profile / log meal。
- 图片上传并触发 agent 分析。
- 视频上传并触发 agent 分析。
- 健康数据同步与排行榜。
- WebSocket typing + message 实时事件。

## 6) 当前 MVP 边界与下一阶段建议
- 当前已满足“社区 + 教练对话 + 媒体分析 + 双端可用 + 安全基线”的 MVP 定义。
- 下一阶段可优先做：
- iOS HealthKit 原生自动同步全链路（权限引导、后台同步、异常重试）。
- 向量库运营台（文档分版本、回滚、评估集与召回质量报表）。
- 社交增长能力（邀请裂变、群运营工具、内容推荐与审核策略细化）。
