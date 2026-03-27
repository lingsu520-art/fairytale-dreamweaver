# 函数计算部署说明

## 问题诊断
当前函数返回 "Internal Server Error"，原因是 `@alicloud/pop-core` 模块未安装。

## 解决方案

### 方法1：控制台直接安装依赖（推荐）

1. 在函数计算控制台，进入函数 `fairytale-sts`
2. 点击 **函数代码** 标签页
3. 在代码编辑器上方，找到 **依赖管理** 或 **层配置**
4. 添加公共层：选择 `Node.js 18` 运行时对应的 `aliyun-sdk` 层
5. 或者在代码根目录创建 `package.json`，控制台会自动安装依赖

### 方法2：本地打包上传

在本地电脑执行：

```bash
cd sts-server
deploy-fc.bat
```

这会生成 `fc-package.zip` 文件，包含所有依赖。

然后在控制台：
1. 点击 **函数代码** → **上传代码**
2. 选择 **上传 ZIP 包**
3. 上传 `fc-package.zip`
4. 点击 **部署**

### 方法3：使用在线编辑器安装

1. 在函数代码页面，找到终端或命令行工具
2. 执行 `npm install @alicloud/pop-core`
3. 等待安装完成

## 验证

部署完成后，执行：
```bash
curl https://fairytale-sts-uturevojwq.cn-hangzhou.fcapp.run/sts-token
```

应该返回 JSON 格式的 STS 凭证。
