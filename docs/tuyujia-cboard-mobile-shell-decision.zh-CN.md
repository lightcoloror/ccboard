# 图语家复用 CBoard 官方移动壳的接入决策

更新时间：2026-07-22 05:55:00  
执行工具/模型：Codex（GPT-5）

## 背景

图语家的双向沟通核心已经进入 CBoard Web fork 和独立微信小程序。为了继续获得
Android、iOS、Windows 和 Web 的成熟平台能力，移动端不应再复制一套业务实现，
而应复用 CBoard 官方现有包装工程。

## 总体决策

- CBoard Web fork 继续作为浏览器、Android、iOS 和 Electron 的唯一业务实现。
- `ccboard` 继续作为 Android、iOS 和 Electron 的原生 Cordova 包装层。
- 微信小程序继续使用独立 Taro + React 18 适配层，只复用纯业务核心与 DTO，不搬运
  React DOM、Material UI 或 Cordova 插件。
- `cboard-mobile` 是独立 Flutter 重写，`cboard-mobile-flutter` 当前没有可用实现；
  两者都不作为本阶段的权威移动端底座。

### 意图

让图语家核心功能只维护一份，同时继承 CBoard 已经验证过的原生平台、文件、TTS、
登录、订阅和深链适配能力。

### 决策

沿用官方“CBoard build -> ccboard/www -> Cordova platform”的工程链，不建立新的
WebView 壳，也不把 CBoard 业务代码复制进移动仓库。

### 理由

官方 `ccboard` README 明确说明该仓库包装原始 CBoard React 应用；CBoard 本身已经
包含 `isCordova`、`HashRouter`、原生 TTS、文件权限和平台判断等适配。继续复用这条
链路比维护另一套 Flutter 或原生界面更少分叉、更容易跟随 upstream。

### 证据

- 官方仓库：<https://github.com/cboard-org/ccboard>
- 官方 CBoard：<https://github.com/cboard-org/cboard>
- 本地 `config.xml` 声明 Android、iOS 和 Electron 平台。
- 本地 CBoard `src/index.js` 在 Cordova 环境使用 `HashRouter` 并等待
  `deviceready`。
- 2026-07-22 的真实打包使用当前 CBoard fork 成功生成 3,952 个文件、
  124,711,727 字节的 `www` 产物。

### 生效范围

适用于图语家后续 Android、iOS、Electron 和 Web 的工程组织；不改变微信小程序的
独立平台 UI，也不代表本轮已经完成 APK、IPA 或 Electron 安装包签名验收。

## 变动一：新增跨平台 CBoard 打包脚本

文件：`scripts/package-cboard.mjs`

### 意图

消除官方流程中手改 `homepage`、手改 `public/index.html`、依赖 Unix
`rm/cp/sed` 的步骤，让 Windows、macOS 和 Linux 使用同一条命令。

### 决策

脚本优先发现官方 `./cboard` 子模块，若未初始化则复用同级 `../cboard` fork；
通过 `PUBLIC_URL=.` 构建相对路径产物，只在复制后的 `www/index.html` 中注入
`cordova.js`。

### 理由

环境变量能够使用 Create React App 已有能力，无须永久修改 CBoard 的
`package.json`；只修改打包副本也不会污染 Web 构建或产生难以 review 的业务差异。

### 证据

- 实际构建输出明确显示 “The project was built assuming it is hosted at ./.”。
- 校验器确认 `www/index.html` 包含 `cordova.js`。
- 校验器确认 `src` 和 `href` 中没有以根目录开头的本地资源地址。
- 目标清理固定限制在解析后的 `ccboard/www`，不会接受任意删除路径。

### 生效范围

只影响本地或 CI 的 CBoard Web 资源打包；不安装 Cordova CLI、不生成平台工程、
不签名、不上传应用商店。

## 变动二：新增打包单元测试

文件：`scripts/package-cboard.test.mjs`

### 意图

防止源目录发现、参数解析、重复注入、绝对路径检查和安全清理在后续更新中回退。

### 决策

使用 Node 内置 `node:test` 和临时目录测试，不引入新的测试依赖。

### 理由

`ccboard` 原先的 `npm test` 固定失败且没有测试框架；Node 22 已经是官方 CI
使用的运行时，内置测试可以保持依赖和 lockfile 不变。

### 证据

2026-07-22 后台执行 `npm test`：5 个测试全部通过。

### 生效范围

只覆盖 CBoard Web 产物进入 Cordova 壳之前的打包契约；不替代 Android、iOS 或
Electron 的真机/安装包测试。

## 变动三：新增 npm 稳定入口

文件：`package.json`

### 意图

为开发者和 CI 提供可发现、可重复的统一命令。

### 决策

新增 `cboard:package`、`cboard:package:skip-build` 和
`cboard:package:verify`，并让 `npm test` 运行真实单元测试。

### 理由

稳定入口比记忆脚本参数可靠，也方便未来 upstream review 和 CI 分阶段复用。

### 证据

`npm run cboard:package` 已使用同级 CBoard fork 完成生产构建、复制和校验；
`npm run cboard:package:verify` 可单独检查既有产物。

### 生效范围

只改变开发命令；没有修改现有 Cordova 插件、平台版本、证书或发布配置。

## 变动四：更新 README

文件：`README.md`

### 意图

让下一位维护者无需先理解旧 Shell 脚本即可正确复用图语家所在的 CBoard fork。

### 决策

在保留官方原始平台说明和手工流程的前提下，新增推荐命令、源目录选择规则和原生
构建边界。

### 理由

文档应明确“打包 Web 资源”和“生成原生安装包”是两个阶段，避免把一次 Web 构建
误报为 Android/iOS 已验收。

### 证据

README 中的命令与 `package.json` scripts 一致，并链接到本决策文档。

### 生效范围

适用于本 fork 的开发和评审说明；不改变 upstream 的发布承诺。

## 当前验证与剩余边界

- 已通过：Node 单元测试 5/5。
- 已通过：当前 CBoard fork 的生产构建。
- 已通过：Cordova Web 资源复制、`cordova.js` 注入、相对路径和目录结构校验。
- 未验证：Windows 本机没有项目级 Cordova CLI 和已生成平台目录。
- 未验证：Android APK/AAB 仍需要 Cordova CLI、Android SDK、JDK 和签名配置。
- 未验证：iOS IPA 必须在 macOS、Xcode 和有效签名环境中构建。
- 待优化：当前未压缩 Web 产物约 124.7 MB；这是完整 CBoard 图库与构建资源的总量，
  后续应在不破坏离线 AAC 图库的前提下单独做安装包体积分析。

## 2026-07-22：Windows Electron 无签名构建验收

执行工具 / 模型：Codex（GPT-5）  
记录时间：2026-07-22 06:19:10

## 变动五：新增独立无签名构建配置

文件：`build.unsigned.json`

### 意图

在不修改正式发布证书和签名配置的前提下，为本地开发与 CI 提供可重复的 Windows
Electron 安装包验证入口。

### 决策

保留 `build.json` 的 `win-cert.pfx` 配置不动，独立选择 `portable` 和 `nsis` 目标，
并显式设置 `forceCodeSigning: false`。Cordova CLI 只通过固定版本
`npx --yes cordova@12.0.0` 临时调用，不写入项目依赖。

### 理由

正式发布必须继续签名，但本地没有证书密码不应阻断应用壳、Web 资源和安装器结构
验证。独立配置比临时删除证书字段更安全，也不会把开发配置误带入正式发布。

### 证据

- 相对 `--buildConfig=build.unsigned.json` 在 `cordova-electron@3.1.0` 中被当作模块名，
  真实触发 `MODULE_NOT_FOUND`；改用绝对配置路径后构建退出码为 0。
- 生成 `AACCboard 1.39.0.exe`（82,028,344 字节）和
  `AACCboard Setup 1.39.0.exe`（82,186,909 字节），并生成 blockmap 与 latest.yml。
- `win-unpacked/resources/app.asar` 为 125,586,939 字节；清单含 4,082 个文件、
  `index.html`、`cordova.js`、83 个 JavaScript 文件和 2 个 CSS 文件。
- `package.json`、`package-lock.json`、`config.xml`、`settings.json` 和原
  `build.json` 的构建前后 SHA-256 保持不变。

### 生效范围

只用于本地或 CI 的 Windows x64 无签名验证包；不替代正式签名，不发布、不运行
生成的应用，也不证明 Android、iOS 或 Windows UI 运行时已经验收。

## 变动六：README 固化旧版 Cordova 的绝对路径要求

文件：`README.md`

### 意图

让维护者直接执行一条与真实成功证据一致的 PowerShell 命令，不再重复遇到相对路径
加载失败。

### 决策

README 先用 `Resolve-Path` 取得 `build.unsigned.json` 绝对路径，再传给固定版本的
Cordova CLI；同时明确无签名产物只用于验证，正式发布继续使用 `build.json`。

### 理由

`cordova-electron@3.1.0` 内部使用 `require(buildOptions.buildConfig)`，相对文件名
不会自动按项目根目录解析。记录这个兼容边界比升级整条旧平台依赖链风险更低。

### 证据

绝对路径命令已在 Windows 后台完成 portable 与 NSIS 构建；JSON 解析、Node 测试
5/5 和 `cboard:package:verify` 均通过，后者复核 3,952 个 Web 文件、
124,711,727 字节。

### 生效范围

适用于当前 `cordova-electron@3.1.0` 的 Windows 本地构建说明；不改变业务代码、
插件、lockfile、证书、平台版本或发布流程。

## 更新后的验证与剩余边界

- 已通过：CBoard Web 构建、Cordova `www` 打包与静态校验。
- 已通过：Windows x64 无签名 portable 与 NSIS 构建，以及安装包/ASAR 静态内容验收。
- 未执行：为遵守窗口约束，没有启动 `.exe`，因此不声称 Electron UI 运行时通过。
- 未验证：正式 Windows 代码签名、Android APK/AAB、macOS/iOS 原生构建与真机运行。
- 待优化：安装器约 82.2 MB、ASAR 约 125.6 MB；后续需在保留离线 AAC 图库前提下
  做资源分层与压缩分析。
- 窗口约束：全程只使用后台 shell、文件检查和构建，没有打开、聚焦、抬升或置顶
  微信开发者工具或 Electron 应用。

## 2026-07-22：设备内语音插件进入 Cordova 工程链

执行工具 / 模型：Codex（GPT-5）  
记录时间：2026-07-22 06:51:01

## 变动七：增加本地插件 fork 的可重复安装说明

文件：`README.md`

### 意图

让 `ccboard` 在不等待插件发布到 npm 或远程 fork 的前提下，复用同级
`cboard-speech-recognition` 并验证 Android/iOS 设备内语音接线。

### 决策

README 固化 `cordova plugin add ../cboard-speech-recognition --nosave`，要求在新增或
重建 Android/iOS 平台前执行；暂不把本地 file 依赖写入正式 package/lockfile。

### 理由

当前插件改动尚未提交或公开发布，远程 spec 不存在；本地 sibling 是当前完整 fork
工程体系的真实路径。`--nosave` 可验证集成，又不会污染未来 upstream 依赖决策。

### 证据

插件 1.3.0 已进入 Cordova plugin list；Android manifest、Java 和 platform_www JS
均完成合并，Electron platform_www 与最终 ASAR 也包含插件桥接。package、lockfile、
config、settings 和正式 build 配置哈希保持不变。

### 生效范围

当前本地 fork 的开发和平台生成；不是正式发布依赖。插件公开后应改为可追踪的远程
版本并重新决定 lockfile，不应永久依赖开发者机器绝对路径。

## 变动八：记录 Android 基线冲突而不擅自升级

### 意图

区分设备内语音插件已合并与整个旧 Android 工程尚不能构建的真实原因。

### 决策

保留 `cordova-android@10.1.2` 和现有 lockfile 不动，只记录平台生成日志与
requirements；不在同一功能切片升级 Android、Firebase、file/media 或 Gradle。

### 理由

平台生成发现 `cordova-plugin-file@8.1.3`、`media@7.0.0` 要求 Android 12+，
`firebasex@19.0.1` 要求 Android 14+；本机又没有 Android SDK/Gradle。此时升级或
降级会影响整套发布工程，必须作为独立基线修复审查，不能混入 ASR 功能。

### 证据

- Android 10.1.2 平台生成成功，语音插件安装成功。
- Cordova 明确跳过 file、media 和 firebasex 的 Android 安装。
- `cordova requirements android`：JDK 21 可用；Android SDK、target、Gradle 缺失。
- 最新 CBoard `www` 为 3,952 文件 / 124,727,945 字节；Electron portable 和 NSIS
  再次构建成功，最终 ASAR 125,605,156 字节并含插件注册与设备内语音主 bundle。

### 生效范围

Android APK/AAB 的后续环境与依赖治理；不否定插件代码、CBoard build 或 Electron
打包证据，也不把 Android 平台生成冒充 APK 编译成功。

## 2026-07-22：Android 14 平台重建与原生语音编译

执行工具 / 模型：Codex（GPT-5）  
记录时间：2026-07-22 07:19:15

## 变动九：用声明版本重建 Android 平台，纠正旧生成目录漂移

文件：`README.md`、Cordova 忽略的 `platforms/android` 生成目录

### 意图

确认上一条记录中的 Android 10.1.2 冲突究竟属于项目依赖，还是一次临时平台生成
留下的陈旧目录，避免基于错误基线升级或降级插件。

### 决策

保持受版本控制的 `package.json`、`package-lock.json`、`config.xml`、
`settings.json` 和 `build.json` 不动，复用隔离的 Cordova CLI 12 和项目已经声明的
`cordova-android@14.0.1`，完整移除并重建忽略的 Android 平台；恢复现有全部 Cordova
插件后再执行真实 Gradle 构建。

### 理由

项目和 lockfile 原本已经锁定 Android 14，旧目录却混有 Android 10 的
`app/build.gradle`，缺少 `namespace` 和 `tools` 模板。只补一行 Gradle 配置会继续
掩盖平台漂移；按官方平台重建流程恢复生成物，才能验证 file、media、Firebase 和
语音插件是否真的兼容同一基线。

### 证据

- 隔离安装 Android SDK Platform 35、Build Tools 35.0.0 和 platform-tools；官方
  command-line tools ZIP 的 SHA-256 为
  `90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a`。
- 重建结果为 `cordova-android 14.0.1`、target/compile SDK 35；file 8.1.3、media
  7.0.0、firebasex 19.0.1 和本地 speechrecognition 1.3.0 等 21 个插件全部安装，
  不再出现旧平台的最低版本跳过。
- 五个受保护配置文件重建前后 SHA-256 全部相同。
- 完整 Gradle 构建通过 wrapper、资源和依赖配置阶段，最终只在官方 Firebase 插件的
  `processDebugGoogleServices` 因根目录缺少真实 `google-services.json` 停止。

### 生效范围

纠正当前 fork 的 Android 平台基线、生成流程和后续验收依据；不修改业务代码、
正式依赖、锁文件、Firebase 配置或签名。完整 CBoard APK 仍需项目真实 Firebase
部署文件，不把配置阶段通过写成完整 APK 成功。

## 变动十：独立最小工程真实编译设备内语音插件

文件：`cboard-speech-recognition` 本地 fork、隔离的 Cordova 14 烟测工程

### 意图

在完整 CBoard 构建被外部 Firebase 配置阻断时，仍以原生编译而非 Java 静态搜索
证明设备内语音插件可以进入 Android 14 APK。

### 决策

复用官方 Cordova CLI、`cordova-android@14.0.1`、API 35 和 Gradle 8.13，在
`C:\tmp` 建立不含 Firebase 的最小 Cordova 工程，只安装本地 MIT 插件后执行
Debug APK 构建；不安装、不运行该 APK，也不把烟测包当成 CBoard 应用。

### 理由

Firebase 部署凭据与语音插件源码兼容性是两个独立验证层。最小原生工程既不会伪造
`google-services.json`，也不会通过移除正式 CBoard 插件来制造一个冒充完整应用的
绿色结果，同时能真实覆盖 Manifest 合并、Cordova Java API、javac、DEX 和 APK
打包。

### 证据

- Gradle 50 个任务全部完成，包含 `compileDebugJavaWithJavac`、DEX、签名和
  `assembleDebug`；构建结果为 `BUILD SUCCESSFUL`。
- 生成 `app-debug.apk`，大小 3,452,083 字节，SHA-256 为
  `7988FF5981C3C043A832CE2A49124CE4D009ABFA4F3DD6F776A1252222C2EE8D`。
- 编译器只报告上游 Android API 的 deprecation 提示，没有 Java 编译错误；插件
  既有 Node 契约测试仍为 4/4。

### 生效范围

证明 `cboard-speech-recognition` 1.3.0 在 Android 14/API 35 下可原生编译和打包；
不证明完整 CBoard APK、Firebase、麦克风权限运行时、中文本地语言包、断网识别质量
或真机生命周期已经通过。iOS 仍需 macOS/Xcode 单独编译和真机验收。

## 2026-07-22：隔离 Android 核心调试包构建链

执行工具 / 模型：Codex（GPT-5）  
记录时间：2026-07-22 07:50:17

## 变动十一：正式 Firebase 配置不动，调试构建只在临时副本省略插件

文件：`scripts/build-android-core.mjs`、`package.json`、`.gitignore`、CBoard
Firebase 可选调用点

### 意图

在没有项目真实 `google-services.json` 的本地环境中继续编译完整 CBoard/图语家
Android 核心应用，而不是长期停留在“最小语音插件可以编译”的间接证据。

### 决策

复用官方 ccboard、Cordova CLI 和 `cordova-android@14.0.1`。默认先调用既有
`package-cboard.mjs` 重建当前 CBoard fork，再复制 `www`、`public` 和正式
配置到系统临时目录；只从临时 `package.json` 删除
`cordova-plugin-firebasex`，其余官方插件全部恢复，并额外安装同级 MIT
`cboard-speech-recognition`。CBoard 对 Firebase 的统计、用户标识、注销和
Google 登录调用改为插件不存在时安全降级。正式 package、lockfile、config、
settings、build 和 Firebase 密文均不修改。

### 理由

源码检索确认 Firebase 在当前 CBoard 移动壳中承担统计、消息、用户标识和原生
Google 登录，不参与默认板、双向沟通、图文匹配、本机存储、TTS 或设备内 ASR。
Apache Cordova 官方 CLI 已提供 `plugin remove --nosave` 的临时插件语义，因此
不需要伪造 Google 配置，也不需要建立第二套移动应用。默认重建 Web 包可防止旧
`www` 让 APK 悄悄携带陈旧业务代码。

### 证据

- Apache Cordova 官方 CLI 文档确认 `--nosave` 不改变 package/config 中的插件
  声明；Android 14 官方基线为 API 35、Build Tools 35.0.0、Gradle 8.13。
- 新增构建器单测与既有包装测试合计 `9/9`；CBoard Firebase 可选调用定向
  `5 suites / 59 tests` 通过。
- 构建前后正式 `package.json`、`package-lock.json`、`config.xml`、
  `settings.json`、`build.json` 的 SHA-256 分别保持
  `B975460B...`、`0D0936E0...`、`2F2D5206...`、`01B05A97...`、
  `819F1B4B...`。

### 生效范围

适用于当前 fork 的无 Firebase 本地 Android 核心调试构建和 CBoard 可选插件
容错。正式发布仍完整保留 Firebase 依赖、真实 Google 配置、签名和发布流程；
核心调试包不提供 Firebase Analytics、FCM 或原生 Google 登录，不能冒充正式包。

## 变动十二：当前 CBoard Web 与设备内语音进入真实 Android 核心 APK

文件：隔离临时 Cordova 工程、忽略的 `artifacts/android-core` 产物和构建报告

### 意图

用可复现的完整 APK 证明图语家双向沟通代码已经能够随 CBoard 官方 Android 壳
进入原生应用，而不只证明 Web build 或单个语音插件。

### 决策

使用 Android SDK 35、Cordova Android 14.0.1 和 Gradle 8.13 执行 Debug 构建；
构建后校验插件注册表、应用包信息、录音权限、CBoard 主 bundle 三方哈希和 APK
SHA-256。只生成和静态检查，不安装、不启动、不连接设备。

### 理由

Gradle 成功本身不能证明 APK 内使用了当前 CBoard 业务产物，也不能证明临时
Firebase 删除没有误删设备内语音。把 build、`ccboard/www` 和 APK 内主 bundle
的 SHA-256 对齐，再独立检查插件注册表，才能形成从当前源码到原生包的证据链。

### 证据

- CBoard production build 成功，`www` 为 `3,952 files / 124,730,400 bytes`；
  全量回归 `186 suites / 1230 tests / 72 snapshots` 通过。
- Cordova/Gradle `50 actionable tasks` 全部执行成功；APK 为
  `57,903,542 bytes`，SHA-256
  `52FA0AB41702FAF29DCF4B8510CF8BEC48FDC9B3191EDBC3E291F639B339E8B7`。
- APK 为 `com.unicef.cboard` 1.39.0、min SDK 24、target/compile SDK 35，并含
  `android.permission.RECORD_AUDIO`。
- APK 插件注册表包含 `cordova-plugin-speechrecognition`，不含
  `cordova-plugin-firebasex`；source build、`ccboard/www` 与 APK 内
  `static/js/main.6c91d8aa.js` 的 SHA-256 均为
  `9639FFC19F6B4D61C0CEC9EF23E075A706B6586569E7D748AC8F14F1A996CC69`。

### 生效范围

证明当前 CBoard fork、图语家 Web 功能、Cordova Android 壳和设备内语音插件可以
形成同一个无 Firebase Debug APK。没有安装或启动 APK，因此不证明 Android 真机
UI、触控、TTS、麦克风、设备内中文语言包、断网识别、账号登录、购买、推送或
生命周期；正式 Firebase 完整包仍需真实部署文件。本轮全程仅使用后台 shell、
Node 和 Gradle，没有打开、聚焦、抬升或置顶微信开发者工具、Android Studio、
模拟器、Electron 或其他应用窗口，也没有提交、推送、部署、预览或发布。

## 2026-07-26：最新双向沟通核心重新进入官方多平台壳

执行工具 / 模型：Codex（GPT-5.6）  
记录时间：2026-07-26 10:47:58

## 变动十三：以同一 Web bundle 重验 Windows Electron 与 Android 核心包

文件：当前 CBoard production build、`ccboard/www`、Electron 无签名验证包、
Android 无 Firebase 核心调试包及其忽略的构建报告

### 意图

消除 2026-07-22 原生包早于后续图语家功能开发的时间差，证明当前双向沟通、
接收记录和最新 CBoard 上游修复已经真正进入 Windows 与 Android 官方壳，而不是
只存在于 Web 工作树或旧 APK。

### 决策

继续完整复用 CBoard 官方 `ccboard` Cordova 工程、Cordova CLI 12、
`cordova-android@14.0.1`、Electron 平台和已有打包脚本，不建立 Flutter 或其他
第二套客户端。先以 `PUBLIC_URL=.` 构建当前 CBoard，再把同一 `www` 分别打入
Electron 无签名验证包和无 Firebase Android 核心调试包；以主 bundle SHA-256、
功能标记和插件注册表建立跨层证据链。

### 理由

图语家的核心代码持续演进后，旧原生产物只能证明历史版本。复用官方多平台壳并
核对包内字节，比复制 React 页面到原生技术栈、只看构建日志或仅比较文件名更可靠，
也继续保留 CBoard 已成熟的 Windows、Android 和未来 iOS 工程体系。

### 证据

- 当前 CBoard 标准 production build 成功，重新包装的 `ccboard/www` 为
  `3,960 files / 124,905,046 bytes`；包装脚本与 Android 构建脚本单测合计
  `9/9` 通过。
- source build 与 `ccboard/www` 的 `static/js/main.0e9b8b57.js` SHA-256 均为
  `5951E658D5B68C6E469A0F0270253C3A8260ACC3192FD95AF080D5B1D7EEE4A6`。
- Electron release 构建成功，生成 `AACCboard 1.39.0.exe`
  `82,231,334 bytes`、`AACCboard Setup 1.39.0.exe`
  `82,389,908 bytes` 和含 `4,093` 个文件的 `app.asar`；ASAR 内主 bundle
  哈希与 source 完全相同，并同时含 `communicationSupport`、`receiverRecords`。
- Android SDK 35、Gradle 8.13 和 Cordova Android 14.0.1 的
  `50 actionable tasks` 全部执行成功；新 APK 为 `57,963,244 bytes`，
  SHA-256 为
  `8BB584A1C1DFBF5C06376E108C63C080645D0B9D134843BFA429C98E94C2BF6C`。
- APK 内 `assets/www/static/js/main.0e9b8b57.js` 哈希与 source、`www` 和
  Electron 一致，包含 `communicationSupport`、`receiverRecords`；插件注册表
  包含 `cordova-plugin-speechrecognition`，不含仅为本地核心验证而省略的
  `cordova-plugin-firebasex`。

### 生效范围

证明 2026-07-26 当前 CBoard/图语家 Web 核心可以由同一产物进入 Windows Electron
和 Android Cordova 壳；iOS 共用的 Web 包也已刷新，但 Windows 无法执行
Xcode、签名和 IPA 验收。Electron 包未签名、Android 包不含 Firebase，且均未安装、
启动、连接真机、提交、推送、上传或发布，因此不代替真实设备 UI、触控、语音、
离线、登录、推送、购买、生命周期和正式签名验收。本轮只在后台使用 shell、
Node、Cordova 与 Gradle，没有打开、激活、聚焦、抬升或置顶任何开发工具或应用
窗口。

## 2026-07-28：本地 TTS fork 进入可复现 Android 构建链

执行工具 / 模型：Codex（GPT-5.6）  
记录时间：2026-07-28 21:35:00

## 变动十四：隔离构建显式安装本地 TTS fork

文件：`scripts/build-android-core.mjs`、`scripts/build-android-core.test.mjs`、
同级 `cboard-speech-tts` fork

### 意图

让连续播报回调隔离修复真正进入图语家的 Android 构建入口，避免独立插件已经修复，
`ccboard` 临时工程却仍从 GitHub 恢复旧 TTS 代码。

### 决策

保留官方 `ccboard` 的正式 `cboard-speech-tts` 依赖、lockfile 和发布配置不变；只在
无 Firebase 的隔离核心构建副本中移除远程 TTS 声明，再通过 `--tts-plugin` 或
`CBOARD_TTS_PLUGIN` 显式安装同级本地 fork。设备内识别继续使用原有
`--speech-plugin`，两者均由 Cordova 正式插件机制装入。

### 理由

正式依赖尚未包含本地未提交修复，直接改 lockfile 会污染现有发布边界；但只修插件
而不接构建器又会产生“测试的是新代码、APK 用的是旧代码”的假证据。临时清单替换
复用现有隔离模式，既不分叉业务代码，也能确保验证对象一致。

### 证据

- `cboard-speech-tts` Node 回归 `4/4` 通过，最小 Cordova 14/API 35 工程成功安装
  本地插件，`:app:compileDebugJavaWithJavac` 为 `BUILD SUCCESSFUL`。
- `ccboard` 构建器与包装回归 `10/10` 通过，覆盖 TTS 参数、远程声明移除、源清单
  不变和插件注册表强制检查。
- APK 离线组装在 Java 编译成功后因未缓存 `lint-gradle:31.7.3` 停止，因此本条不
  声称新 TTS 修复已经生成或安装为 APK。

### 生效范围

适用于 `ccboard` 无 Firebase Android 核心调试构建和本地 TTS fork 选择；不修改
正式依赖、lockfile、签名、Firebase、CBoard Web、微信 WechatSI、服务端 TTS、
语音识别或 UI。没有提交、推送、上传、预览、发布，也没有打开、聚焦或置顶任何
开发者工具窗口。
