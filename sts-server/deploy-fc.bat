@echo off
echo === 准备函数计算部署包 ===

REM 安装依赖
echo 安装依赖...
call npm install

REM 创建部署目录
echo 创建部署包...
if exist fc-deploy rmdir /s /q fc-deploy
mkdir fc-deploy

REM 复制文件
copy index.js fc-deploy\
copy package.json fc-deploy\
xcopy /E /I /Y node_modules fc-deploy\node_modules

REM 打包
echo 打包...
cd fc-deploy
tar -a -cf ..\fc-package.zip *
cd ..

echo === 部署包已生成: fc-package.zip ===
echo 请在函数计算控制台上传此文件
