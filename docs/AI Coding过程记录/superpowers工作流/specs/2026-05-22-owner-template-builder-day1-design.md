# Owner 模板搭建器 Day 1 设计说明

- 日期：2026-05-22
- 负责人：成员 A
- 目标：在不依赖后端的前提下，把 Owner 主链路第二站“低配模板搭建器”做成可演示的最小闭环

## 1. 设计目标与范围

### 1.1 目标
- 基于现有模板搭建页，完成一个本地 state 驱动的低配模板搭建器。
- 支持添加、配置、排序、删除组件。
- 支持按当前配置渲染最小预览。
- 严格遵守第一版组件白名单与字段白名单。

### 1.2 本次范围（必须做）
- 在现有 [frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx](frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx) 单页内实现。
- 左侧展示 7 个组件白名单并支持添加组件。
- 中间展示已添加组件列表，并支持选中、删除、上移、下移。
- 右侧展示当前选中组件的配置表单。
- 预览区根据当前 schema 渲染最小预览。
- 所有数据只保存在前端本地 state。

### 1.3 本次不做（明确砍掉）
- 不新增路由。
- 不接后端接口。
- 不持久化到数据库或 localStorage。
- 不做拖拽排序。
- 不做嵌套布局。
- 不做高级联动、条件显示、复杂校验。
- 不做模板发布流程。

## 2. 组件白名单

第一版只允许以下 7 类组件：
- `text_input`：单行文本
- `textarea`：多行文本
- `single_select`：单选
- `multi_select`：多选
- `tag_select`：标签选择
- `image_upload`：图片上传
- `show_item`：展示项

## 3. 字段白名单

### 3.1 通用字段
除展示项外，普通输入组件支持：
- `label`
- `field`
- `required`

### 3.2 选项类字段
`single_select`、`multi_select`、`tag_select` 额外支持：
- `options`

`options` 第一版使用逗号分隔字符串输入，在本地 state 中存为字符串数组。

### 3.3 图片上传字段
`image_upload` 额外支持：
- `maxCount`

`maxCount` 必须是正整数。

### 3.4 展示项字段
`show_item` 只支持：
- `label`
- `content`

展示项不参与提交字段，因此不要求 `field` 与 `required`。

## 4. 页面结构

页面仍使用一个入口文件：
[frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx](frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx)

### 4.1 组件区
- 展示 7 个可添加组件按钮。
- 点击按钮后，将对应组件追加到 schema 列表尾部。
- 新组件自动成为当前选中项。

### 4.2 Schema 列表区
每个已添加组件展示：
- 组件中文名
- `field` 或 `content` 摘要
- 上移按钮
- 下移按钮
- 删除按钮

交互规则：
- 点击组件卡片可选中。
- 上移 / 下移只在可移动时生效。
- 删除当前选中组件后，优先选中同位置的下一个组件；没有下一个则选中前一个；列表为空则无选中项。

### 4.3 配置区
- 无选中组件时展示空状态提示。
- 选中组件后展示该组件允许字段。
- 字段表单改动立即写入本地 state。

### 4.4 预览区
按当前 schema 渲染只读预览：
- `text_input`：文本输入框
- `textarea`：多行文本框
- `single_select`：单选按钮组
- `multi_select`：复选框组
- `tag_select`：标签按钮组
- `image_upload`：上传占位框，显示最大数量
- `show_item`：展示文本内容

## 5. 数据结构

前端本地使用最小类型：

```ts
type TemplateComponentType =
  | 'text_input'
  | 'textarea'
  | 'single_select'
  | 'multi_select'
  | 'tag_select'
  | 'image_upload'
  | 'show_item'

type TemplateComponent = {
  id: number
  type: TemplateComponentType
  label: string
  field: string
  required: boolean
  options?: string[]
  maxCount?: number
  content?: string
}
```

说明：
- `show_item` 仍可复用同一类型，但 UI 不展示 `field` 与 `required`。
- 第一版不拆复杂 schema 类型，避免过度设计。

## 6. 最小校验

本次只做不会阻塞使用的轻量规则：
- 普通输入组件新增时给默认 `label` 与 `field`。
- 选项类组件默认给 2 个选项。
- 图片上传默认 `maxCount = 1`。
- 用户将 `maxCount` 改成非正数时，自动按 `1` 保存。

不做保存前统一校验，因为本次没有后端保存动作。

## 7. 测试策略

新增组件测试覆盖：
1. 初始展示 7 个组件白名单。
2. 点击添加组件后，组件进入 schema 列表并自动选中。
3. 修改 `label`、`field`、`required` 后，列表与预览同步变化。
4. 选项类组件可以编辑 options，并在预览中展示。
5. 组件可以上移 / 下移。
6. 组件可以删除。
7. 展示项只展示 `content` 配置与预览。

## 8. 验收标准

完成后 Owner 可以在模板搭建页完成以下演示：
1. 添加一个单行文本组件。
2. 配置字段名、标题和必填状态。
3. 添加一个单选组件并配置选项。
4. 调整组件顺序。
5. 删除组件。
6. 在预览区看到当前配置结果。

## 9. 成功标准

本次完成的验收口径为：

> Owner 可以在模板搭建页通过本地 mock/state 完成组件添加、字段配置、排序、删除与预览。
