import {
  Clipboard,
  showHUD,
  closeMainWindow,
  PopToRootType,
} from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import * as OpenCC from "opencc-js";
import pangu from "pangu";
import { writeFileSync } from "fs";
import { homedir } from "os";

/**
 * 中文數字轉阿拉伯數字（支援 1-99）
 * 例如：一 → 1, 十一 → 11, 二十三 → 23
 */
function chineseToArabic(chinese: string): number {
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  // 單一數字：一~九
  if (digits[chinese] !== undefined) {
    return digits[chinese];
  }

  // 剛好是「十」
  if (chinese === "十") {
    return 10;
  }

  // 十幾：十一~十九
  if (chinese.startsWith("十")) {
    const unit = chinese.substring(1);
    return 10 + (digits[unit] || 0);
  }

  // 幾十：二十、三十...九十
  if (chinese.endsWith("十")) {
    const tens = chinese.substring(0, chinese.length - 1);
    return (digits[tens] || 0) * 10;
  }

  // 幾十幾：二十一、三十五...九十九
  const tenIndex = chinese.indexOf("十");
  if (tenIndex > 0) {
    const tens = chinese.substring(0, tenIndex);
    const unit = chinese.substring(tenIndex + 1);
    return (digits[tens] || 0) * 10 + (digits[unit] || 0);
  }

  // 無法解析，返回 0
  return 0;
}

export default async function Command() {
  try {
    // 1. Simulate Cmd+C to copy selected text
    // This bypasses getSelectedText() which was stripping newlines in some environments
    await runAppleScript(
      'tell application "System Events" to keystroke "c" using {command down}',
    );

    // Wait briefly for the clipboard to update
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 2. Read text from Clipboard (including HTML format for rich text links)
    const { text, html } = await Clipboard.read();

    if (!text) {
      await showHUD("No text selected (Clipboard empty)");
      return;
    }

    // 2.5. Debug: 將輸入和輸出寫入文件
    const debugFile = `${homedir()}/raycast-debug.txt`;
    let debugInfo = "=== DEBUG: 原始輸入 ===\n";
    debugInfo += `text: ${JSON.stringify(text)}\n\n`;

    // 計算連續空行
    const inputLines = text.split("\n");
    debugInfo += `總行數: ${inputLines.length}\n`;
    debugInfo += `空行分布: `;
    inputLines.forEach((line, idx) => {
      if (line.trim() === "") debugInfo += `[${idx}] `;
    });
    debugInfo += `\n\n`;

    debugInfo += `html 長度: ${html ? html.length : 0}\n`;
    debugInfo += `html 完整內容:\n${html ? html : "無 HTML"}\n\n`;

    // 2.5. Transform text content
    const transformed = transformText(text);

    debugInfo += "=== DEBUG: 轉換後 ===\n";
    debugInfo += `transformed: ${JSON.stringify(transformed)}\n\n`;

    const outputLines = transformed.split("\n");
    debugInfo += `轉換後總行數: ${outputLines.length}\n`;
    debugInfo += `轉換後空行分布: `;
    outputLines.forEach((line, idx) => {
      if (line.trim() === "") debugInfo += `[${idx}] `;
    });
    debugInfo += `\n\n`;

    debugInfo += `時間: ${new Date().toLocaleString()}\n`;

    writeFileSync(debugFile, debugInfo);

    // 3. Prepare clipboard content
    // 智慧判斷：
    // - 如果 HTML 包含超連結，保留原始 HTML 格式
    // - 如果轉換後的文字包含列表，生成 HTML 列表格式
    // - 否則只用純文本
    if (html && /<a\s/i.test(html)) {
      // HTML 包含超連結，保留 HTML 格式
      const transformedHtml = processHtmlContent(html);
      await Clipboard.copy({ html: transformedHtml, text: transformed });
    } else if (hasListItems(transformed)) {
      // 轉換後包含列表，生成 HTML 格式讓 Heptabase 識別為真正的列表
      const generatedHtml = generateHtmlFromMarkdown(transformed);
      await Clipboard.copy({ html: generatedHtml, text: transformed });
    } else {
      // 純文本或沒有超連結的 HTML，只用純文本
      await Clipboard.copy({ text: transformed });
    }

    // 4. Paste back using AppleScript (preserves HTML format)
    await runAppleScript(
      'tell application "System Events" to keystroke "v" using {command down}',
    );

    // 5. Show success message and close
    await showHUD("🎉 轉換成功！ 🎉");
    await closeMainWindow({ popToRootType: PopToRootType.Immediate });
  } catch (error) {
    await showHUD("Error: Could not process text");
    console.error(error);
  }
}

function transformText(text: string): string {
  const converter = OpenCC.Converter({ from: "cn", to: "tw" });

  // Normalize all vertical whitespace to standard \n FIRST
  // This ensures that subsequent regexes (which rely on \n) work correctly
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\r/g, "\n");
  text = text.replace(/\u2028/g, "\n"); // Line Separator
  text = text.replace(/\u2029/g, "\n"); // Paragraph Separator
  text = text.replace(/\u0085/g, "\n"); // Next Line
  text = text.replace(/\v/g, "\n"); // Vertical Tab
  text = text.replace(/\f/g, "\n"); // Form Feed

  // Preprocessing:
  // 1. Remove Object Replacement Character (U+FFFC) and other common garbage
  // 有時候 ￼ 後面會跟著 Markdown 標記（如 ##），一併移除
  text = text.replace(/\uFFFC[#>\-*+]*/g, "");

  // 1.5. 反跳脫處理：移除有序列表數字後的反斜線
  // 例如：2\. → 2.  或  2\) → 2)
  text = text.replace(/(\d+)\\([.)])/g, "$1$2");

  // 2. 保護 URL（包含 <URL> 格式），避免後續處理誤判
  const urlPlaceholders: string[] = [];

  // 先保護 Markdown 連結（連同圖片語法），支援括號嵌套
  text = text.replace(/!?\[[^\]]*\]\((?:[^()]|\([^)]*\))*\)/g, (match) => {
    urlPlaceholders.push(match);
    return `__URL_PLACEHOLDER_${urlPlaceholders.length - 1}__`;
  });

  // 再保護獨立 URL，排除 ) 避免匹配 Markdown 結尾
  text = text.replace(/<?(https?:\/\/[^\s<>)]+)>?/g, (match) => {
    urlPlaceholders.push(match);
    return `__URL_PLACEHOLDER_${urlPlaceholders.length - 1}__`;
  });

  // 3. Handle existing newlines followed by bullets (Strip indentation)
  // Matches: Newline + optional whitespace (including NBSP/Ideographic) + bullet
  // Replaces with: Newline + "- "
  text = text.replace(/(\n)[ \t\u00A0\u3000]*[•・]/g, "$1- ");

  // 4. Handle inline bullets (Missing newlines)
  // Matches: Non-newline/non-indent char + optional whitespace + bullet
  // Replaces with: Char + Newline + "- "
  text = text.replace(
    /([^ \t\n\u00A0\u3000])[ \t\u00A0\u3000]*[•・]/g,
    "$1\n- ",
  );

  // 5. Handle inline blockquotes
  text = text.replace(/([^ \t\n\u00A0\u3000])[ \t\u00A0\u3000]*>/g, "$1\n> ");

  // 6. Handle inline headers
  text = text.replace(
    /([^ \t\n\u00A0\u3000#])[ \t\u00A0\u3000]*(#+\s)/g,
    "$1\n$2",
  );

  // 7. Handle start of string bullet (Strip indentation)
  text = text.replace(/^[ \t\u00A0\u3000]*[•・]/, "- ");

  // 7.5. Handle inline ordered lists (missing newlines)
  // 處理內嵌有序列表：「內容 1. 第一項 2. 第二項」→ 插入換行
  // 阿拉伯數字 + 點/頓號（排除括號開頭，避免拆散 (1) 格式）
  text = text.replace(
    /([^\s\d(（])[ \t\u00A0\u3000]*(\d+[.、])[ \t]*/g,
    "$1\n$2 ",
  );
  // 阿拉伯數字 + 右括號（獨立處理，前面不能是左括號）
  text = text.replace(
    /([^\s\d(（])[ \t\u00A0\u3000]*(\d+\))[ \t]*/g,
    "$1\n$2 ",
  );
  // 中文數字 + 頓號
  text = text.replace(
    /([^\s])[ \t\u00A0\u3000]*([一二三四五六七八九十]+、)/g,
    "$1\n$2",
  );
  // 括號格式：（一）或 (1)
  text = text.replace(
    /([^\s])[ \t\u00A0\u3000]*([（(][一二三四五六七八九十\d]+[)）])/g,
    "$1\n$2",
  );

  // 7.6. Handle existing newlines followed by ordered lists (Strip indentation)
  // 處理換行後的有序列表（移除縮排）
  text = text.replace(/(\n)[ \t\u00A0\u3000]*(\d+[.、)])/g, "$1$2");
  text = text.replace(
    /(\n)[ \t\u00A0\u3000]*([一二三四五六七八九十]+、)/g,
    "$1$2",
  );
  text = text.replace(
    /(\n)[ \t\u00A0\u3000]*([（(][一二三四五六七八九十\d]+[)）])/g,
    "$1$2",
  );

  // 7.7. Handle start of string ordered list (Strip indentation)
  // 處理字串開頭的有序列表（移除縮排）
  text = text.replace(/^[ \t\u00A0\u3000]*(\d+[.、)])/, "$1");
  text = text.replace(/^[ \t\u00A0\u3000]*([一二三四五六七八九十]+、)/, "$1");
  text = text.replace(
    /^[ \t\u00A0\u3000]*([（(][一二三四五六七八九十\d]+[)）])/,
    "$1",
  );

  // 8. 還原 URL
  urlPlaceholders.forEach((url, index) => {
    text = text.replace(`__URL_PLACEHOLDER_${index}__`, url);
  });

  const lines = text.split("\n");

  const newLines = [];
  let inCodeBlock = false;

  const replacements: Record<string, string> = {
    ",": "，",
    ".": "。",
    "?": "？",
    "!": "！",
    ":": "：",
    ";": "；",
    "(": "（",
    ")": "）",
  };

  for (const line of lines) {
    // Check for code block fence
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      newLines.push(line);
      continue;
    }

    // If inside code block, do not touch anything
    if (inCodeBlock) {
      newLines.push(line);
      continue;
    }

    // Process the line
    let indent = "";
    let marker = "";
    let content = line;

    // Match Indentation (包含普通空格、Tab、NBSP、全形空格)
    const indentMatch = line.match(/^([ \t\u00A0\u3000]*)/);
    if (indentMatch) {
      indent = indentMatch[1];
      content = line.substring(indent.length);
    }

    // 移除所有行的行首空格（包括列表、引用、標題等）
    indent = "";

    // Match Marker
    const bulletMatch = content.match(/^([•・]\s*)/);
    const taskMatch = content.match(/^([-*+]\s+\[[ xX]\]\s+)/);
    // 擴充有序列表：支援多種格式
    // 1. 阿拉伯數字 + 點/括號/頓號：1. 或 1) 或 1、
    const arabicOrderedMatch = content.match(/^(\d+)[.、)]\s*/);
    // 2. 中文數字 + 頓號：一、 或 十一、
    const chineseOrderedMatch =
      content.match(/^([一二三四五六七八九十]+)、\s*/);
    // 3. 括號格式：（一）或 (1) 或 （23）
    const parenOrderedMatch = content.match(
      /^[（(]([一二三四五六七八九十]+|\d+)[)）]\s*/,
    );
    const unorderedMatch = content.match(/^([-*+]\s+)/);
    const blockquoteMatch = content.match(/^(>\s*)/);
    const headerMatch = content.match(/^(#+\s+)/);

    if (bulletMatch) {
      marker = "- ";
      content = content.substring(bulletMatch[1].length);
    } else if (taskMatch) {
      marker = taskMatch[1];
      content = content.substring(marker.length);
    } else if (arabicOrderedMatch) {
      // 統一轉換為標準 Markdown 格式：N.
      const num = arabicOrderedMatch[1];
      marker = `${num}. `;
      content = content.substring(arabicOrderedMatch[0].length);
    } else if (chineseOrderedMatch) {
      // 中文數字轉阿拉伯數字
      const chineseNum = chineseOrderedMatch[1];
      const arabicNum = chineseToArabic(chineseNum);
      marker = `${arabicNum}. `;
      content = content.substring(chineseOrderedMatch[0].length);
    } else if (parenOrderedMatch) {
      // 括號格式：判斷是中文還是阿拉伯數字
      const numPart = parenOrderedMatch[1];
      let arabicNum: number;
      if (/^\d+$/.test(numPart)) {
        arabicNum = parseInt(numPart, 10);
      } else {
        arabicNum = chineseToArabic(numPart);
      }
      marker = `${arabicNum}. `;
      content = content.substring(parenOrderedMatch[0].length);
    } else if (unorderedMatch) {
      marker = unorderedMatch[1];
      content = content.substring(marker.length);
    } else if (blockquoteMatch) {
      marker = blockquoteMatch[1];
      content = content.substring(marker.length);
    } else if (headerMatch) {
      marker = headerMatch[1];
      content = content.substring(marker.length);
    }

    // Transform Content ONLY
    // 1. OpenCC
    content = converter(content);

    // 2. Punctuation & Markdown Protection
    const placeholders: string[] = [];
    const protect = (pattern: RegExp) => {
      content = content.replace(pattern, (match) => {
        placeholders.push(match);
        return `__PLACEHOLDER_${placeholders.length - 1}__`;
      });
    };

    protect(/`[^`]+`/g); // Inline code
    protect(/!?\[[^\]]*\]\((?:[^()]|\([^)]*\))*\)/g); // Links/Images - 優先保護，支援括號嵌套
    protect(/https?:\/\/[^\s)]+/g); // URLs - 改進，排除 ) 避免匹配 Markdown 結尾
    protect(/<[^>]+>/g); // HTML tags
    protect(/\.{2,}/g); // Consecutive periods (ellipsis-like)
    protect(/[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+/g); // Alphanumeric sequences with periods (e.g. a.b.c, v1.2.3)

    // 3. Replace Punctuation (Do this BEFORE Pangu to avoid unwanted spaces)
    for (const [k, v] of Object.entries(replacements)) {
      content = content.replaceAll(k, v);
    }

    // 4. Pangu (Do this AFTER punctuation replacement)
    content = pangu.spacingText(content);

    // Restore protections
    placeholders.forEach((pContent, index) => {
      content = content.replace(`__PLACEHOLDER_${index}__`, pContent);
    });

    newLines.push(indent + marker + content);
  }

  // 處理段落換行與延續段落縮排
  // 規則：
  // - 列表項目之間：維持單換行
  // - 標題後面：改成雙換行
  // - 引用區塊之間：維持單換行
  // - 普通段落之間：改成雙換行
  // - 列表後的普通段落：加 3 空格縮排
  const processedLines: string[] = [];
  let inListContext = false; // 追蹤是否在列表上下文中
  let inCodeBlockContext = false; // 追蹤是否在程式碼區塊中

  for (let i = 0; i < newLines.length; i++) {
    const currentLine = newLines[i];
    const nextLine = newLines[i + 1];

    // 判斷當前行的類型
    const isCurrentOrderedList = /^\d+[.)]\s/.test(currentLine);
    const isCurrentUnorderedList = /^[-*+]\s/.test(currentLine);
    const isCurrentList = isCurrentOrderedList || isCurrentUnorderedList;
    const isCurrentBlockquote = /^>/.test(currentLine);
    const isCurrentHeader = /^#+\s/.test(currentLine);
    const isCurrentCodeFence = /^```/.test(currentLine);
    const isEmptyLine = currentLine.trim() === "";

    // 程式碼區塊狀態追蹤
    if (isCurrentCodeFence) {
      inCodeBlockContext = !inCodeBlockContext;
      processedLines.push(currentLine);
      continue;
    }

    // 程式碼區塊內：不處理
    if (inCodeBlockContext) {
      processedLines.push(currentLine);
      continue;
    }

    // 處理延續段落縮排
    let lineToAdd = currentLine;
    if (
      inListContext &&
      !isEmptyLine &&
      !isCurrentBlockquote &&
      !isCurrentHeader
    ) {
      if (isCurrentOrderedList) {
        // 遇到新的有序列表項目，不縮排（它是同層級的項目）
        lineToAdd = currentLine;
      } else {
        // 無序列表或普通段落：加 3 空格縮排
        lineToAdd = "   " + currentLine;
      }
    }

    // 更新列表上下文狀態
    if (isCurrentOrderedList) {
      // 有序列表開啟列表上下文
      inListContext = true;
    } else if (isCurrentBlockquote || isCurrentHeader) {
      // 遇到引用或標題，重置列表上下文
      inListContext = false;
    }
    // 無序列表和空行不重置列表上下文（允許繼續縮排）

    processedLines.push(lineToAdd);

    // 如果沒有下一行，跳過段落間距處理
    if (nextLine === undefined) continue;

    // 如果當前行或下一行是空行，不處理段落間距
    if (isEmptyLine || nextLine.trim() === "") continue;

    // 判斷下一行的類型
    const isNextList = /^[-*+]\s|^\d+[.)]\s/.test(nextLine);
    const isNextBlockquote = /^>/.test(nextLine);
    const isNextCodeFence = /^```/.test(nextLine);

    // 程式碼區塊邊界：不加空行
    if (isCurrentCodeFence || isNextCodeFence) continue;

    // 列表項目之間：維持單換行（不加空行）
    if (isCurrentList && isNextList) continue;

    // 引用區塊之間：維持單換行（不加空行）
    if (isCurrentBlockquote && isNextBlockquote) continue;

    // 列表後接延續段落：維持單換行（不加空行）
    if (isCurrentList && !isNextList && !isNextBlockquote && !isNextCodeFence)
      continue;

    // 標題後面：加空行（雙換行）
    if (isCurrentHeader) {
      processedLines.push("");
      continue;
    }

    // 普通段落之間：加空行（雙換行）
    // 條件：當前行和下一行都不是特殊格式
    if (
      !isCurrentList &&
      !isNextList &&
      !isCurrentBlockquote &&
      !isNextBlockquote
    ) {
      processedLines.push("");
    }
  }

  let result = processedLines.join("\n");

  // 處理結尾網址：如果文字最後是 URL，轉換為 source 格式
  // 先去除結尾空白來偵測
  const trimmedResult = result.trimEnd();

  // 偵測結尾是否為 URL（支援 http 和 https）
  // 支援 Markdown 自動連結語法 <URL>
  // 使用較寬鬆的匹配：從最後一個 http(s):// 開始到結尾
  const trailingUrlMatch = trimmedResult.match(
    /\n?<?((https?:\/\/[^\s<>]+))>?$/,
  );

  if (trailingUrlMatch) {
    let url = trailingUrlMatch[1];
    // 移除 URL 結尾可能殘留的 > 字元
    url = url.replace(/>+$/, "");

    // 找到 URL 在 trimmedResult 中的起始位置（包含可能的 < 前綴）
    const urlPatternStart = trimmedResult.lastIndexOf(url);
    // 檢查 URL 前是否有 < 字元
    const actualStart =
      urlPatternStart > 0 && trimmedResult[urlPatternStart - 1] === "<"
        ? urlPatternStart - 1
        : urlPatternStart;

    // 取得 URL 之前的內容
    let beforeUrl = trimmedResult.substring(0, actualStart).trimEnd();

    // 組合新格式
    if (beforeUrl.length > 0) {
      // 有其他內文：內文 + 空行 + --- + 空行 + source: URL
      // 先移除末尾的所有 Heading 行（支持多級、有縮排、中文標題）
      beforeUrl = beforeUrl.replace(/(\n\s*#+\s+.*)*$/, "");
      // 再清理 beforeUrl 結尾的多餘空行和 Markdown 標記
      beforeUrl = beforeUrl.replace(/[\n\s#><\-*+￼]*$/, "");
      // 在 --- 前後加空行，避免 Heptabase 誤解為標題語法
      result = beforeUrl + "\n\n---\n\nsource: " + url;
    } else {
      // 只有網址：直接 --- + 空行 + source: URL
      result = "---\n\nsource: " + url;
    }
  }

  return result;
}

/**
 * Process HTML content by transforming text inside tags while preserving structure
 * Transforms text inside <a> tags while preserving the link structure
 * @param html HTML content from clipboard (e.g., from Heptabase)
 * @returns Transformed HTML with preserved link structure
 */
function processHtmlContent(html: string): string {
  // Transform text inside <a> tags while preserving the link
  return html.replace(
    /<a\s+([^>]*)>(.*?)<\/a>/gi,
    (match, attributes, innerText) => {
      // Remove HTML tags from inner text
      const plainText = innerText.replace(/<[^>]+>/g, "");

      // Apply transformations to the text
      const transformed = transformText(plainText);

      // Reconstruct the link with transformed text
      return `<a ${attributes}>${transformed}</a>`;
    },
  );
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate HTML from Markdown-formatted text
 * Converts ordered lists (1. item) and unordered lists (- item) to proper HTML
 * This allows Heptabase and other editors to recognize them as real lists
 */
function generateHtmlFromMarkdown(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inOrderedList = false;
  let inUnorderedList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for ordered list: "1. content" or "   1. content" (indented)
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    // Check for unordered list: "- content" or "   - content" (indented)
    const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
    // Check for header: "# content"
    const headerMatch = line.match(/^(#+)\s+(.*)$/);
    // Check for blockquote: "> content"
    const blockquoteMatch = line.match(/^>\s*(.*)$/);
    // Empty line
    const isEmpty = line.trim() === "";

    if (orderedMatch) {
      // Close unordered list if open
      if (inUnorderedList) {
        html += "</ul>";
        inUnorderedList = false;
      }
      // Start ordered list if not open
      if (!inOrderedList) {
        html += "<ol>";
        inOrderedList = true;
      }
      html += `<li>${escapeHtml(orderedMatch[3])}</li>`;
    } else if (unorderedMatch) {
      // Close ordered list if open
      if (inOrderedList) {
        html += "</ol>";
        inOrderedList = false;
      }
      // Start unordered list if not open
      if (!inUnorderedList) {
        html += "<ul>";
        inUnorderedList = true;
      }
      html += `<li>${escapeHtml(unorderedMatch[3])}</li>`;
    } else if (headerMatch) {
      // Close any open lists
      if (inOrderedList) {
        html += "</ol>";
        inOrderedList = false;
      }
      if (inUnorderedList) {
        html += "</ul>";
        inUnorderedList = false;
      }
      const level = headerMatch[1].length;
      html += `<h${level}>${escapeHtml(headerMatch[2])}</h${level}>`;
    } else if (blockquoteMatch) {
      // Close any open lists
      if (inOrderedList) {
        html += "</ol>";
        inOrderedList = false;
      }
      if (inUnorderedList) {
        html += "</ul>";
        inUnorderedList = false;
      }
      html += `<blockquote>${escapeHtml(blockquoteMatch[1])}</blockquote>`;
    } else if (isEmpty) {
      // Empty line - close lists but don't add content
      if (inOrderedList) {
        html += "</ol>";
        inOrderedList = false;
      }
      if (inUnorderedList) {
        html += "</ul>";
        inUnorderedList = false;
      }
    } else {
      // Regular text or indented continuation
      // Check if it's indented content under a list
      const indentMatch = line.match(/^(\s{3,})(.*)$/);
      if (indentMatch && (inOrderedList || inUnorderedList)) {
        // Indented content - treat as part of the list
        // Close and reopen to add as new item (simple approach)
        html += `<li>${escapeHtml(indentMatch[2])}</li>`;
      } else {
        // Close any open lists
        if (inOrderedList) {
          html += "</ol>";
          inOrderedList = false;
        }
        if (inUnorderedList) {
          html += "</ul>";
          inUnorderedList = false;
        }
        // Regular paragraph
        if (line.trim()) {
          html += `<p>${escapeHtml(line)}</p>`;
        }
      }
    }
  }

  // Close any remaining open lists
  if (inOrderedList) html += "</ol>";
  if (inUnorderedList) html += "</ul>";

  return `<meta charset="utf-8">${html}`;
}

/**
 * Check if text contains any list items
 */
function hasListItems(text: string): boolean {
  return /^\s*(\d+)\.\s+/m.test(text) || /^\s*[-*+]\s+/m.test(text);
}
