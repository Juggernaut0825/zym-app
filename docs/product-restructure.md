# ZYM 产品重构文档

日期：2026-05-08
范围：ZYM iOS + Web + Server 产品骨架重构建议
目标：把 ZYM 从“AI 健身聊天 + 社交功能集合”收窄成一个更容易被用户理解、持续使用、愿意付费的日常健身 accountability 产品。

---

## 1. 一句话结论

ZYM 现在最大的问题不是 AI 能力不够，而是产品入口和用户承诺不够尖锐。

当前产品在代码和文档里的形态更像：

> social fitness app first, AI coach inside the network

但更有机会成立的形态应该是：

> AI accountability coach for gym beginners: ZYM remembers your meals, workouts, goals, and friends, then tells you exactly what to do next.

中文表达：

> ZYM 是给健身新手的 AI 执行型教练。它每天记住你吃了什么、练了什么、状态如何，并结合朋友监督告诉你下一步该做什么。

ZYM 不应该继续被用户理解成“健身版 ChatGPT”。ChatGPT/Gemini 能回答健身问题，但 ZYM 应该帮助用户实际坚持训练、记录饮食、复盘进度、被朋友和 coach 推着走。

---

## 2. 当前仓库里的产品事实

### 2.1 当前产品骨架

从仓库看，ZYM 是一个完整的三端产品：

- `web/`：Next.js 主产品界面。
- `ios/`：SwiftUI iOS 客户端。
- `server/`：Express API、WebSocket、AI coach runtime、worker、scheduler。

`README.md` 写的核心功能包括：

- Auth + coach selection
- Coach chat
- DM + group chat
- Media upload
- Friends, feed, reactions
- Health sync + friends leaderboard
- Profile editing

`docs/architecture.md` 明确写了当前产品模型：

> social app first, AI coach inside the network

这和现在页面结构一致。Web 主界面 tab 是：

- `Message`
- `Community`
- `Calendar`
- `Profile`

iOS 主 tab 是：

- `Chats`
- `Community`
- `Calendar`
- `Profile`

也就是说，用户第一眼看到的是聊天和社区，而不是“今天我应该做什么”。

### 2.2 当前隐藏得比较深的强能力

ZYM 的强能力其实已经在后端和工具层里出现了：

1. Coach typed tools
   位置：`server/src/agent/skills/coach/coach-skill.md`

   已有工具包括：

   - `get_profile`
   - `set_profile`
   - `log_check_in`
   - `log_meal`
   - `log_training`
   - `inspect_media`
   - `search_knowledge`
   - `search_message_history`
   - `get_media_analyses`

2. 日常记录能力
   位置：`server/src/services/coach-typed-tools-service.ts`

   已有数据文件和逻辑：

   - `profile.json`
   - `daily.json`
   - meal records
   - training records
   - check-in records
   - weight/body-fat progress summary

3. 训练计划能力已经有雏形
   位置：`server/src/services/coach-typed-tools-service.ts`

   已经有：

   - `getTrainingPlan`
   - `setTrainingPlan`
   - `toggleTrainingPlanExerciseCompletion`
   - `training-plan.json`

   但这些能力还没有真正被工具 registry 和主 UI 产品化。

4. Proactive coach outreach
   位置：`server/src/services/coach-outreach-scheduler.ts`

   已有触发：

   - onboarding outreach
   - inactivity outreach
   - progress check-in nudge
   - nightly check-in

   这说明 ZYM 已经不只是被动聊天机器人，有成为“主动教练”的基础。

5. Social 和 Health 已有基础设施
   位置：`server/src/database/schema.sql`

   已有：

   - friendships
   - groups
   - group members
   - messages
   - posts
   - reactions
   - health data
   - leaderboard

### 2.3 当前缺的不是能力，而是产品编排

现在的问题是：强能力分散在 Chat、Calendar、Profile、后台 scheduler 里，用户没有一个清晰的 daily loop。

用户打开 ZYM 后，最应该立刻感受到：

> ZYM 知道我是谁，知道我昨天做了什么，知道我今天该做什么。

但当前入口更像：

> 这里有聊天、社区、日历、资料，你自己探索一下。

这对早期 tester 可以接受，但对真实用户留存很危险。

---

## 3. 核心产品问题

### 3.1 用户无法快速回答“为什么不用 ChatGPT？”

如果用户只是想问：

- 今天练胸怎么练？
- 减脂怎么吃？
- 这顿饭健康吗？
- 深蹲姿势对吗？

ChatGPT/Gemini 都可以回答，而且品牌更强、模型更强、用户已经安装。

ZYM 不能赢在“更聪明的回答”。ZYM 要赢在：

- 不用重新解释上下文。
- 不用写 prompt。
- 每天有默认计划。
- 自动记住 meal/workout/status/progress。
- 第二天会基于昨天调整。
- 朋友和 coach 形成监督压力。
- 训练和饮食记录能回到一个明确的 progress loop。

ZYM 的竞争点不是 answer，而是 behavior change。

### 3.2 当前首页不是 aha moment

当前主入口是 `Message`。聊天是重要交互方式，但不应该是产品的全部。

健身 beginner 的核心痛点通常不是“不会问 AI”，而是：

- 我不知道今天练什么。
- 我不知道这顿饭算不算符合目标。
- 我不知道我有没有进步。
- 我不想手动规划。
- 我坚持不下来。
- 我需要有人管我。

所以用户进入 ZYM 的第一屏应该直接回答：

> 今天我该做什么？

而不是给他一个空白聊天窗口。

### 3.3 Social 目前偏泛

现在的 social 能力包括：

- add friend
- nearby user search
- username search
- DM
- group chat
- feed
- reactions

这些功能本身不是差异化。用户已经有 Instagram、iMessage、Discord、Snap、微信。

ZYM 的 social 应该是 fitness-specific accountability：

- 我和朋友一起 7 天 gym challenge。
- LC 每晚点名没打卡的人。
- ZJ 给完成 streak 的人鼓励。
- Group 里自动生成 weekly recap。
- 朋友看到的是 workout/meal/plan completion 状态，不是普通朋友圈。

也就是说，ZYM 不该做普通 social graph，而要做 accountability graph。

### 3.4 Calendar 现在像后台记录，不像行动系统

Calendar/CoachRecordsPanel 已经能展示：

- meals
- training
- status records
- health
- progress

但这个页面更像记录后台。用户需要的是：

> 根据这些记录，我今天应该怎么做？

Calendar 应该变成 Progress/History，而 Today 应该消费它的数据。

---

## 4. 新定位

### 4.1 目标用户

建议先收窄到：

> college gym beginners

原因：

- 他们想练，但不知道怎么安排。
- 他们有校园 gym 场景。
- 他们饮食乱，但愿意拍照。
- 他们有朋友和群体压力。
- 他们不一定愿意请真人私教。
- 他们对 AI coach 接受度高。
- 他们的 social/accountability 场景天然存在。

早期不要同时服务：

- 专业健美运动员
- 中老年康复用户
- 医疗/伤病用户
- 家庭健身用户
- 所有减脂用户

这些方向都可能成立，但会让产品承诺变散。

### 4.2 核心用户承诺

英文：

> Open ZYM for 30 seconds and know what to do today.

更完整版本：

> ZYM helps gym beginners stay consistent with training and nutrition through AI coaches, simple daily plans, meal/workout memory, and friend accountability.

中文：

> 打开 ZYM 30 秒，你就知道今天练什么、吃什么要注意、要不要恢复，以及朋友有没有跟你一起坚持。

### 4.3 不建议继续主打的定位

不建议主打：

> AI-native health / fitness & social app

问题：

- 太泛。
- 听起来像功能集合。
- 用户不知道为什么今天要打开。
- 和 ChatGPT wrapper 的距离太近。

也不建议主打：

> personalized AI coach

这个已经太容易被复制，也太容易被用户理解成聊天机器人。

---

## 5. 新产品骨架：Daily Action Loop

ZYM 应该围绕一个每日行动闭环重构，而不是围绕一个显式的 daily check-in 表单重构。

这里要特别小心：用户已经有足够多 app 要求他们填东西。ZYM 的优势应该是：

> 用户随便告诉 coach 一句话、发一张饭图、点一下完成训练，系统就自然更新记录和建议。

所以产品闭环不是 “每天填 check-in”，而是：

1. Today Plan
   ZYM 根据用户目标、experience level、训练历史、饮食记录、Health 数据和最近互动，给今日动作。

2. Natural Input
   用户用最低摩擦输入，但入口主要是 Message 或 Today 上的轻量 CTA：

   - “我今天有点累”
   - “这是我的午餐”
   - “我练完了”
   - “今天没去 gym”
   - meal photo
   - workout video
   - weight/body-fat update
   - “把刚才那条训练记录改一下”

3. Coach Adjustment
   ZJ/LC 不是只回答问题，而是更新已有记录、修改计划、解释原因，并调整下一步建议。

4. Accountability
   朋友、group、challenge 看到完成状态。这里不是普通聊天社交，而是让朋友关系服务于坚持。

5. Weekly Recap
   ZYM 总结这一周：

   - training consistency
   - meals logged
   - plan completion
   - progress trend
   - next week focus

### 5.1 产品心智变化

从：

> 我打开 ZYM 去问 AI 问题。

变成：

> 我打开 ZYM 看今天要做什么；需要调整时，直接跟 coach 说。

这个心智是留存的关键。

### 5.2 不做独立 Check-In 的原因

独立 check-in 听起来很完整，但对新用户会有压力：

- 用户不知道自己该填多少。
- energy、sleep、soreness、weight、notes 同时出现会像任务清单。
- 如果用户本来只是想问 “今天练什么”，被先要求填状态，会打断动机。

更好的处理方式：

- Today 上只保留必要行动，不放一个 “Check in” 模块。
- 用户想说累、酸、没睡好，就直接发给 coach。
- Coach 在需要时追问一个问题，而不是让用户填完整表。
- Progress 里可以保留体重、状态、训练、饮食历史，但不把它包装成每日必做任务。

---

## 6. 信息架构重构

### 6.1 当前 IA

当前 Web/iOS 主 tab：

- Message
- Community
- Calendar
- Profile

问题：

- `Message` 把 ZYM 拉向聊天 app。
- `Community` 把 ZYM 拉向普通 social feed。
- `Calendar` 太像记录后台。
- `Profile` 承担太多设置、身份、coach 管理。

### 6.2 推荐 IA

建议主 tab 改成：

1. Today
2. Message
3. Community
4. Progress

Profile 放到右上角头像或 settings。

#### Today

产品核心首页。回答：

- 今天该练什么？
- 今天饮食目标是什么？
- 我昨天/本周做得怎样？
- 我现在只需要点哪个按钮？

#### Message

保留当前 chatting box 的产品形态，不要推翻。

Message 应该包含：

- ZJ/LC coach 对话
- friend DM
- group chat
- add friend / username search / nearby user search
- media analysis
- ask anything
- explain or modify today plan
- log or update records by conversation

区别是：Message 不再是整个产品的首页，而是 coach 和社交的自然输入层。

#### Community

不建议现在把 Community 强行改名为 Crew。你们现有用户已经理解 “community / friend / group” 的结构，而且当前产品还有加好友、聊天、群聊这些资产。

但 Community 的产品重点要从泛 feed 转向 accountability：

包含：

- friends
- groups
- challenges
- shared goals
- friend completion status
- group coach recap

Feed 可以保留，但降级成 Community 里的一个模块，不做第一优先级。

#### Progress

替代 Calendar。

包含：

- calendar records
- weight/body-fat trend
- meals
- training
- Health sync
- weekly recap

### 6.3 低成本过渡版本

如果不想一次大改，可以先做：

- 把 `Calendar` 改名为 `Progress`
- 新增 `Today` 为默认首页
- 保留 `Message` 和 `Community` 命名
- Profile 收到头像/settings

短期 tab：

- Today
- Message
- Community
- Progress

---

## 7. Today 页面设计

Today 是重构里最重要的页面。

### 7.1 Today 页面目标

用户打开 ZYM 后，30 秒内完成一个动作：

- start workout
- log meal
- ask/tell coach
- join/complete challenge

Today 不是 dashboard 大杂烩，也不是 coach greeting 的容器。它应该是一个很安静、很清晰的执行页：

> 今天做什么，做完了吗，需要调整就去 Message 说。

### 7.2 Today 页面结构

建议第一版只包含 4 个核心区域。区域数量要克制，视觉上尽量少卡片化，避免看起来像 AI 模板页。

#### 1. Quiet Status Header

Today 顶部不要放 coach 的一句 greeting。

原因：

- 每次打开都出现一句话，容易像 chatbot welcome。
- 如果文案泛，会削弱产品质感。
- 真正主动的 coach message 更适合 scheduled job 发到 Message。

Today 顶部只需要安静显示：

- today date
- current focus
- plan status
- small progress indicator

#### 2. Today Training

状态分三种：

1. 有今日计划
   显示：

   - training split
   - estimated duration
   - exercises
   - start button
   - modify button

2. 没有计划但有足够 profile
   显示：

   - “Generate today plan”
   - 可选时长：30 / 45 / 60 min
   - 可选地点：gym / home

3. profile 不足
   显示：

   - “Tell ZYM your goal”
   - “How many days/week can you train?”
   - “What is your experience level?”

#### 3. Food / Meal Check

主动作：

- Add meal photo
- Describe meal
- View today's intake

展示：

- protein estimate
- calories estimate
- target vs current
- uncertainty note

关键是不要让用户觉得这是复杂 calorie tracker。早期可以只做：

> Good / okay / needs adjustment

而不是逼用户精确记录每克。

#### 4. Community Accountability

显示：

- current challenge
- friend completion status
- who missed yesterday
- coach group nudge

MVP 不需要复杂 feed，只需要一个明确的 “we are doing this together”。

#### 5. Progress Snapshot

显示：

- this week workouts
- meals logged
- plan completion
- streak
- next weekly recap date

这个区域要小，不要把 Today 变成完整 Progress 页。它只负责给用户一个 “我这周有没有在动” 的信号。

#### 6. Ask Coach / Adjust

Today 可以有一个很轻的入口：

- Ask coach
- Modify today plan
- Tell coach I am tired
- Log what I just did

这些动作进入 Message，不在 Today 上展开成表单。

### 7.3 Today 的空状态

空状态非常重要。不要写：

> No data yet.

应该写：

> Tell ZYM your goal and experience level. Your first plan will be ready today.

或者：

> Not sure what to train? Ask LC for a 40-minute plan.

### 7.4 视觉风格原则

Today 必须延续当前 ZYM 的简洁风：

- 少卡片，少装饰，少 dashboard 小组件。
- 使用清晰分区、细分割线、留白和明确按钮。
- 不做 nested cards。
- 不做大面积渐变和花哨插画。
- 主按钮只保留一个明显动作。
- secondary actions 用小按钮或图标按钮。
- 文字短，避免解释型长文案。

可以有小 UI delight，但要非常克制。

建议做一个完成目标后的轻动画：

- 用户完成今日训练或 challenge 后，页面角落出现一个小奖杯。
- 奖杯不要用 emoji，自己用 Canvas/SVG 画。
- 动画 1-2 秒即可，例如描边出现、轻微 bounce、金属高光扫过。
- 动画结束后不占据布局，不打断用户。
- iOS 可用 SwiftUI Shape/Canvas 复刻同一视觉。

这个小奖杯可以成为 ZYM 的轻量奖励语言，比随便撒 confetti 更成熟。

---

## 8. Message / Coach Chat 重构

### 8.1 保留 Message，不推翻聊天形态

现阶段不应该把 Message 全部推翻。你们已经有 coach 对话、DM、group、friend search，这些都是真实资产。

更合理的改法是：

> Today 成为默认首页，Message 成为 AI-native input layer。

也就是说，用户仍然可以在聊天框里完成大部分事情，只是系统把聊天结果同步到 Today 和 Progress。

### 8.2 Chat 的新角色

Chat 不再是整个产品，但仍然是用户修改、解释、补充、记录的主要入口。

用户可以继续自由输入：

- “今天不知道练什么”
- “这顿饭怎么样”
- “帮我记录刚才练了 bench”
- “看一下我 squat form”

但 Chat 应该和 Today/Progress 双向同步。

### 8.3 Chat 必须显示“记录已写入或已更新”

当 coach 调用：

- `log_meal`
- `log_training`
- `update_meal_record`
- `update_training_record`

前端应该有明确 UI feedback：

> Meal saved to Today

> Training logged: Bench Press, 3x8

> Training updated: Bench Press weight changed to 135 lb

这会强化：

> 这不是普通聊天，这是真的在管理我的健身记录。

### 8.4 Chat 默认 prompt 不要泛

当前聊天输入可以支持任意内容，但首屏建议给 action chips：

- What should I train today?
- Log my meal
- Check this form
- I missed yesterday
- Make this easier
- Push me harder

不同 coach 可以不同：

ZJ：

- Help me restart today
- Make my plan manageable
- Review my meal gently

LC：

- Call me out
- No excuses plan
- Tighten today's food

### 8.5 AI 修改记录不能 duplicate

现在一个明显的 tester 问题是：

> 用户让 AI coach 改 training record，系统会 duplicate 出几个 item，而不是修改原来的。

这不是 UI 小问题，而是产品信任问题。用户一旦看到记录被写乱，会觉得 coach “不可靠”。

从当前后端看，records 已经有 meal/training update endpoint，但 coach tools 更偏 append：

- `log_meal`
- `log_training`

所以 AI 很容易在 “把刚才那个训练改一下” 的语义下继续 append。

需要新增或暴露：

- `list_recent_meal_records`
- `list_recent_training_records`
- `update_meal_record`
- `update_training_record`
- `delete_meal_record`
- `delete_training_record`
- `merge_duplicate_records`

并在 coach prompt 里写硬规则：

- 用户说 “改 / edit / fix / actually / 我刚刚说错了” 时，优先更新已有 record。
- 只有用户明确说 “新吃了 / 新练了 / add another” 时才 append。
- 更新前如果缺 record id，先查最近记录或追问。
- 回复里明确说明更新了哪一条。

Progress 页面也应该能把 record id 带进 Message，例如用户点某条训练旁边的 “Ask coach to edit”，Message 自动带上下文。

### 8.6 第二天 aha moment

ZYM 必须刻意制造“它记得我”的时刻。

示例：

用户第一天：

> 我今天练了腿，吃了 Chipotle。

第二天 Today：

> 昨天你练了腿，今天做 upper body。Chipotle 那顿蛋白还可以，但碳水偏高，今天午餐优先 lean protein + vegetables。

这比单次回答更重要。

### 8.7 Scheduled Coach Messaging

Coach 的一句 greeting 不应该放在 Today 顶部，而应该变成 scheduled job 发到 Message。

当前系统已经有 coach outreach scheduler，这是好基础。建议把策略改成：

1. Morning greeting
   如果用户前一天有 interaction、meal record、training record、plan completion 或 meaningful progress，第二天早上 8 点左右按用户本地时区发一条 coach message。

   这条消息要具体，不要泛：

   > Yesterday you logged legs. Today I would keep lower body light and hit upper body for 40 minutes.

2. Weekly inactivity nudge
   如果用户过去 7 天都没有 progress/record/coach interaction，不要每天催。把催促放到 weekly progress job 里，每周一次即可。

   示例：

   > I did not see any training or meal records this week. Want a simple 3-day restart plan?

3. Daily no-interaction nag 默认关闭
   每天无互动就催会很快变烦。除非用户加入 challenge 或主动开启 stricter LC reminders，否则不要 daily nag。

4. Dedupe and quiet hours
   同一天同一 coach 不重复发 outreach。遵守用户本地 quiet hours。用户当天已经主动打开 Message 或 Today 后，不再补发同类 greeting。

这样 ZJ/LC 的存在感来自 “及时、具体、有记忆”，不是来自每次打开页面都说一句欢迎语。

---

## 9. Training Plan 产品化

### 9.1 当前机会

后端已经有训练计划服务：

- `getTrainingPlan`
- `setTrainingPlan`
- `toggleTrainingPlanExerciseCompletion`

但它没有成为主产品能力。

这是最应该优先产品化的地方，因为它直接回答：

> 今天练什么？

### 9.2 推荐新增后端/工具能力

把已有 service 暴露成 typed tools 和 API：

Typed tools：

- `get_training_plan`
- `set_training_plan`
- `complete_training_plan_exercise`
- `search_exercise_library`

API：

- `GET /coach/training-plan/:userId?day=YYYY-MM-DD`
- `POST /coach/training-plan`
- `POST /coach/training-plan/exercise/complete`

### 9.3 Today Training MVP

第一版不要追求 Fitbod 级别的完整算法。先做到：

- 基于 goal + training_days + experience_level + recent training 生成今日训练。
- 每个 exercise 有 sets/reps/rest/cue。
- 用户可以一键完成。
- 完成后写入 daily training record。
- 第二天 coach 会避开过度重复训练。

### 9.4 训练计划生成原则

早期规则：

- beginner 优先全身或 upper/lower 简单 split。
- 不要给太多动作。
- 默认 4-6 个动作。
- 优先 machine/dumbbell/barbell 基础动作。
- 用户没说器械时，不要假设很完整。
- 用户 soreness/heavy fatigue 时，自动调整 volume。

### 9.5 训练计划 UI 文案

不要说：

> AI-generated optimized workout

可以说：

> Today's plan

> Built from your goal, experience level, and recent training.

更用户化。

---

## 10. Meal/Food Tracking 重构

### 10.1 当前机会

ZYM 已支持：

- media upload
- food image inspection
- meal logging
- daily intake total

但用户心智不应该是“我要精确记账”，而是：

> 我想知道这顿饭会不会影响我的目标。

### 10.2 Meal Photo 的产品承诺

建议主打：

> Snap a meal. ZYM tells you if it fits today's goal.

中文：

> 拍一下这顿饭，ZYM 告诉你今天要怎么调整。

### 10.3 不要过早用图片限制做付费墙

图片/视频是 ZYM 的 aha 入口。免费版如果太早限制，用户可能还没体验到价值就流失。

更好的方式：

- Free：每天/每周给足够的 meal/photo 使用次数，让用户形成习惯。
- Premium：无限、历史趋势、weekly report、form check、long-term memory。

### 10.4 Meal tracking MVP

第一版重点不要是精确 macro，而是 action：

- likely high protein / low protein
- calorie range
- what to adjust next meal
- whether it fits cut/bulk/maintain
- save to daily record

示例：

> This is probably okay for a bulk day, but light on vegetables. If dinner is similar, keep rice smaller and add lean protein.

---

## 11. Community 重构为 Accountability

### 11.1 不建议现在强行改名

上一版建议把 Community 改成 Crew，但结合当前产品现实，短期不建议这么做。

原因：

- 你们已经有 Community、friend search、DM、group chat 的产品资产。
- 改名会制造额外解释成本。
- 用户不一定理解 Crew，但能理解 Community。
- 真正需要改的是 Community 的默认内容和行为，而不是名字本身。

所以策略是：

> 保留 Community 命名，把里面的核心模块从 feed/social consumption 转成 accountability。

### 11.2 MVP accountability 模型

新增概念：

- Challenge
- Daily commitment
- Completion status
- Community recap

最小 challenge：

> 7-day consistency challenge

字段：

- title
- start_date
- end_date
- goal_type: workouts / meals / steps / plan_completion
- target_per_week 或 target_per_day
- coach_id
- members

每天每人完成状态：

- completed
- missed
- partial
- note
- logged_at

### 11.3 推荐数据库表

可以新增：

```sql
CREATE TABLE challenges (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id BIGINT REFERENCES groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  goal_type TEXT NOT NULL,
  target_count INTEGER NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  coach_id TEXT NOT NULL DEFAULT 'zj',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE challenge_members (
  challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (challenge_id, user_id)
);

CREATE TABLE challenge_completions (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_day DATE NOT NULL,
  status TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, user_id, local_day)
);
```

### 11.4 Coach 在 group 里的角色

现在 group 里已有 `coach_enabled` 和 `@coach` 触发能力。

下一步应该让 coach 自动参与 accountability：

- challenge 期间的 group recap。
- 点名未完成的人。
- 鼓励完成 streak 的人。
- 根据 group 表现调整挑战目标。

示例：

> LC: Alex and Jason checked in. Zijian missed today. Tomorrow is not a negotiation: 35 minutes upper body or a 20-minute incline walk.

### 11.5 Feed 如何处理

Feed 不需要删除，但应该降权。

建议：

- Community 默认看 challenge/status。
- Feed 作为 “shared wins” 或 “posts” 子 tab。
- 不要把广场内容消费当主 loop。

---

## 12. Onboarding 重构

### 12.1 当前 onboarding 优点

已有：

- coach selection
- height/weight/age/body fat
- training days
- gender
- activity level
- goal
- experience level
- notes

这是好基础。

### 12.2 当前 onboarding 问题

它收集资料，但没有立刻让用户体验：

> ZYM 已经给我安排了第一天。

另一个更具体的问题是：这些资料现在更像 optional profile，而不是 coach 决策的必要输入。

其中 `experience_level` 应该变成必填。它会直接影响：

- coach 回答的细致程度
- 动作 cue 的解释深度
- 训练计划的动作选择
- 是否默认使用复杂术语
- 是否需要更多安全提醒

beginner 用户需要更细致、更少假设的指导；intermediate 用户可以接受更简洁的计划和术语。

### 12.3 推荐 onboarding flow

#### Step 1: Choose coach

ZJ / LC 保留。

但文案更贴近 outcome：

- ZJ: helps you restart and stay consistent
- LC: keeps you accountable and cuts excuses

#### Step 2: Set goal

不要问太宽，给选项：

- build muscle
- lose fat
- get stronger
- stay consistent
- not sure yet

#### Step 3: Training reality

问：

- days/week
- average session length
- gym/home
- experience level: beginner / intermediate / advanced
- injuries or movements to avoid

### 12.4 必填和可选字段

建议必填字段只保留少量，但要真的影响产品：

- coach: `zj` / `lc`
- goal: build muscle / lose fat / get stronger / stay consistent / not sure yet
- experience_level: beginner / intermediate / advanced
- training_days_per_week

建议可选字段：

- height / weight / age / body fat
- gender
- activity level
- gym/home/equipment
- injuries or movements to avoid
- personal notes

不要为了资料完整牺牲 onboarding completion。必填字段少，但每个必填字段都要改变体验。

#### Step 4: First Today Plan

立刻生成：

- first workout
- first meal focus
- first simple next action

onboarding 结束后不要进 Message，直接进 Today。

### 12.5 Coach 使用 experience_level 的规则

Coach prompt 需要明确：

- substantive coaching 前先读取 profile。
- 每次训练建议都根据 `experience_level` 调整细节。
- beginner：少动作、更多 cue、解释为什么、避免复杂术语、给替代动作。
- intermediate：更关注 progression、volume、recovery、weak points。
- advanced：更尊重用户已有知识，少解释基础概念，更多给 tradeoff 和精细调整。
- 如果缺 `experience_level`，先问一个选择题，不要假设。

这件事要写进 `coach-skill.md`，否则 onboarding 收集了也不会稳定改变对话质量。

### 12.6 Onboarding 成功标准

用户完成 onboarding 后，必须看到：

> 今日计划已经生成。

而不是：

> 现在你可以开始聊天。

---

## 13. Premium / Business Model

### 13.1 不建议把“无限图片/视频”作为主卖点

它可以是成本控制维度，但不应该是核心价值表达。

用户愿意付费不是因为“我能多发几张图”，而是因为：

> ZYM 越来越懂我，并且真的让我坚持和进步。

### 13.2 推荐分层

| 层级 | 用户获得什么 | 目的 |
| --- | --- | --- |
| Free | daily coach chat, limited meal/photo, basic Today plan, simple friend challenge | 形成习惯和 aha |
| Premium | adaptive weekly plan, unlimited media, video form check, weekly recap, Apple Health trends, deeper memory, advanced Community challenges | 看到长期结果 |
| Hardware bundle | recovery wrap / form stand / NFC tags + Premium trial | 扩展场景和品牌 |

### 13.3 Premium 功能建议

优先级从高到低：

1. Adaptive weekly plan
2. Weekly progress report
3. Unlimited meal/photo/video analysis
4. Video form check
5. Apple Health trend interpretation
6. Long-term memory and history search
7. Premium challenge templates
8. Advanced ZJ/LC personalities

### 13.4 iOS IAP 注意

如果 iOS 内解锁的是数字功能，比如：

- premium coach
- unlimited images/videos
- advanced plans
- reports
- tokens

一般需要使用 Apple In-App Purchase。Web 可以用 Stripe，但 iOS entitlement 要谨慎统一，不要让审核认为在绕过 IAP。

---

## 14. 硬件方向

### 14.1 不建议先做摄像头机器人

原因：

- 机械结构难。
- 隐私风险高。
- 室内导航复杂。
- 摄像头信任门槛高。
- 售后成本高。
- 和当前软件资产连接不够轻。

### 14.2 更适合 ZYM 的硬件顺序

#### 1. ZYM Form Stand

一个低成本 phone stand / magnetic tripod。

价值：

- 帮用户更稳定拍动作视频。
- 强绑定 ZYM video form check。
- 硬件简单，软件价值高。
- 可以成为 Premium video analysis 的入口。

#### 2. ZYM Recovery Wrap

可穿戴冷敷/压缩 wrap。

第一代不要做复杂电子制冷，可以做：

- gel pack / phase-change material
- elastic compression wrap
- temperature indicator
- QR/NFC binding
- app recovery routine
- coach 根据训练记录提醒使用

文案要避免医疗 claim。建议说：

> support post-workout recovery routines

不要说：

> treat injury / cure inflammation / medical-grade rehab

#### 3. ZYM NFC Gym Tags

贴在器械上，用户碰一下手机开始 log。

价值：

- 降低 workout logging friction。
- 很适合 college gym 场景。
- 和 ZYM Today/Progress 直接连接。

### 14.3 硬件原则

硬件不是为了炫酷，而是为了强化 ZYM 的 daily loop：

> collect better data -> reduce friction -> improve coach decisions -> increase accountability

---

## 15. Roadmap

### Phase 0: Product language reset

时间：1 周

目标：

- 改 TestFlight tester 说明。
- 改 login/onboarding 文案。
- 明确 ZYM 不是泛 AI fitness social app。

新 tester 说明示例：

> ZYM is your AI accountability coach for gym beginners. It remembers your meals, workouts, goals, and progress, then tells you what to do next. Try asking “What should I train today?”, send a meal photo, or log a workout. Pick ZJ for encouragement or LC for tougher accountability.

### Phase 1: Today MVP

时间：2-3 周

目标：

- 新增 Today tab。
- 默认进入 Today。
- Today 显示：
  - today's training placeholder/generated plan
  - meal photo CTA
  - recent progress
  - community/challenge placeholder
  - ask coach / modify plan shortcut

依赖：

- `getCoachRecords`
- existing profile
- existing daily records
- existing coach chat/sendMessage

### Phase 2: Training Plan 产品化

时间：2-4 周

目标：

- 把已有 `getTrainingPlan/setTrainingPlan/toggleTrainingPlanExerciseCompletion` 暴露成 API 和 tools。
- Today 里可以生成和完成 workout plan。
- 完成动作后写入 training records。

### Phase 3: Community Challenge MVP

时间：3-5 周

目标：

- 新增 challenge tables。
- Community 里能创建 7-day challenge。
- training/meal/plan completion 可关联 challenge completion。
- Group coach 每周 recap，challenge 中可开启更高频提醒。

### Phase 4: Premium 实验

时间：2-4 周

目标：

- 先不急着大规模 paywall。
- 观察用户是否愿意为：
  - weekly plan
  - video form check
  - unlimited media
  - weekly report
  付费。

### Phase 5: Hardware validation

时间：并行探索

目标：

- 先做非电子 Form Stand 或 NFC tags。
- 用 20-50 个用户测试是否提升 logging/video check 使用频率。
- Recovery Wrap 需要单独材料、供应链、合规验证。

---

## 16. 核心指标

### 16.1 Activation

用户注册后 24 小时内：

- 完成 onboarding
- 生成 first Today plan
- 发出 first meal/workout log 或完成 first plan action

推荐 activation metric：

> % of new users who complete one meaningful action and one coach interaction within 24h

### 16.2 Retention

不要只看 DAU。

应该看：

- D1 return with any coach interaction
- D3 with at least 2 logs
- D7 with at least 3 meaningful actions
- week 1 workout completion count
- meal photo repeat usage

### 16.3 Accountability

Community 相关指标：

- % users who add 1 friend
- % users who join/create challenge
- challenge D3 completion
- challenge D7 completion
- group coach recap open/reply rate

### 16.4 Premium intent

观察：

- video form check repeated usage
- weekly report open rate
- users hitting media limits
- plan modification frequency
- users who ask coach “what should I do today” repeatedly

---

## 17. 事件埋点建议

新增关键事件：

- `onboarding_completed`
- `today_viewed`
- `today_plan_generated`
- `today_plan_started`
- `today_plan_completed`
- `meal_photo_uploaded`
- `meal_logged`
- `training_logged`
- `record_updated_by_coach`
- `scheduled_greeting_sent`
- `weekly_inactivity_nudge_sent`
- `coach_memory_moment_seen`
- `challenge_created`
- `challenge_joined`
- `challenge_completion_logged`
- `weekly_recap_viewed`
- `premium_paywall_viewed`
- `premium_trial_started`

关键不是事件多，而是能回答：

> 用户有没有进入 daily loop？

---

## 18. 技术实施地图

### 18.1 可以复用的现有能力

#### Coach records

现有：

- `GET /coach/records/:userId`
- `POST /coach/records/profile/update`
- `POST /coach/records/check-in/update`
- `POST /coach/records/meal/update`
- `POST /coach/records/training/update`

可支撑：

- Today summary
- Progress page
- optional status logging
- meal/training editing

#### Coach chat

现有：

- `/messages/send`
- coach reply queue
- typed tools
- session memory

可支撑：

- Message tab
- Today quick ask
- plan modifications

#### Media

现有：

- upload
- media assets
- inspect media
- saved analyses

可支撑：

- meal photo
- form check
- progress photo

#### Outreach

现有：

- coach scheduler
- nightly check-in
- inactivity nudges

可支撑：

- next-morning greeting after prior-day activity
- weekly inactivity nudge
- challenge reminders when explicitly enabled

### 18.2 需要新增的后端能力

#### Training plan API

新增：

- `GET /coach/training-plan/:userId`
- `POST /coach/training-plan`
- `POST /coach/training-plan/exercise/complete`

#### Training plan tools

新增：

- `get_training_plan`
- `set_training_plan`
- `complete_training_plan_exercise`
- `search_exercise_library`

#### Challenge API

新增：

- `POST /challenges`
- `GET /challenges/:userId`
- `POST /challenges/:challengeId/join`
- `POST /challenges/:challengeId/completion`
- `GET /challenges/:challengeId/summary`

#### Today API

可以先前端聚合现有 API，后续新增：

- `GET /today/:userId`

返回：

- profile
- today day key
- today record
- latest progress
- today plan
- active challenges
- scheduled message status

长期建议有 `GET /today/:userId`，否则前端会越来越像拼装层。

### 18.3 前端实施

Web：

- 新建 `Today` render function 或拆成 `web/src/app/today` 组件。
- 修改 tab 配置。
- 默认 `tab` 从 `messages` 改为 `today`。
- `WelcomeFlow` complete 后进入 Today。

iOS：

- `MainTabView` 新增 Today。
- onboarding complete 后默认 Today。
- Calendar 保留但改命名或位置。

### 18.4 Tester 反馈对应技术修复

#### iOS 打开 Message 太慢

建议做本地缓存和 stale-while-revalidate：

- 每个 topic 本地缓存最近 80-150 条 messages。
- 缓存 media metadata、thumbnail、本地文件路径，不要每次冷启动重新等网络。
- 打开 Message 时先渲染本地缓存，再后台按 `since_message_id` 或 `updated_at` 拉增量。
- 附件大图/视频按需加载，先显示 thumbnail 和 skeleton。
- logout、切换账号、删除 conversation 时清理对应缓存。
- DB 可用 SQLite/Core Data；简单版可以先用 Codable 文件缓存，但要考虑并发写入。

这个会直接解决 tester “iOS 打开 message 太慢” 的第一感受。

#### Dark mode 打字看不清

当前 iOS 和 web 都有较多 light-first color token。短期有两个选择：

1. 先强制 light mode
   如果短期没有精力完整适配 dark mode，可以先在 iOS 明确锁 light，避免黑夜模式下输入框文字看不清。

2. 正式做 dark mode tokens
   为 background、surface、text primary、text secondary、border、composer background、composer text、placeholder 都定义 light/dark token。

无论选哪个，Message composer 必须显式设置：

- text color
- placeholder color
- input background
- cursor/accent color
- send button disabled/enabled contrast

否则用户在黑夜模式下连字都看不清，会显得产品很不稳定。

#### AI 修改 record 导致 duplicate

这是 P0/P1 级别产品信任问题。

建议实现顺序：

1. 暴露 meal/training update typed tools。
2. 增加 list recent records tools，让 coach 能定位 “刚才那条”。
3. 在 coach prompt 里写 edit-vs-append 规则。
4. Progress record item 增加 “ask coach to edit” 入口，并把 record id 带到 Message。
5. 增加重复记录检测：同一天、同动作、相近时间、相近 sets/reps/weight 时提醒 merge。

#### Onboarding 必填 experience level

Web 和 iOS onboarding 现在都不应该允许用户跳过 `experience_level`。

实现上：

- onboarding step validation 必须检查 `experience_level`。
- profile update payload 必须写入。
- coach 每次 substantive coaching 前读取 profile。
- 如果老用户缺这个字段，Today 或 Message 里轻量补问一次。

---

## 19. 风险

### 19.1 做太宽

如果继续同时做：

- AI coach
- friend search
- nearby social
- feed
- leaderboard
- media analysis
- hardware
- recovery
- premium

产品会散。优先级必须围绕 daily loop。

### 19.2 过早做泛社区

Feed 很容易变成空广场。早期用户少时，feed 会显得冷清。Community 里的 challenge/shared goal 更适合小规模网络。

### 19.3 AI 回答好，但用户不行动

ZYM 的失败不会是“回答错一点”，而是用户看完建议后什么都不做。

所以每个 coach 回复最好都收束到：

- log this
- start this
- complete exercise
- tell me yes/no

### 19.4 Premium 过早伤害 aha

如果图片/视频太早付费，可能挡住 aha moment。先让用户体验到“拍照/视频真的有用”，再用长期价值付费。

### 19.5 Hardware medical claims

Recovery hardware 不能宣传治疗疾病、伤病、炎症。必须保持 general wellness / post-workout recovery routine。

---

## 20. 决策建议

### 20.1 立即决定

1. ZYM 是否接受从 social-first 改成 Today/accountability-first。
2. 是否把 college gym beginners 作为早期 wedge。
3. 是否把 `Today` 作为默认首页。
4. 是否保留 `Message` 和 `Community` 命名，但调整默认入口和内容重点。
5. 是否优先产品化 training plan，而不是继续扩功能。
6. 是否把 scheduled coach message 改成“前一天有互动才次日 greeting；长期无互动只周提醒”。

### 20.2 暂缓决定

1. 硬件具体 SKU。
2. 复杂 subscription pricing。
3. 大范围 public community。
4. 医疗/康复定位。
5. 复杂动作识别机器人。

---

## 21. 推荐的 30 天执行清单

### Week 1

- 改定位文案。
- 改 TestFlight 说明。
- 画 Today 页面低保真。
- 定义 `GET /today/:userId` 返回结构。

### Week 2

- Web 新增 Today MVP。
- Welcome complete 后进入 Today。
- Today 接入 records/profile/progress。
- Message 可以从 Today 带上下文修改计划或记录。
- onboarding 强制收集 `experience_level`。

### Week 3

- 暴露 training plan API。
- Today 能生成/展示/完成 workout plan。
- Coach chat 能解释/修改 today plan。
- 暴露 meal/training update tools，修复 AI 修改记录 duplicate。

### Week 4

- Community challenge 数据模型。
- 7-day challenge MVP。
- Group coach recap prototype。
- iOS Message 本地缓存和 dark mode 输入框修复。
- 收集 tester 数据和访谈。

---

## 22. Tester 访谈问题

不要只问“你觉得 app 怎么样”。要问具体行为问题：

1. 你第一次打开 ZYM，知道自己应该做什么吗？
2. 你觉得 ZYM 和 ChatGPT 最大区别是什么？
3. 你愿意明天再打开 ZYM 的理由是什么？
4. 哪一刻你觉得“它真的记得我”？
5. 你会为了 meal photo / form check / weekly plan 付费吗？
6. 如果朋友也在里面，你最想一起做什么？
7. 你会不会觉得 Community/feed 没必要？
8. Today 页面里哪个按钮你最愿意点？
9. 你更愿意点按钮记录，还是直接发消息给 coach？
10. ZJ/LC 哪个更像你真的会持续用的 coach？

---

## 23. 新 TestFlight 说明草案

英文短版：

> ZYM is your AI accountability coach for gym beginners. It remembers your meals, workouts, goals, and progress, then tells you what to do next. Pick ZJ for encouragement or LC for tough accountability. Try asking “What should I train today?”, send a meal photo, or log a workout. The key thing to test is whether ZYM feels like a coach that helps you stay consistent, not just another chatbot.

中文解释：

> ZYM 是给健身新手的 AI 执行型教练。它不是单纯回答健身问题，而是记住你的训练、饮食、目标和进度，然后告诉你下一步该做什么。测试重点不是“AI 会不会聊天”，而是你会不会愿意明天再回来继续执行。

---

## 24. 对外 Pitch 草案

### One-liner

> ZYM is an AI accountability coach for gym beginners.

### Slightly longer

> ZYM helps gym beginners stay consistent with training and nutrition through AI coaches, simple daily plans, meal/workout memory, and friend accountability.

### Against ChatGPT

> ChatGPT can answer fitness questions. ZYM helps you actually stay consistent.

### User promise

> Open ZYM for 30 seconds and know what to do today.

---

## 25. 参考竞品和政策

这些不是为了照抄，而是说明 ZYM 不能只停留在“AI coach”这个宽泛卖点。

- Fitbod：主打 AI personalized workout plans、history、recovery、progress tracking。
  https://www.fitbodapp.com/

- MyFitnessPal Meal Scan：拍照记录食物是 Premium 功能，说明 photo food logging 已经是成熟付费方向，但也意味着 ZYM 不能只靠这个单点差异化。
  https://support.myfitnesspal.com/hc/en-us/articles/360045761612-Meal-Scan-FAQ

- Future：真人 personal training + accountability，App Store 页面显示 membership 为 USD $199/month。
  https://apps.apple.com/us/app/future-personal-training/id1288178982

- WHOOP：recovery、strain、sleep、coach/accountability 结合，说明数据驱动 daily recommendation 是成熟用户心智。
  https://support.whoop.com/s/article/WHOOP-Recovery

- Apple App Review Guidelines：iOS 内解锁数字功能通常需要 IAP。
  https://developer.apple.com/app-store/review/guidelines

- FDA General Wellness Guidance：recovery/wearable 相关硬件要避免疾病诊断、治疗、预防等医疗 claim。
  https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices

---

## 26. 最终判断

ZYM 现在不是没有价值，而是价值藏在功能列表和聊天窗口后面。

最该做的产品重构是：

> 从 “AI fitness social app” 变成 “daily accountability coach”。

如果 ZYM 继续走聊天 + 泛社交，用户会自然拿它和 ChatGPT/Gemini/Instagram 比。这个比较很难赢。

如果 ZYM 把 Today plan、meal/workout memory、Message 里的自然输入、friend accountability、weekly recap 做成闭环，它就不再是一个 AI wrapper，而是一个用户每天执行健身生活的系统。

优先级非常明确：

1. Today 首页
2. Training plan 产品化
3. Message-driven meal / workout logging and editing
4. Community challenge
5. Weekly recap
6. Premium
7. 轻硬件

先把用户每天打开 ZYM 的理由做出来，再谈更大的生态。
