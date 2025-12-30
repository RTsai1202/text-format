import { Clipboard, showHUD, closeMainWindow, PopToRootType } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import * as OpenCC from "opencc-js";
import pangu from "pangu";

export default async function Command() {
    try {
        // 1. Simulate Cmd+C to copy selected text
        // This bypasses getSelectedText() which was stripping newlines in some environments
        await runAppleScript('tell application "System Events" to keystroke "c" using {command down}');

        // Wait briefly for the clipboard to update
        await new Promise(resolve => setTimeout(resolve, 200));

        // 2. Read text from Clipboard
        const text = await Clipboard.readText();

        if (!text) {
            await showHUD("No text selected (Clipboard empty)");
            return;
        }

        // 3. Transform text
        const transformed = transformText(text);

        // 4. Paste back
        await Clipboard.paste(transformed);

        // 5. Show success message and close
        await showHUD("🎉 轉換成功！ 🎉");
        await closeMainWindow({ popToRootType: PopToRootType.Immediate });

    } catch (error) {
        await showHUD("Error: Could not process text");
        console.error(error);
    }
}

function transformText(text: string): string {
    const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

    // Normalize all vertical whitespace to standard \n FIRST
    // This ensures that subsequent regexes (which rely on \n) work correctly
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\r/g, '\n');
    text = text.replace(/\u2028/g, '\n'); // Line Separator
    text = text.replace(/\u2029/g, '\n'); // Paragraph Separator
    text = text.replace(/\u0085/g, '\n'); // Next Line
    text = text.replace(/\v/g, '\n');     // Vertical Tab
    text = text.replace(/\f/g, '\n');     // Form Feed

    // Preprocessing: 
    // 1. Remove Object Replacement Character (U+FFFC) and other common garbage
    text = text.replace(/\uFFFC/g, '');

    // 2. Handle existing newlines followed by bullets (Strip indentation)
    // Matches: Newline + optional whitespace (including NBSP/Ideographic) + bullet
    // Replaces with: Newline + "- "
    text = text.replace(/(\n)[ \t\u00A0\u3000]*[•・]/g, '$1- ');

    // 3. Handle inline bullets (Missing newlines)
    // Matches: Non-newline/non-indent char + optional whitespace + bullet
    // Replaces with: Char + Newline + "- "
    text = text.replace(/([^ \t\n\u00A0\u3000])[ \t\u00A0\u3000]*[•・]/g, '$1\n- ');

    // 4. Handle inline blockquotes
    text = text.replace(/([^ \t\n\u00A0\u3000])[ \t\u00A0\u3000]*>/g, '$1\n> ');

    // 5. Handle inline headers
    text = text.replace(/([^ \t\n\u00A0\u3000#])[ \t\u00A0\u3000]*(#+\s)/g, '$1\n$2');

    // 6. Handle start of string bullet (Strip indentation)
    text = text.replace(/^[ \t\u00A0\u3000]*[•・]/, '- ');

    const lines = text.split('\n');

    const newLines = [];
    let inCodeBlock = false;

    const replacements: Record<string, string> = {
        ',': '，',
        '.': '。',
        '?': '？',
        '!': '！',
        ':': '：',
        ';': '；',
        '(': '（',
        ')': '）'
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

        // Match Indentation
        const indentMatch = line.match(/^([ \t]*)/);
        if (indentMatch) {
            indent = indentMatch[1];
            content = line.substring(indent.length);
        }

        // Match Marker
        const bulletMatch = content.match(/^([•・]\s*)/);
        const taskMatch = content.match(/^([-*+]\s+\[[ xX]\]\s+)/);
        const orderedMatch = content.match(/^(\d+[\.)]\s*)/);
        const unorderedMatch = content.match(/^([-*+]\s+)/);
        const blockquoteMatch = content.match(/^(>\s*)/);
        const headerMatch = content.match(/^(#+\s+)/);

        if (bulletMatch) {
            marker = "- ";
            content = content.substring(bulletMatch[1].length);
        } else if (taskMatch) {
            marker = taskMatch[1];
            content = content.substring(marker.length);
        } else if (orderedMatch) {
            marker = orderedMatch[1];
            content = content.substring(marker.length);
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
        protect(/https?:\/\/[^\s]+/g); // URLs
        protect(/!{0,1}\[[^\]]*\]\([^)]+\)/g); // Links/Images
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

    let result = newLines.join('\n');

    // 處理結尾網址：如果文字最後是 URL，轉換為 source 格式
    // 先去除結尾空白來偵測
    const trimmedResult = result.trimEnd();
    
    // 偵測結尾是否為 URL（支援 http 和 https）
    // 使用較寬鬆的匹配：從最後一個 http(s):// 開始到結尾
    const trailingUrlMatch = trimmedResult.match(/\n?(https?:\/\/[^\s]+)$/);
    
    if (trailingUrlMatch) {
        const url = trailingUrlMatch[1];
        // 找到 URL 在 trimmedResult 中的起始位置
        const urlStartIndex = trimmedResult.lastIndexOf(url);
        // 取得 URL 之前的內容
        let beforeUrl = trimmedResult.substring(0, urlStartIndex).trimEnd();
        
        // 組合新格式
        if (beforeUrl.length > 0) {
            // 有其他內文：內文 + 換行 + --- + 換行 + source: URL
            result = beforeUrl + '\n---\nsource: ' + url;
        } else {
            // 只有網址：直接 --- + 換行 + source: URL
            result = '---\nsource: ' + url;
        }
    }

    return result;
}
