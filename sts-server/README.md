# STS Token Service - 函数计算部署指南

## 费用说明
函数计算按调用次数和运行时间计费，本服务每月免费额度：
- 调用次数：100万次/月
- 运行时间：40万 GB-秒/月

对于绘本生成场景（每次保存故事调用1次），完全免费。

## 部署步骤

### 1. 安装 Serverless Devs 工具
```bash
npm install @serverless-devs/s -g
s config add --AccessKeyID YOUR_ACCESS_KEY_ID --AccessKeySecret YOUR_ACCESS_KEY_SECRET
```

### 2. 配置环境变量
```bash
cd sts-server
export ACCESS_KEY_ID=你的AccessKeyID
export ACCESS_KEY_SECRET=你的AccessKeySecret
```

### 3. 部署
```bash
s deploy
```

部署完成后会输出 HTTP 触发器地址，例如：
```
https://fairytale-sts-xxx.cn-hangzhou.fcapp.run
```

### 4. 测试
```bash
curl https://fairytale-sts-xxx.cn-hangzhou.fcapp.run/sts-token
```

## 更新前端配置
将部署后的地址填入 `index.html`：
```html
<script>window.STS_SERVER_URL = 'https://fairytale-sts-xxx.cn-hangzhou.fcapp.run';</script>
```

## 常见问题

**Q: 部署失败提示权限不足？**
A: 确保当前账号有 AliyunFCFullAccess 和 AliyunSTSAssumeRoleAccess 权限。

**Q: 如何查看调用日志？**
A: 在函数计算控制台 → 函数详情 → 调用日志中查看。

**Q: 如何更新代码？**
A: 修改代码后重新执行 `s deploy` 即可。
