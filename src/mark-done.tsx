import {
  Clipboard,
  showHUD,
  closeMainWindow,
  PopToRootType,
} from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import * as OpenCC from "opencc-js";
import pangu from "pangu";

/**
 * 將選取的文字每一行加上 ✅ 前綴
 * 使用者明確觸發此指令即代表要加 ✅，不做 block type 偵測
 * 觸發方式：必須用鍵盤快捷鍵（不能在 Raycast 手動搜尋觸發）
 */
export default async function Command() {
  try {
    // 1. 模擬 Cmd+C 複製選取的文字（與 format-text 相同做法）
    await runAppleScript(
      'tell application "System Events" to keystroke "c" using {command down}',
    );

    // 等待剪貼簿更新
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 2. 讀取剪貼簿
    const { text } = await Clipboard.read();

    if (!text || !text.trim()) {
      await showHUD("No text selected");
      return;
    }

    // 3. 對每一行加上 ✅ 前綴，並做中文轉換
    const converter = OpenCC.Converter({ from: "cn", to: "tw" });
    const processed = text
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line; // 保留空行
        return `✅ ${pangu.spacingText(converter(trimmed))}`;
      })
      .join("\n");

    // 4. 寫回剪貼簿並貼上
    await Clipboard.copy({ text: processed });
    await runAppleScript(
      'tell application "System Events" to keystroke "v" using {command down}',
    );

    await showHUD("✅ 已標記完成！");
    await closeMainWindow({ popToRootType: PopToRootType.Immediate });
  } catch (error) {
    await showHUD("Error: Could not process text");
    console.error(error);
  }
}
