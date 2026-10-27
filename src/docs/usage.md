# electerm_slim 使用说明

## 安装和更新

从 [Releases](https://github.com/fayev1t/electerm_slim/releases) 下载 Windows x64 安装包并运行。通过“关于”面板检查更新；匹配到当前平台安装包时可以直接下载，没有匹配包时使用 Releases 中的附件。

更新只读取本仓库的 GitHub Releases，不使用原项目的更新站点和镜像。正式版优先，仓库只有预览版时检查最新预览版。

## 连接和书签

在快速连接框输入 `user@host:22` 或 `ssh://user@host:22`，也可以新建书签，填写主机、端口和认证信息。私钥支持粘贴内容或选择本地文件。跳板连接、代理和 SSH 隧道在书签的对应设置中配置。

支持的其他连接包括 Telnet、串口、FTP、RDP、VNC 和 SPICE。SPICE 可导入 `.vv` 文件。代理地址可填写 `socks5://127.0.0.1:1080` 等格式。

可在设置中注册连接协议。项目专属协议使用 `electerm-slim://user@host:22?type=ssh`，软件名和命令行名称使用 `electerm_slim`。

## 标签、工作区和工具栏

标签支持分屏和布局切换，可以把常用布局保存为工作区。SSH/SFTP 顶部工具区提供历史命令、快捷命令、搜索、批量输入和 AI 等操作。底部监控条显示当前 SSH 主机的资源使用情况。

终端的鼠标、SFTP 路径跟随、配色、快捷键和自定义 CSS 都在设置中调整。终端关键词高亮支持正则表达式。

## 快捷命令和主题

在设置中添加快捷命令，填写名称和要执行的内容；模板可使用编辑器中列出的变量。主题编辑器可修改终端和界面配色，也可导入已有主题。

AI 生成命令、主题或快捷命令前，需要先在 AI 设置中选择服务、填写模型和自己的 API 密钥。生成内容可先检查和编辑再使用。

## 数据同步和备份

支持 GitHub/Gitee Gist、WebDAV 和自定义同步服务。同步设置中填写对应令牌、Gist ID 或 WebDAV 地址与认证信息，保存并测试后再上传或下载。同步和 AI 都由用户自行配置服务。

导入导出可用于本地备份。electerm_slim 使用独立目录，不直接读写原 electerm 的数据库、缓存或存储密钥。

## 从 electerm 迁移

在原 electerm 的“设置 → 同步”里点“导出”，保存完整的 JSON 文件。再到 electerm_slim 的“设置 → 同步”点“从文件导入”，选这个文件。

导入会用文件里的书签、分组、主题、快捷命令等数据替换当前内容，并应用其中的设置。导入前可以先点“导出”备份当前数据。导出文件里有连接的登录信息，用完请妥善保管。

## 数据位置

| 系统 | 默认数据目录 |
| --- | --- |
| Windows | `%APPDATA%\electerm_slim` |
| Linux/WSL | `$XDG_CONFIG_HOME/electerm_slim`，未设置时为 `~/.config/electerm_slim` |
| macOS | `~/Library/Application Support/electerm_slim` |
| Windows 便携版 | 程序旁的 `electerm_slim` 目录 |

`users/default_user/` 下存放 `electerm_slim.db`、`electerm_slim_data.db` 和存储密钥；`electron/` 存放浏览器缓存，`logs/`、`session_logs/`、`widget_logs/` 分别存放程序、终端和组件日志。自定义模块在 `custom-modules/`，临时文件在系统临时目录的 `electerm_slim/`。

可用环境变量 `DATA_PATH` 指定整个数据根目录。设置页显示当前真实位置并可打开目录。用户自己指定的外部日志目录和 SSH 密钥路径仍按原设置使用。

## 命令行

在设置中安装 `electerm_slim` 命令到 PATH 后，可以在新开的终端中使用：

```sh
electerm_slim user@host:22
electerm_slim /path/to/console.vv
electerm_slim --help
```

开发模式下不安装系统命令，请使用 `npm run app`。

## X11

X11 转发需要本机先启动 X Server，并在 SSH 书签中启用 X11。Windows 可使用本地 X Server，macOS 可使用 XQuartz。连接失败时检查 DISPLAY、认证设置和本机服务是否运行。

## 问题反馈

先确认使用的是本仓库版本，并记录系统、软件版本、操作步骤和错误日志，再到 [Issues](https://github.com/fayev1t/electerm_slim/issues) 反馈。语言文本问题也在本仓库提交。
