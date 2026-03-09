# ZYM App - 启动说明

## 快速启动

### 1. 启动后端服务器

```bash
cd /Users/wangzijian/Documents/apps/zym-app/server
npm run dev
```

服务器将运行在：
- WebSocket: `ws://localhost:8080`
- API: `http://localhost:3001`

### 2. 启动Web应用

打开新终端：

```bash
cd /Users/wangzijian/Documents/apps/zym-app/web
npm run dev
```

访问：`http://localhost:3000`

### 3. 启动iOS应用

```bash
cd /Users/wangzijian/Documents/apps/zym-app/ios
open ZYM.xcodeproj
```

在Xcode中：
1. 选择模拟器或真机
2. 点击运行按钮 (⌘R)

## 测试账号

- **用户名**: `user2`
- **密码**: `pass123`

## 功能测试流程

### Web端测试
1. 访问 http://localhost:3000
2. 点击 Register 创建新账号（或使用 user2/pass123 登录）
3. 选择教练（ZJ温柔型 或 LC严格型）
4. 进入聊天页面与AI教练对话
5. 访问 /feed 查看社区动态

### iOS端测试
1. 在Xcode中运行应用
2. 输入用户名密码登录
3. 选择教练
4. 开始聊天

## API端点

所有API都在 `http://localhost:3001`：

- `POST /auth/register` - 注册
- `POST /auth/login` - 登录
- `POST /coach/select` - 选择教练
- `POST /community/post` - 发布动态
- `GET /community/feed/:userId` - 获取动态
- `POST /community/friend/add` - 添加好友
- `POST /community/friend/accept` - 接受好友
- `POST /media/upload` - 上传媒体
- `POST /media/analyze-food` - 分析食物

## 环境要求

- Node.js 18+
- Xcode 14+ (仅iOS)
- OpenRouter API Key (已配置)

## 数据存储

- 数据库: `server/data/zym.db` (SQLite)
- 上传文件: `server/data/uploads/`
