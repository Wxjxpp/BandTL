# 手环词典 · Xiaomi Vela 快应用

面向 **小米手环 9 Pro**（1.74" AMOLED 方屏，336×480）的离线词典快应用。支持从外界导入词典、在手环上调用输入法进行本地搜索，匹配合适的翻译。

## 功能特性

- **手环输入法本地搜索**：集成三方输入法组件（中/英/日），在手环上直接键盘输入查询
- **外界导入词典**：通过 URL 下载词典 JSON 并持久化存储（`system.fetch` + `file.writeText`）
- **内置基础词典**：开箱即用 60 词英汉词典，无网络也可使用
- **多级匹配算法**：前缀匹配 > 单词包含 > 中文释义包含，结果去重
- **词典管理**：查看当前词典、切换内置/导入词典、删除导入词典
- **深色极简 UI**：黑底白字 + 绿色主色，符合手环视觉规范，适配 336×480 竖屏

## 目录结构

```
手环词典/
├── README.md
├── package.json
├── sign/                        # 签名文件（打包时生成）
└── src/
    ├── app.ux                   # 应用入口，暴露 dict 模块
    ├── manifest.json            # 包名/路由/权限/designWidth 配置
    ├── common/
    │   ├── dict.json            # 内置基础英汉词典（60词）
    │   ├── components/
    │   │   └── InputMethod/     # 三方输入法组件（来自 NEORUAA/Vela_input_method）
    │   │       ├── InputMethod.ux
    │   │       └── assets/      # 拼音词库/键盘图片资源
    │   ├── scripts/
    │   │   └── dict.js          # 词典管理（加载/导入/持久化/搜索）
    │   └── images/
    └── pages/
        ├── index/index.ux       # 搜索主页（输入法+结果列表）
        ├── detail/detail.ux     # 词条详情页
        ├── import/import.ux     # 词典导入页（URL输入+下载）
        └── manage/manage.ux     # 词典管理页
```

## 词典数据格式

```json
{
  "name": "词典名称",
  "version": "1.0",
  "lang": "en-zh",
  "words": [
    {
      "id": 1,
      "word": "apple",
      "phonetic": "ˈæpl",
      "translation": "n. 苹果"
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| name | 否 | 词典名称，用于管理页展示 |
| words | 是 | 词条数组，缺失则导入校验失败 |
| words[].word | 是 | 单词，搜索匹配主字段 |
| words[].phonetic | 否 | 音标 |
| words[].translation | 是 | 释义，支持中文反向搜索 |

## 使用方式

### 1. 用 AIoT-IDE 打开项目

在 AIoT-IDE 中 `文件 > 打开文件夹` 选择 `手环词典/` 目录。

### 2. 安装依赖

开发向导提示安装依赖，或在终端执行 `npm install`。若下载失败，在项目根目录创建 `.npmrc`：
```
registry="https://registry.npmmirror.com/"
```

### 3. 运行调试

在 banner 栏点击「调试」按钮，选择手环模拟器（小米手环9 Pro 方屏）预览。点击搜索框唤起输入法，输入字母实时搜索。

### 4. 导入自定义词典

1. 将词典 JSON 上传到任意公网可访问地址（如 GitHub raw、对象存储）
2. 在应用内「词典管理 > 导入新词典」页面用输入法输入 URL
3. 点击「开始导入」，下载成功后自动持久化并切换为当前词典

### 5. 打包

点击 banner 栏「打包」生成 `dist/*.rpk`，生产打包需先在 `sign/` 配置签名文件。

## 搜索匹配逻辑

输入关键词后按优先级本地匹配（[dict.js](src/common/scripts/dict.js)）：

1. **前缀匹配**：`word` 以输入开头（如输入 `app` 命中 `apple`）
2. **包含匹配**：`word` 包含输入（如输入 `ppl` 命中 `apple`）
3. **释义匹配**：`translation` 包含输入（如输入 `苹果` 命中 `apple`）

结果按 id 去重，上限 50 条。

## 技术要点

- **设计基准宽度**：`manifest.json` 中 `config.designWidth = 336`，px 值 1:1 对应手环9 Pro 屏宽
- **输入法组件**：`screentype="rect"` 对应方屏（designWidth ≥ 336），支持中/英/日、QWERTY/T9
- **持久化存储**：用户词典写入 `internal://files/user_dict.json`（`system.file.writeText`）
- **资源读取**：内置词典通过 `file.readText({uri:'/Common/dict.json'})` 读取（只读）
- **声明权限**：`system.router / system.file / system.storage / system.fetch / system.prompt / system.device`

## 限制说明

- Vela 快应用 `input` 组件仅支持 button/checkbox/radio，文本输入依赖三方 `input-method` 组件
- 无文件选择器，词典导入通过网络 URL 下载实现
- 输入法 URL 输入时，符号（`/` `:` `.` 等）需通过输入法切换符号键盘输入

## 致谢

输入法组件来自 [NEORUAA/Vela_input_method](https://github.com/NEORUAA/Vela_input_method)（支持中/英/日多语言输入）。
