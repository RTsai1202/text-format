# Format Text (Raycast Extension)

這是一個 Raycast 外掛，用於格式化選取的文字。

## 功能

1.  **簡繁轉換**：自動將簡體中文轉換為台灣正體中文。
2.  **標點符號標準化**：將半形標點符號轉換為全形（例如 `,` -> `，`）。
3.  **列表轉換**：將 `•` 或 `・` 開頭的段落轉換為 Markdown 列表格式 (`- `)。

## 安裝與使用

本外掛為本地開發版本。

### 首次安裝

1.  確保已安裝 Node.js。
2.  在終端機進入本專案資料夾：
    ```bash
    cd /Users/answer4154/Desktop/轉換標點符號
    ```
3.  安裝依賴：
    ```bash
    npm install
    ```
4.  編譯專案：
    ```bash
    npm run build
    ```
5.  在 Raycast 中匯入此擴充功能（如果尚未匯入）：
    *   Raycast Settings -> Extensions -> `+` -> Import Extension -> 選擇本資料夾。

### 日常使用

1.  選取任何文字。
2.  呼叫 Raycast，搜尋 **Format Text**。
3.  按下 Enter 執行，文字將自動轉換並貼上。

### 更新或修改

如果您修改了程式碼 (`src/format-text.tsx`)，需要重新編譯才能生效：

```bash
npm run build
```

或者在開發時使用 `npm run dev` 來即時預覽修改。
