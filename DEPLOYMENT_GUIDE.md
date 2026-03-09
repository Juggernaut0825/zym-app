# ZYM App - 云端部署方案

## 架构图

```
                    ┌─────────────────┐
                    │   iOS/Web App   │
                    └────────┬────────┘
                             │ WebSocket
                    ┌────────▼────────┐
                    │  Load Balancer  │
                    │   (nginx/ALB)   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼────────┐ ┌──▼───┐ ┌───────▼────────┐
     │ WebSocket Server│ │ ... │ │ WebSocket Server│
     │   (PM2 cluster) │ └─────┘ │   (PM2 cluster) │
     └────────┬────────┘          └────────┬────────┘
              │                            │
              └──────────────┬─────────────┘
                             │
                    ┌────────▼────────┐
                    │  Shared Storage │
                    │  (EFS/NFS)      │
                    │  data/<userId>/ │
                    └─────────────────┘
```

## PM2配置

### ecosystem.config.js
```javascript
module.exports = {
  apps: [
    {
      name: 'zym-websocket',
      script: 'dist/index.js',
      instances: 4,              // 4个进程
      exec_mode: 'cluster',      // 集群模式
      env: {
        NODE_ENV: 'production',
        WEBSOCKET_PORT: 8080,
        API_PORT: 3001,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY
      },
      max_memory_restart: '1G',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
```

## 部署步骤

### 1. 服务器准备 (AWS EC2 / DigitalOcean)
```bash
# 安装Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装PM2
sudo npm install -g pm2

# 克隆代码
git clone <your-repo>
cd zym-app/server
npm install
npm run build
```

### 2. 配置环境变量
```bash
# /home/ubuntu/zym-app/server/.env
OPENROUTER_API_KEY=sk-or-v1-xxx
WEBSOCKET_PORT=8080
API_PORT=3001
JWT_SECRET=your-secret-key
NODE_ENV=production
```

### 3. 启动服务
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 开机自启
```

### 4. Nginx反向代理
```nginx
# /etc/nginx/sites-available/zym
upstream websocket {
    ip_hash;  # 保持WebSocket连接到同一进程
    server 127.0.0.1:8080;
}

upstream api {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name api.zym.app;

    # WebSocket
    location /ws {
        proxy_pass http://websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # REST API
    location / {
        proxy_pass http://api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 数据存储方案

### 方案1: 本地文件系统 (单服务器)
```
/home/ubuntu/zym-app/server/data/
├── 1/
│   ├── profile.json
│   ├── daily.json
│   └── history/
├── 2/
│   ├── profile.json
│   └── daily.json
```

### 方案2: 共享存储 (多服务器)
```bash
# 挂载EFS (AWS)
sudo mount -t nfs4 -o nfsvers=4.1 \
  fs-xxx.efs.us-east-1.amazonaws.com:/ \
  /mnt/zym-data

# 修改代码中的dataDir
const dataDir = '/mnt/zym-data/' + userId;
```

### 方案3: 数据库 (推荐)
```typescript
// 将profile.json存入MySQL
CREATE TABLE user_profiles (
  user_id INT PRIMARY KEY,
  height INT,
  weight DECIMAL(5,2),
  goal ENUM('bulk','cut','maintain'),
  coach ENUM('zj','lc'),
  updated_at TIMESTAMP
);

// 将daily.json存入MySQL
CREATE TABLE daily_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  date DATE,
  meals JSON,
  workouts JSON,
  created_at TIMESTAMP
);
```

## Agent工作流程

### 用户发送消息时
```typescript
// 1. WebSocket接收消息
ws.on('message', async (data) => {
  const msg = JSON.parse(data.toString());

  // 2. 验证用户
  const client = clients.get(ws);
  if (!client.authenticated) return;

  // 3. 调用CoachService
  const response = await CoachService.chat(
    client.userId,  // "2"
    msg.content     // "hi"
  );

  // 4. 返回结果
  ws.send(JSON.stringify({
    type: 'chat_response',
    content: response
  }));
});

// CoachService内部
static async chat(userId: string, message: string) {
  // 1. 加载用户的coach persona
  const coach = await getCoachFromDB(userId); // "zj" or "lc"
  const systemPrompt = fs.readFileSync(`src/coach/${coach}.soul.md`);

  // 2. 创建ConversationRunner（临时，不是常驻进程）
  const runner = new ConversationRunner(aiService, toolManager);

  // 3. 设置用户数据目录
  const dataDir = `/mnt/zym-data/${userId}`;  // 或 `data/${userId}`

  // 4. 运行对话
  const result = await runner.run(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
    {},
    { userId, workingDirectory: dataDir, dataDirectory: dataDir }
  );

  // 5. 返回AI回复
  return result.response;
}
```

### Skills如何访问用户数据
```typescript
// ToolManager注册skills时传入context
class ToolManager {
  async executeTool(toolName: string, args: any, context: Context) {
    const skill = this.skills[toolName];

    // context包含：
    // - userId: "2"
    // - dataDirectory: "/mnt/zym-data/2"
    // - workingDirectory: "/mnt/zym-data/2"

    return await skill.execute(args, context);
  }
}

// 例如log-meal skill
const logMealSkill = {
  name: 'log_meal',
  execute: async (args, context) => {
    const filePath = `${context.dataDirectory}/daily.json`;
    const data = JSON.parse(fs.readFileSync(filePath));
    data.meals.push(args.meal);
    fs.writeFileSync(filePath, JSON.stringify(data));
    return 'Meal logged';
  }
};
```

## 关键点总结

1. **不需要常驻Agent进程** - ConversationRunner按需创建，处理完就销毁
2. **PM2管理WebSocket服务器** - 多个进程处理并发连接
3. **用户数据隔离** - 每个用户有独立的data/<userId>/目录
4. **Skills通过context访问数据** - 不是全局文件路径
5. **可扩展** - 增加服务器只需共享存储或用数据库

## 监控和日志

```bash
# 查看进程状态
pm2 status

# 查看日志
pm2 logs zym-websocket

# 监控资源
pm2 monit

# 重启
pm2 restart zym-websocket
```
