# Heptabase 編輯器行為參考文件

本文件記錄 Heptabase 編輯器的運作邏輯、剪貼簿格式需求，以及如何讓貼上的內容被正確識別為原生格式。

## 目錄

1. [編輯器架構](#編輯器架構)
2. [剪貼簿格式](#剪貼簿格式)
3. [支援的 HTML 元素](#支援的-html-元素)
4. [列表處理](#列表處理)
5. [Heptabase 原生 HTML 格式](#heptabase-原生-html-格式)
6. [常見問題與解決方案](#常見問題與解決方案)
7. [實作範例](#實作範例)
8. [測試結果摘要](#測試結果摘要)
9. [內部資料模型（ProseMirror Document）](#內部資料模型prosemirror-document)

---

## 編輯器架構

### 技術基礎：ProseMirror

**重要發現**：Heptabase 使用 **[ProseMirror](https://prosemirror.net/)** 作為編輯器框架。

ProseMirror 是一個強大的富文字編輯器工具包，特點是：
- **文件模型（Document Model）**：內容以樹狀結構儲存，不是 Markdown
- **Schema 定義**：每種節點類型都有明確定義的結構
- **協同編輯支援**：支援多人同時編輯

> 官方客服曾說明：「Heptabase 不太屬於 markdown based，它有支援一些 markdown 語法的輸入與貼上，但是資料儲存的方式並不是 markdown」

### Block-Based 編輯器

Heptabase 使用 **區塊式編輯器**（類似 Notion），每個內容元素都是獨立的「區塊」：

- **段落區塊** (Paragraph)
- **標題區塊** (Heading 1-6)
- **有序列表區塊** (Numbered List)
- **無序列表區塊** (Bullet List)
- **引用區塊** (Blockquote)
- **程式碼區塊** (Code Block)
- **待辦事項區塊** (Todo/Checkbox)

### DOM 結構

編輯器的 DOM 元素具有以下特徵：

```html
<div class="ProseMirror ProseMirror-hepta-style">
  <!-- 內容區塊 -->
</div>
```

每個區塊都有 `data-node-type` 和 `data-node-id` 屬性：

```html
<p data-node-type="paragraph" data-node-id="uuid-here">內容</p>
<div data-node-type="numbered_list_item" data-node-id="uuid-here">...</div>
```

### 區塊 vs 純文字

**重要區別**：

| 類型 | 說明 | Tab 縮進 |
|------|------|----------|
| 真正的列表區塊 | 透過 HTML `<ol>/<ul>` 貼上或在編輯器中建立 | ✅ 可用 |
| 看起來像列表的文字 | 純文字 `1. item` 貼上 | ❌ 不可用 |

當貼上純文字 `1. item` 時，Heptabase 只會建立一個**段落區塊**，內容是文字 "1. item"，而非真正的列表區塊。

---

## 剪貼簿格式

### 格式優先順序

Heptabase 讀取剪貼簿時的優先順序：

1. **HTML 格式** (`text/html`) - 優先使用
2. **純文字格式** (`text/plain`) - 備用

### 設定剪貼簿（macOS）

使用 AppleScript 同時設定 HTML 和純文字：

```applescript
set htmlData to «data HTML{十六進位編碼的HTML}»
set theText to "純文字內容"
set the clipboard to {«class HTML»:htmlData, string:theText}
```

### HTML 格式要求

1. **必須包含 charset 宣告**：
   ```html
   <meta charset="utf-8">
   ```

2. **HTML 結構必須正確**：
   - 標籤必須正確關閉
   - 巢狀結構必須正確

---

## 支援的 HTML 元素

### 有序列表

```html
<ol>
  <li>第一項</li>
  <li>第二項</li>
</ol>
```

**效果**：建立真正的數字列表，支援 Tab 縮進

### 無序列表

```html
<ul>
  <li>項目 A</li>
  <li>項目 B</li>
</ul>
```

**效果**：建立真正的項目符號列表（•）

### 巢狀列表

```html
<ol>
  <li>父項目 1
    <ol>
      <li>子項目 1a</li>
      <li>子項目 1b</li>
    </ol>
  </li>
  <li>父項目 2</li>
</ol>
```

**效果**：
- 1. 父項目 1
  - a. 子項目 1a
  - b. 子項目 1b
- 2. 父項目 2

### 標題

```html
<h1>一級標題</h1>
<h2>二級標題</h2>
<h3>三級標題</h3>
```

**效果**：建立對應層級的標題區塊

### 段落

```html
<p>這是一個段落</p>
<p>這是另一個段落</p>
```

**效果**：建立獨立的段落區塊

### 引用區塊

```html
<blockquote>這是引用內容</blockquote>
```

**效果**：建立帶有垂直線的引用區塊

### 程式碼區塊

```html
<pre><code>console.log("Hello");</code></pre>
```

**效果**：建立程式碼區塊（有語法高亮）

### 連結

```html
<p>這裡有一個 <a href="https://example.com">連結</a></p>
```

**效果**：建立可點擊的超連結（藍色文字）

### 內嵌格式

```html
<p>這是 <strong>粗體</strong> 和 <em>斜體</em> 文字</p>
<p>這是 <code>行內程式碼</code></p>
```

---

## 列表處理

### 數字列表編號規則

Heptabase 的有序列表會**自動重新編號**：

- 貼上的列表會根據**上下文**調整編號
- 如果貼到現有列表的後面，編號會接續
- 巢狀層級使用不同格式：
  - 第一層：1, 2, 3...
  - 第二層：a, b, c...
  - 第三層：i, ii, iii...

### Tab 縮進行為

| 操作 | 效果 |
|------|------|
| Tab | 將當前項目縮進一層（變成上一項的子項目） |
| Shift+Tab | 將當前項目提升一層 |

**限制**：只有真正的列表區塊才支援 Tab 縮進

### 混合列表

有序和無序列表可以混合：

```html
<ol>
  <li>有序項目 1
    <ul>
      <li>無序子項目</li>
    </ul>
  </li>
</ol>
```

---

## Heptabase 原生 HTML 格式

從 Heptabase 複製內容時，會得到以下格式的 HTML：

### 基本結構

```html
<meta charset='utf-8'>
<ol>
  <li data-node-type="numbered_list_item" data-node-id="uuid">
    <p data-node-type="paragraph" data-node-id="uuid" class="_block_oewjo_1">
      內容文字
    </p>
  </li>
</ol>
```

### 特殊屬性

| 屬性 | 說明 |
|------|------|
| `data-node-type` | 區塊類型（numbered_list_item, paragraph 等） |
| `data-node-id` | 唯一識別碼（UUID 格式） |
| `class="_block_oewjo_1"` | Heptabase 內部樣式類別 |

### 簡化格式

**好消息**：貼上時不需要這些特殊屬性，標準 HTML 即可：

```html
<meta charset="utf-8"><ol><li>項目內容</li></ol>
```

---

## 常見問題與解決方案

### Q1: 貼上的列表無法用 Tab 縮進

**原因**：貼上的是純文字，不是 HTML 列表格式

**解決**：確保剪貼簿包含 `<ol><li>` 或 `<ul><li>` 格式的 HTML

### Q2: 列表編號錯誤

**原因**：Heptabase 會根據上下文自動重新編號

**解決**：這是正常行為，無需修正

### Q3: 巢狀結構不正確

**原因**：HTML 巢狀結構有誤

**正確格式**：
```html
<ol>
  <li>父項目
    <ol>
      <li>子項目</li>
    </ol>
  </li>
</ol>
```

**錯誤格式**：
```html
<ol>
  <li>父項目</li>
  <ol>
    <li>子項目</li>
  </ol>
</ol>
```

### Q4: 特殊字元顯示問題

**解決**：確保 HTML 中特殊字元已轉義：

| 字元 | 轉義 |
|------|------|
| `<` | `&lt;` |
| `>` | `&gt;` |
| `&` | `&amp;` |
| `"` | `&quot;` |
| `'` | `&#039;` |

---

## 實作範例

### TypeScript 函數：生成 Heptabase 相容 HTML

```typescript
function generateHtmlFromMarkdown(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inOrderedList = false;
  let inUnorderedList = false;

  for (const line of lines) {
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);

    if (orderedMatch) {
      if (inUnorderedList) {
        html += "</ul>";
        inUnorderedList = false;
      }
      if (!inOrderedList) {
        html += "<ol>";
        inOrderedList = true;
      }
      html += `<li>${escapeHtml(orderedMatch[3])}</li>`;
    } else if (unorderedMatch) {
      if (inOrderedList) {
        html += "</ol>";
        inOrderedList = false;
      }
      if (!inUnorderedList) {
        html += "<ul>";
        inUnorderedList = true;
      }
      html += `<li>${escapeHtml(unorderedMatch[3])}</li>`;
    } else {
      if (inOrderedList) {
        html += "</ol>";
        inOrderedList = false;
      }
      if (inUnorderedList) {
        html += "</ul>";
        inUnorderedList = false;
      }
      if (line.trim()) {
        html += `<p>${escapeHtml(line)}</p>`;
      }
    }
  }

  if (inOrderedList) html += "</ol>";
  if (inUnorderedList) html += "</ul>";

  return `<meta charset="utf-8">${html}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

---

## 測試結果摘要

| HTML 格式 | Heptabase 識別 | Tab 縮進 |
|-----------|----------------|----------|
| `<ol><li>` | ✅ 有序列表 | ✅ |
| `<ul><li>` | ✅ 無序列表 | ✅ |
| `<h1>` ~ `<h6>` | ✅ 標題 | N/A |
| `<p>` | ✅ 段落 | N/A |
| `<blockquote>` | ✅ 引用區塊 | N/A |
| `<pre><code>` | ✅ 程式碼區塊 | N/A |
| `<a href>` | ✅ 連結 | N/A |
| 巢狀 `<ol>` | ✅ 巢狀列表 | ✅ |

---

## 內部資料模型（ProseMirror Document）

### 文件結構

Heptabase 的內容以 **ProseMirror Document Model** 儲存，是一個樹狀結構：

```
doc (根節點)
├── heading (標題)
│   └── text (文字內容)
├── paragraph (段落)
│   └── text (文字內容)
├── numbered_list_item (有序列表項目)
│   ├── paragraph (項目內容)
│   │   └── text
│   └── numbered_list_item (巢狀列表)
│       └── paragraph
│           └── text
└── ...
```

### 節點類型（Node Types）

透過 JavaScript 存取 ProseMirror 編輯器狀態，可以發現以下節點類型：

| 節點類型 | 說明 | 屬性 |
|----------|------|------|
| `doc` | 根節點 | - |
| `heading` | 標題 | `id` (UUID), `level` (1-6) |
| `paragraph` | 段落 | `id` (UUID) |
| `numbered_list_item` | 有序列表項目 | `id`, `order`, `format` |
| `bullet_list_item` | 無序列表項目 | `id` |
| `blockquote` | 引用區塊 | `id` |
| `code_block` | 程式碼區塊 | `id`, `language` |
| `text` | 文字內容 | (可帶 marks) |

### 列表項目結構範例

一個有序列表項目的內部結構：

```json
{
  "type": "numbered_list_item",
  "attrs": {
    "id": "f6849448-b808-485a-9a7b-4ba8503675da",
    "order": null,
    "format": null
  },
  "children": [
    {
      "type": "paragraph",
      "children": [{ "type": "text", "text": "父項目 1" }]
    },
    {
      "type": "numbered_list_item",
      "children": [
        {
          "type": "paragraph",
          "children": [{ "type": "text", "text": "子項目 1a" }]
        }
      ]
    }
  ]
}
```

**重點**：
- 每個節點都有唯一的 `id`（UUID 格式）
- 列表的編號（`order`）由 Heptabase 自動計算，不儲存在資料中
- 巢狀列表是將 `numbered_list_item` 作為另一個 `numbered_list_item` 的子節點
- 實際文字內容在 `paragraph` 節點內的 `text` 節點中

### 存取內部狀態（開發者參考）

可以透過以下方式存取 ProseMirror 編輯器狀態：

```javascript
// 找到編輯器元素
const editor = document.querySelector('.ProseMirror');

// 存取 ProseMirror ViewDesc
const viewDesc = editor.pmViewDesc;

// 取得文件節點
const doc = viewDesc.node;

// 遍歷所有節點
doc.content.forEach(node => {
  console.log(node.type.name, node.attrs);
});
```

### API 端點

Heptabase 使用以下 API 端點儲存資料：

- `POST https://api.heptabase.com/v1/commit` - 提交變更

資料以 JSON 格式傳輸，包含變更的節點資訊。

---

## 更新紀錄

- **2026-01-11**：新增 ProseMirror 內部資料模型說明，記錄節點類型和存取方式
- **2026-01-11**：初版建立，記錄 HTML 列表格式需求與測試結果
