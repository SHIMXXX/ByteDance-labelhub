# `preference_compare` 偏好对比标注数据导入、模板创建、标注审核与导出完整流程

本文档以示例数据集 `preference_compare` 为测试数据，描述一条更符合真实标注平台的完整工作流。

该数据集适用于 **RLHF / 偏好对比标注任务**：系统给出同一个 `prompt` 下的两个候选回答 `response_a` 与 `response_b`，标注员判断哪个回答更好，并填写优势程度、判断维度、安全风险与标注理由。

需要注意：示例数据集中已经自带部分标注结果字段，例如 `preferred`、`margin`、`dimensions`、`safety_flag`、`annotator_note`。在真实待标注任务中，这些字段不应直接作为“待展示数据”给 Labeler 使用，而应该在导入阶段被识别为 **已有标注字段 / 标准答案字段 / 演示答案字段**，根据导入模式决定是否保留。

---

## 1. 核心概念说明

在本系统中，应将以下四类数据分开管理：

| 概念 | 含义 | 示例 |
|---|---|---|
| 原始数据集 Dataset / DatasetItem | 待标注的题目材料 | `prompt`、`response_a`、`response_b` |
| 标准答案 GoldAnswer | 可选，用于质检或演示的参考答案 | 原始文件中的 `preferred`、`margin` 等 |
| 标注提交 AnnotationSubmission | Labeler 在系统中填写并提交的结果 | Labeler 新填写的偏好结论与理由 |
| 审核结果 ReviewResult / FinalResult | Reviewer 审核后的最终结果 | 通过、打回、修订后的最终答案 |

因此，正确的数据流不是“导入文件中的所有字段 → 直接展示给标注员”，而是：

```text
导入文件
→ 区分原始题目字段与已有标注字段
→ 原始题目字段进入 DatasetItem
→ 已有标注字段按导入模式忽略、保存为 Gold Sample 或作为演示数据
→ Labeler 在系统中重新产生 AnnotationSubmission
→ Reviewer 审核后生成最终结果
```

---

## 2. 数据导入流程

### Step 1：上传数据文件

Owner 在“数据集”页面点击 **新建数据集 / 导入数据**。

支持格式：

- JSONL：`.jsonl`
- JSON：`.json`
- Excel：`.xlsx`

示例数据路径：

```text
datasets/datasets/preference_compare
```

上传后，系统显示基础信息：

```text
数据集名称：preference_compare
数据集类型：偏好对比标注
样本数量：12
字段数量：13
支持格式：JSON / JSONL / Excel
```

---

### Step 2：系统解析字段

系统读取文件前几条样本，自动识别字段和字段类型。

示例字段如下：

| 字段 | 类型 | 初步判断 | 说明 |
|---|---|---|---|
| `id` | string | 样本 ID | 样本唯一编号 |
| `task_type` | string | 元信息字段 | 任务类型 |
| `lang` | string | 元信息字段 | 语言 |
| `prompt` | long text | 原始展示字段 | 用户问题 |
| `response_a` | long text | 原始展示字段 | 回答 A |
| `model_a` | string | 元信息字段 | 回答 A 的模型来源 |
| `response_b` | long text | 原始展示字段 | 回答 B |
| `model_b` | string | 元信息字段 | 回答 B 的模型来源 |
| `preferred` | enum | 疑似已有标注字段 | 偏好结论 |
| `margin` | enum | 疑似已有标注字段 | 优势程度 |
| `dimensions` | array | 疑似已有标注字段 | 判断依据维度 |
| `safety_flag` | boolean | 疑似已有标注字段 | 是否存在安全风险 |
| `annotator_note` | text | 疑似已有标注字段 | 标注理由 |

系统应给出提示：

```text
检测到该数据集中包含疑似标注结果字段：
preferred、margin、dimensions、safety_flag、annotator_note

请选择这些字段的处理方式。
```

---

### Step 3：选择导入模式

由于该示例数据自带标注字段，导入时需要选择模式。

#### 模式 A：作为普通待标注数据导入

适用于真实标注任务。

系统只导入原始题目字段：

```text
id
task_type
lang
prompt
response_a
model_a
response_b
model_b
```

以下字段不进入 Labeler 作业页，也不作为 Labeler 的已填答案：

```text
preferred
margin
dimensions
safety_flag
annotator_note
```

这些字段可以被忽略，也可以仅记录在导入日志中。

该模式下，标注员需要从空白表单开始重新标注。

---

#### 模式 B：作为 Gold Sample 标准答案导入

适用于质量控制、AI 预审对比、标注员质量画像。

系统导入原始题目字段，同时将已有标注字段保存到 `gold_answer` 中：

```json
{
  "external_id": "P0001",
  "raw_data": {
    "task_type": "知识问答",
    "lang": "zh",
    "prompt": "解释什么是过拟合，并给一个通俗例子。",
    "response_a": "...",
    "model_a": "doubao-pro",
    "response_b": "...",
    "model_b": "baseline-7b"
  },
  "gold_answer": {
    "preferred": "A",
    "margin": "明显优于",
    "dimensions": ["准确性", "完整性", "可读性"],
    "safety_flag": false,
    "annotator_note": "A 含定义+类比，B 过于笼统。"
  }
}
```

Labeler 作业时看不到 `gold_answer`，提交后系统可用于对比：

```text
Gold Sample：preferred = A
Labeler 提交：preferred = B
→ AI 预审建议打回 / 转人工复核
```

---

#### 模式 C：作为演示数据导入

适用于答辩、Demo、系统联调。

系统导入原始题目字段和已有标注字段，并可自动生成一部分模拟状态：

```text
P0001：已通过
P0002：AI 建议通过
P0003：待人工审核
P0004：已打回
P0005：待 Labeler 修改
```

这样可以快速展示完整链路，不需要现场手动标完所有样本。

---

### Step 4：字段角色映射

系统进入字段映射页，将字段分为三类。

#### 1. 样本基础字段

| 数据字段 | 系统角色 | 说明 |
|---|---|---|
| `id` | 样本 ID | 用于唯一标识样本 |
| `task_type` | 元信息 | 展示任务类型 |
| `lang` | 元信息 | 展示语言 |
| `model_a` | 隐藏元信息 | Labeler 默认隐藏，Owner / Reviewer 可见 |
| `model_b` | 隐藏元信息 | Labeler 默认隐藏，Owner / Reviewer 可见 |

#### 2. 原始展示字段

| 数据字段 | 系统角色 | Labeler 页面展示 |
|---|---|---|
| `prompt` | 题目输入 | 用户问题 |
| `response_a` | 待比较内容 | 回答 A |
| `response_b` | 待比较内容 | 回答 B |

#### 3. 已有标注字段

| 数据字段 | 系统角色 | 处理方式 |
|---|---|---|
| `preferred` | 已有标注结果 | 忽略 / 保存为 Gold / 演示填充 |
| `margin` | 已有标注结果 | 忽略 / 保存为 Gold / 演示填充 |
| `dimensions` | 已有标注结果 | 忽略 / 保存为 Gold / 演示填充 |
| `safety_flag` | 已有标注结果 | 忽略 / 保存为 Gold / 演示填充 |
| `annotator_note` | 已有标注结果 | 忽略 / 保存为 Gold / 演示填充 |

---

### Step 5：数据预览与导入检查

系统展示前 3–5 条样本，并给出导入检查报告。

示例检查项：

```text
总样本数：12
字段数量：13
原始展示字段：prompt、response_a、response_b
疑似标注字段：preferred、margin、dimensions、safety_flag、annotator_note
重复 id：0
缺失 prompt：0
缺失 response_a：0
缺失 response_b：0
已有标注答案：12
安全风险样本：1
```

如果选择 Gold Sample 模式，检查报告应额外显示：

```text
Gold Sample 数量：12
Gold 字段完整率：100%
```

---

### Step 6：创建数据集

导入成功后，系统创建数据集。

示例：

```text
数据集名称：preference_compare
数据集类型：偏好对比标注
样本数量：12
字段数量：13
导入模式：普通待标注 / Gold Sample / 演示数据
导入格式：JSONL
导入人：Owner
```

推荐内部结构：

```text
Dataset
├── dataset_id
├── name
├── type
├── total_count
├── field_schema
└── created_at

DatasetItem
├── item_id
├── dataset_id
├── external_id
├── raw_data
├── metadata
└── status

GoldAnswer（可选）
├── item_id
└── gold_answer
```

---

## 3. 模板创建与绑定流程

### 3.1 为什么模板应在数据导入后创建

模板的作用是回答两个问题：

```text
1. 原始数据应该如何展示给标注员？
2. 标注员需要填写哪些结构化结果？
```

这两个问题都依赖数据字段。

因此推荐流程是：

```text
导入数据集
→ 系统识别字段
→ Owner 基于字段创建模板
→ 配置展示区与标注区
→ 预览真实样本
→ 保存模板
→ 发布任务时绑定数据集与模板
```

---

### 3.2 一个模板包含两部分

不建议拆成两个完全独立的模板，而是设计成：

```text
一个标注任务模板
├── 展示区 ：定义原始数据怎么展示
├── 标注区：定义标注员要填写什么
├── 校验规则 ：定义提交限制
└── 权限/可见性配置 ：定义不同角色看到哪些字段
```

页面上可以做成四个 Tab：

```text
模板设计器
├── 数据展示
├── 标注表单
├── 校验规则
└── 真实样本预览
```

---

### 3.3 展示区 

对于 `preference_compare`，展示区建议配置为：

```json
{
  "display_schema": [
    {
      "type": "text",
      "field": "prompt",
      "label": "用户问题"
    },
    {
      "type": "compare_panel",
      "layout": "two_columns",
      "left": {
        "field": "response_a",
        "label": "回答 A"
      },
      "right": {
        "field": "response_b",
        "label": "回答 B"
      }
    },
    {
      "type": "tag",
      "field": "task_type",
      "label": "任务类型"
    },
    {
      "type": "tag",
      "field": "lang",
      "label": "语言"
    }
  ],
  "visibility": {
    "labeler_hidden_fields": ["model_a", "model_b"],
    "reviewer_visible_fields": ["model_a", "model_b"],
    "owner_visible_fields": ["model_a", "model_b"]
  }
}
```

说明：

- `prompt` 展示为用户问题。
- `model_a` 与 `model_b` 默认不展示给 Labeler，避免模型来源影响主观判断。
- Reviewer 与 Owner 可以查看模型来源，方便分析结果。

---

### 3.4 标注区

标注区定义 Labeler 需要提交的字段。

```json
{
  "annotation_schema": [
    {
      "type": "radio",
      "field": "preferred",
      "label": "哪个回答更好？",
      "options": ["A", "B", "tie"],
      "required": true
    },
    {
      "type": "radio",
      "field": "margin",
      "label": "优势程度",
      "options": ["明显优于", "略优于", "相当"],
      "required": true
    },
    {
      "type": "checkbox",
      "field": "dimensions",
      "label": "判断依据",
      "options": ["相关性", "准确性", "完整性", "安全性", "可读性", "格式合规"],
      "min": 1,
      "required": true
    },
    {
      "type": "radio",
      "field": "safety_flag",
      "label": "是否存在安全风险？",
      "options": [true, false],
      "required": true
    },
    {
      "type": "textarea",
      "field": "annotator_note",
      "label": "判断理由",
      "minLength": 10,
      "required": true
    }
  ]
}
```

---

### 3.5 校验规则 

推荐规则：

```text
preferred 必填
margin 必填
dimensions 至少选择 1 项
annotator_note 最少 10 个字
如果 preferred = tie，则 margin 必须为“相当”
如果 preferred = A 或 B，则 margin 不能为“相当”
如果 safety_flag = true，则 annotator_note 必须说明安全风险点
```

可表示为：

```json
{
  "validation_rules": [
    {
      "field": "preferred",
      "rule": "required"
    },
    {
      "field": "dimensions",
      "rule": "min_items",
      "value": 1
    },
    {
      "field": "annotator_note",
      "rule": "min_length",
      "value": 10
    },
    {
      "if": {
        "field": "preferred",
        "equals": "tie"
      },
      "then": {
        "field": "margin",
        "equals": "相当"
      }
    },
    {
      "if": {
        "field": "safety_flag",
        "equals": true
      },
      "then": {
        "field": "annotator_note",
        "must_contain_reason": true
      }
    }
  ]
}
```

---

### 3.6 模板预览

Owner 保存模板前，应使用真实样本预览。

例如预览 P0001：

```text
用户问题：
解释什么是过拟合，并给一个通俗例子。

回答 A：
过拟合指模型在训练集表现很好但泛化差。比如学生死记答案，考原题满分，换题就不会。

回答 B：
过拟合就是模型训练得太好了。

标注表单：
- 哪个回答更好？
- 优势程度
- 判断依据
- 是否存在安全风险？
- 判断理由
```

预览通过后保存：

```text
模板名称：偏好对比标注模板 v1
关联数据集：preference_compare
模板状态：草稿 / 已发布
```

---

## 4. 任务发布流程

Owner 在任务管理页创建任务。

任务配置：

```text
任务名称：偏好对比标注 · RLHF 样本集
关联数据集：preference_compare
关联模板：偏好对比标注模板 v1
样本数量：12
分发策略：先到先得 / 指派
每人配额：5 条
截止时间：2026-06-12 23:59
启用 AI 辅助标注：是
启用 AI 预审：是
启用人工复审：是
是否使用 Gold Sample 质检：根据导入模式决定
```

任务发布后，样本状态初始化：

```text
待领取
```

任务生命周期：

```text
草稿
→ 已发布
→ 进行中
→ 已暂停
→ 已结束
→ 已归档
```

样本状态流转：

```text
待领取
→ 已领取
→ 草稿
→ 已提交
→ AI 预审中
→ AI 建议通过 / AI 建议打回 / 转人工
→ 人工审核中
→ 通过入库 / 打回修改 / Reviewer 直接修订
→ 已完成
```

---

## 5. Labeler 标注流程

### Step 1：领取任务

Labeler 在任务广场看到任务卡片：

```text
任务名称：偏好对比标注 · RLHF 样本集
任务说明：比较两个模型回答，判断哪个更好并说明理由
样本数量：12
剩余可领取：12
截止时间：2026-06-12 23:59
```

点击领取后进入作业台。

---

### Step 2：进入标注工作台

作业台建议布局：

```text
左侧：题目导航
中间：用户问题 + 回答 A/B 双栏对比
右侧：标注表单 + AI 辅助建议 + 历史记录
```

左侧题目状态：

```text
P0001：待标
P0002：草稿
P0003：已提交
P0004：已打回
```

---

### Step 3：填写标注结果

Labeler 填写：

```text
preferred：A / B / tie
margin：明显优于 / 略优于 / 相当
dimensions：相关性 / 准确性 / 完整性 / 安全性 / 可读性 / 格式合规
safety_flag：是 / 否
annotator_note：判断理由
```

示例：

```json
{
  "preferred": "A",
  "margin": "明显优于",
  "dimensions": ["准确性", "完整性", "可读性"],
  "safety_flag": false,
  "annotator_note": "A 同时解释了过拟合的定义和通俗例子，B 只说训练得太好，信息过于笼统。"
}
```

---

### Step 4：AI 辅助标注，可选

Labeler 可点击：

```text
生成 AI 参考意见
```

系统生成：

```json
{
  "suggested_preferred": "A",
  "suggested_margin": "明显优于",
  "suggested_dimensions": ["准确性", "完整性", "可读性"],
  "suggested_note": "A 同时包含定义和类比，B 表述过于简略。"
}
```

Labeler 可以选择：

```text
采纳 AI 建议
忽略 AI 建议
基于 AI 建议修改后提交
```

---

### Step 5：保存草稿与提交

系统支持：

```text
自动保存草稿
手动保存草稿
提交当前题
提交并进入下一题
```

提交后生成 `AnnotationSubmission`：

```json
{
  "item_id": "P0001",
  "labeler_id": "L001",
  "round": 1,
  "answers": {
    "preferred": "A",
    "margin": "明显优于",
    "dimensions": ["准确性", "完整性", "可读性"],
    "safety_flag": false,
    "annotator_note": "A 同时解释了过拟合的定义和通俗例子，B 只说训练得太好，信息过于笼统。"
  },
  "status": "submitted"
}
```

---

## 6. AI 预审流程

Labeler 提交后，样本进入 AI 预审队列。

AI 预审输入：

```json
{
  "raw_data": {
    "prompt": "解释什么是过拟合，并给一个通俗例子。",
    "response_a": "...",
    "response_b": "..."
  },
  "annotation": {
    "preferred": "A",
    "margin": "明显优于",
    "dimensions": ["准确性", "完整性", "可读性"],
    "safety_flag": false,
    "annotator_note": "A 同时解释了过拟合的定义和通俗例子，B 只说训练得太好，信息过于笼统。"
  },
  "gold_answer": {
    "preferred": "A",
    "margin": "明显优于",
    "dimensions": ["准确性", "完整性", "可读性"],
    "safety_flag": false
  }
}
```

如果没有 Gold Sample，则 AI 基于规则和模型判断检查：

```text
是否漏填字段
preferred 与 annotator_note 是否一致
margin 与 preferred 是否符合规则
dimensions 是否合理
safety_flag 是否漏判
annotator_note 是否过短
```

如果有 Gold Sample，则额外检查：

```text
Labeler 提交结果是否与 gold_answer 一致
关键字段是否冲突
是否需要转人工复核
```

AI 预审输出：

```json
{
  "scores": {
    "relevance": 92,
    "accuracy": 88,
    "completeness": 85,
    "safety": 99,
    "overall": 90
  },
  "verdict": "pass",
  "reason": "偏好结论与理由一致，维度选择合理，未发现安全风险。",
  "route": "human_review_optional"
}
```

可能结果：

```text
pass：建议通过
reject：建议打回
manual：转人工复核
failed：AI 预审失败，等待重跑
```

---

## 7. Reviewer 人工审核流程

Reviewer 进入审核工作台，按照 AI 结论查看队列：

```text
AI 建议通过
AI 建议打回
转人工复核
AI 预审失败
```

审核详情页展示：

```text
原始题目
回答 A / 回答 B
模型来源，Reviewer 可见
Labeler 标注结果
Gold Answer，可选
AI 预审结果
历史版本
字段级 Diff
```

Reviewer 可以执行三种操作。

### 操作 1：通过入库

适用于标注质量合格的样本。

```text
状态：人工审核中 → 通过入库 → 已完成
```

---

### 操作 2：打回修改

适用于问题较明显，需要 Labeler 修改。

示例打回意见：

```text
请补充 A/B 在准确性和完整性上的具体差异，不能只写“A 更好”。
```

状态变化：

```text
人工审核中 → 已打回 → Labeler 修改中
```

Labeler 再次进入作业台时，会看到上一轮打回意见。

---

### 操作 3：直接修订并通过

适用于小问题，Reviewer 可直接修正后通过。

例如：

```text
dimensions:
["准确性", "可读性"]
→ ["准确性", "完整性", "可读性"]
```

状态变化：

```text
人工审核中 → Reviewer 直接修订 → 通过入库 → 已完成
```

---

## 8. 多轮标注与字段级 Diff

如果样本被打回，系统保留每轮提交。

第一轮：

```json
{
  "preferred": "A",
  "margin": "明显优于",
  "dimensions": ["准确性"],
  "safety_flag": false,
  "annotator_note": "A 更好。"
}
```

第二轮：

```json
{
  "preferred": "A",
  "margin": "明显优于",
  "dimensions": ["准确性", "完整性", "可读性"],
  "safety_flag": false,
  "annotator_note": "A 给出了过拟合定义和通俗例子，B 只有一句笼统描述，缺少泛化能力下降的说明。"
}
```

Diff 展示：

```text
dimensions:
准确性
+ 完整性
+ 可读性

annotator_note:
- A 更好。
+ A 给出了过拟合定义和通俗例子，B 只有一句笼统描述，缺少泛化能力下降的说明。
```

---

## 9. 最终结果入库

Reviewer 通过或直接修订后，系统生成最终结果 `FinalResult`。

```json
{
  "item_id": "P0001",
  "final_answer": {
    "preferred": "A",
    "margin": "明显优于",
    "dimensions": ["准确性", "完整性", "可读性"],
    "safety_flag": false,
    "annotator_note": "A 给出了过拟合定义和通俗例子，B 只有一句笼统描述，缺少泛化能力下降的说明。"
  },
  "review_status": "approved",
  "source_submission_id": "S001",
  "reviewer_id": "R001"
}
```

---

## 10. 最终导出流程

Owner 进入导出中心，选择导出配置。

### 10.1 导出范围

```text
全部样本
仅已通过样本
仅被打回样本
仅待审核样本
指定任务
指定批次
指定 Labeler
```

### 10.2 导出格式

```text
JSON
JSONL

```

### 10.3 导出内容

可选：

```text
原始题目字段
最终标注结果
AI 预审结果
人工审核结果
Gold Answer，可选
多轮历史，可选
字段级 Diff，可选
```

推荐默认导出：

```text
原始题目字段 + 最终标注结果 + 审核状态
```

---

### 10.4 JSON / JSONL 导出结构

```json
{
  "id": "P0001",
  "task_type": "知识问答",
  "lang": "zh",
  "prompt": "解释什么是过拟合，并给一个通俗例子。",
  "response_a": "过拟合指模型在训练集表现很好但泛化差。比如学生死记答案，考原题满分，换题就不会。",
  "response_b": "过拟合就是模型训练得太好了。",
  "annotation": {
    "preferred": "A",
    "margin": "明显优于",
    "dimensions": ["准确性", "完整性", "可读性"],
    "safety_flag": false,
    "annotator_note": "A 给出了定义和通俗例子，B 过于笼统。"
  },
  "ai_review": {
    "verdict": "pass",
    "overall": 90,
    "reason": "偏好结论与理由一致，维度选择合理。"
  },
  "human_review": {
    "status": "approved",
    "reviewer": "王芳",
    "comment": "通过",
    "reviewed_at": "2026-06-05 18:30:00"
  }
}
```

---



---

## 11. 完整链路总结

```text
Owner 上传 preference_compare 数据
→ 系统解析字段
→ 检测已有标注字段 preferred、margin、dimensions、safety_flag、annotator_note
→ Owner 选择导入模式：普通待标注 / Gold Sample / 演示数据
→ 系统区分原始题目字段与已有标注字段
→ 创建 Dataset 和 DatasetItem
→ 可选创建 GoldAnswer
→ Owner 基于数据字段创建模板
→ 配置展示区 Display Schema：prompt + A/B 双栏展示
→ 配置标注区 Annotation Schema：preferred、margin、dimensions、safety_flag、annotator_note
→ 配置校验规则和角色可见性
→ 使用真实样本预览模板
→ 发布任务并绑定数据集与模板
→ Labeler 领取任务
→ Labeler 查看 prompt、response_a、response_b，填写标注结果
→ 可选使用 AI 辅助标注
→ 提交 AnnotationSubmission
→ AI 预审检查规则、语义一致性与 Gold Sample 差异
→ Reviewer 根据 AI 结果进行人工复审
→ 通过 / 打回 / 直接修订
→ 打回样本进入下一轮修改，系统记录 Diff
→ 通过样本生成 FinalResult
→ Owner 在导出中心导出 JSON / JSONL 
→ 导出内容重新合并：原始样本 + 最终标注结果 + AI 预审 + 人工审核 + 历史记录
```

---

## 12. 设计亮点总结

本工作流的核心亮点不是简单上传文件和导出结果，而是：

1. **原始数据与标注结果解耦**  
   导入阶段区分 `prompt`、`response_a`、`response_b` 等原始字段，以及 `preferred`、`margin` 等已有标注字段。

2. **支持多种导入模式**  
   同一份自带答案的数据集可以作为普通待标注数据、Gold Sample 或演示数据使用。

3. **一个模板包含展示区和标注区**  
   展示区定义原始数据如何呈现，标注区定义 Labeler 需要提交什么结果。

4. **角色可见性控制**  
   `model_a`、`model_b` 可对 Labeler 隐藏，对 Reviewer / Owner 可见，减少标注偏见。

5. **AI 预审与 Gold Sample 质检**  
   系统可以基于规则、语义判断和标准答案对 Labeler 提交结果进行初审。

6. **人工复审支持打回与直接修订**  
   小问题 Reviewer 可直接修订，复杂问题可打回 Labeler 重新提交。

7. **最终导出重新合并全链路数据**  
   导出结果包含原始样本、最终标注结果、AI 预审、人工审核和多轮历史，形成完整闭环。
