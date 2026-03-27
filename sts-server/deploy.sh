#!/bin/bash
# STS 服务部署脚本（适用于 ECS/轻量服务器）

set -e

echo "=== 开始部署 STS 服务 ==="

# 安装 Node.js 18（如未安装）
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "18" ]; then
  echo "安装 Node.js 18..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 创建应用目录
APP_DIR="/opt/fairytale-sts"
sudo mkdir -p $APP_DIR
sudo chown $(whoami):$(whoami) $APP_DIR

# 复制文件（假设在本地已打包上传）
# 实际使用时，请先将 sts-server 目录上传到服务器

echo "=== 安装依赖 ==="
cd $APP_DIR
npm install --production

echo "=== 创建 systemd 服务 ==="
sudo tee /etc/systemd/system/fairytale-sts.service > /dev/null << 'EOF'
[Unit]
Description=Fairytale STS Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/fairytale-sts
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 创建 www-data 用户（如不存在）
id -u www-data &>/dev/null || sudo useradd -r -s /bin/false www-data

# 设置权限
sudo chown -R www-data:www-data $APP_DIR

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable fairytale-sts
sudo systemctl start fairytale-sts

echo "=== 部署完成 ==="
echo "服务状态:"
sudo systemctl status fairytale-sts --no-pager

echo ""
echo "测试命令: curl http://localhost:3001/health"
