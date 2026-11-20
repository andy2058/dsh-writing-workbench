# 老欧拾光记 · 排版（公众号 Markdown 方言 + 行内样式渲染）

把定稿排成「粘进公众号编辑器不丢样式」的稿子。方法参考开源项目
[luobo-gzh-design](https://github.com/zhouwei713/luobo-gzh-design)（公众号 Markdown 排版系统），
结合老欧写作工作台的 ⑥ 排版环节使用。

## 分工

- **你（模型）**：只加排版结构，输出 Markdown（下方方言），**不改写正文**。
- **工作台**：把这份 Markdown 渲染成**行内样式 HTML**（6 套风格方案任选），你不需要手写 HTML。

## 方言（只准用这些）

| 用途 | 写法 |
| --- | --- |
| 一级标题 | `# 01 | 主标题 | /// 小字副标题` |
| 二级标题 | `## STEP01 | 小节标题` |
| 三级标题 | `### 标签 | 小节标题` |
| 四级标题 | `#### 段落小标题` |
| 强调 | `**加粗**`、`*斜体*`、`` `行内代码` `` |
| 引用 | `> 引用内容` |
| 分割线 | `---`（独占一行，上下留空行） |
| 列表 | `- 项目` / `1. 项目` |
| 表格 | 标准 Markdown 表格（第二行 `:---` 控制对齐） |
| 图片 | `![说明](地址)`；同一行多张 = 横排图组 |
| 局部变色 | `## STEP02 | <span style="color:#059669">深度解析</span>` |

## 四个组件（不要发明别的标签）

```
<SummaryCard title="本文要点">
- 要点一
- 要点二
</SummaryCard>

<InfoCard title="提示">
普通文字，可多行，可以有 **加粗** 和 `行内代码`。
</InfoCard>

<ScrollCard title="接口返回" height="220" hint="滑动查看">
长内容（日志 / 代码 / 数据），内部可以是完整 Markdown。
</ScrollCard>

<LongImageCard title="完整长图" height="360" hint="上下滑动查看">
![长图说明](https://example.com/long.jpg)
</LongImageCard>
```

原则：SummaryCard 全文一般一个；InfoCard 每章最多一个；ScrollCard / LongImageCard 只包原文已有的长内容，不为用组件而造内容。

## 六套风格方案（工作台里可选，渲染时自动套用）

| 方案 | 气质 | 纸色 | 墨色 | 强调色 | 字号 / 行距 / 段距 |
| --- | --- | --- | --- | --- | --- |
| 玉石商务 `jade-business` | 克制清晰，方法论 / 复盘 | `#FFFFFF` | `#17211C` | `#059669` | 15 / 1.9 / 16 |
| 海盐杂志 `ocean-editorial` | 留白舒展，观点 / 品牌 | `#FCFCFA` | `#1F2937` | `#2563EB` | 15 / 2.0 / 22 |
| 暖橙报告 `amber-report` | 温暖醒目，案例 / 数据 | `#FFFCF8` | `#38251A` | `#EA580C` | 15 / 1.9 / 18 |
| 紫电科技 `violet-tech` | 锐利理性，产品 / 教程 | `#F8F7FC` | `#191529` | `#7C3AED` | 14 / 1.8 / 16 |
| 樱桃轻盈 `cherry-friendly` | 亲切活泼，清单 / 生活 | `#FFF9FA` | `#42232C` | `#E11D48` | 15 / 2.0 / 18 |
| 墨玉宋韵 `jade-classic` | 端正雅致，人文 / 长文 | `#FBFAF6` | `#27251F` | `#047857` | 15 / 2.1 / 22 |

## 公众号兼容底线（渲染器已内置，写稿时也要守住）

- 只用行内 `style`，不写 `class` / `id` / `<style>` / `<script>`。
- 不用 flex、grid、`position:fixed`、外链字体与外部 CSS —— 公众号编辑器会全部丢掉。
- 图片宽度用 100%，圆角用 `border-radius`，不要用 `overflow:hidden` 做裁切。
- `strong` 上不要挂背景/边框/字号，否则微信会「纠正」掉；强调色通过外层 `span` 承担。
- 表格不用 `border-collapse:collapse` 之外的边框技巧，单元格边框写在 `td` 上。

## 交付检查

1. 原文一句话没少（对比字数与段落数，允许只是加了标题与空行）。
2. 标题三段式齐全，卡片不嵌套、不滥用。
3. 全文只有一个 SummaryCard（如使用）；InfoCard 每章最多一个。
4. 直接交付 Markdown，不写解释。
