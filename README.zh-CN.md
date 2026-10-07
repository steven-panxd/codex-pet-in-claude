# Codex Pet for Claude Code

[English](README.md) | 简体中文

把你的 Codex 宠物养在 Claude Code 的输入框上方。Claude 干活时它跟着干活，需要你时它等你，一轮结束时它跳一下庆祝。

插件读取你本机已有的、Codex 宠物格式的宠物，在 Claude Code 桌面应用和能显示图片的终端里把它画出来。在其他终端里，宠物是一个跟随同样状态变化的小表情。除了一只原创的小宠物 Blob（找不到 Codex 宠物时显示），仓库里不包含任何宠物美术素材。

> 非官方的社区插件，与 OpenAI、Anthropic 均无关联，也未获其认可或赞助。"Codex" 是 OpenAI 的商标，"Claude" 是 Anthropic 的商标。

## 它会显示什么

| 会话里发生的事 | 宠物 |
| --- | --- |
| 一轮正在运行 | `running`（工作中） |
| Claude 向你提问、等你批准计划，或某个工具需要权限 | `waiting`（等你） |
| 某次工具调用失败 | 短暂的 `failed`（你拒绝的、或你打断的那一轮不算） |
| 一轮结束 | `jumping` 跳一下，然后 `review` 20 秒，再回到 `idle` |
| 一轮因出错结束 | `failed` 6 秒 |
| 你打断了一轮 | `idle` |
| 一轮结束但后台代理还在跑 | 保持 `running` 直到它们结束（后台 shell 命令不算） |
| 会话开始 | `waving`（挥手） |

## 环境要求

- Claude Code 2.1.289 或更新，并且支持插件的 function hooks。这是 Anthropic 正在逐步放量的早期接口：以后的版本可能有变化，**你的账号也可能还没开通**。见[宠物没出现](#宠物没出现)。
- `PATH` 里有 Node.js 18 或更新（或 Bun），用来转换宠物的精灵图。没有的话插件仍能运行，只显示 Blob。
- 精灵图是 WebP 的宠物（大多数都是）还需要以下之一：macOS（用系统自带的 `sips`）、libwebp 的 `dwebp`、ImageMagick、`ffmpeg`，或装了 Pillow 的 Python。PNG 精灵图不需要。

## 安装

```bash
claude plugin marketplace add steven-panxd/codex-pet-in-claude
```

```bash
claude plugin install codex-pet@codex-pet
```

装完重新打开 Claude Code。

## 显示哪只宠物

默认设置 `auto` 按这个顺序选：

1. 你装在 `~/.codex/pets` 里的宠物（比如用 `npx petdex install <slug>` 装的，或在 Codex 里孵化的），
2. Codex 桌面应用自带的默认宠物（需装有该应用，仅 macOS），
3. Blob。

`/pet list` 列出找到的所有宠物，`/pet use <id>` 切换，选择会跨会话记住。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/pet` | 显示当前是哪只宠物，并列出命令 |
| `/pet list` | 列出本机找到的宠物 |
| `/pet use <id>` | 切换到某只宠物并记住 |
| `/pet use auto` | 回到跟随 `pet` 设置 |
| `/pet refresh` | 重新转换当前宠物，忽略缓存 |
| `/pet hide`、`/pet show` | 本次会话隐藏或恢复宠物 |
| `/pet <mood>` | 预览某个状态 6 秒：`idle`、`running`、`waiting`、`review`、`failed`、`jumping`、`waving`、`running-left`、`running-right` |

## 设置

在 `/config` 里，插件名下面。

| 设置 | 取值 | 默认 | 说明 |
| --- | --- | --- | --- |
| `pet` | `auto` 或某只宠物的 id | `auto` | 除非用 `/pet use` 另选，否则显示它 |
| `size` | `small`、`medium`、`large` | `medium` | 桌面端：高 72、104、156 像素。终端图片：4、6、9 行。终端色块：`small` 是 7 行，其余 13 行 |
| `animation` | `lively`、`calm`、`still` | `calm` | `calm` 让待机、等待、待审查的宠物动一遍后休息；`still` 每个状态只画一帧 |
| `label` | 开、关 | 开 | 宠物旁边的名字和当前状态 |
| `align` | `left`、`center`、`right` | `left` | 宠物在输入框上方那一栏里靠左、居中还是靠右 |
| `terminalStyle` | `auto`、`picture`、`face`、`blocks` | `auto` | 终端里用什么方式画宠物，见下文 |
| `terminalCells` | `standard`、`tall` | `standard` | 用于终端图片和色块。如果宠物在你的终端里看起来被拉高了（行距较大），设为 `tall`，宠物会画得更宽以保持比例 |

## 各端的效果

- **桌面应用**：宠物原图的像素，每帧最高 192×208，每个状态最多 32 色。
- **能显示图片的终端**（kitty、Ghostty）：宠物原图的像素，按 `size` 占 4、6 或 9 行。实验性功能：有测试覆盖，但还没在真实的 kitty 或 Ghostty 里试过。经过 tmux 或 ssh 时不启用；如果终端实际画不出图片，插件会自动退回表情。
- **其他终端**：用普通字符拼的小表情，颜色取宠物的主色，只占一行，比如 `(•‿•) Codex idle`。它会眨眼，一轮运行时带转圈，每种状态表情不同。一个字符格装不下足够的像素来还原宠物的画风，所以插件默认不硬画。
- **色块**：如果你还是想看到宠物的形状，把 `terminalStyle` 设为 `blocks`，用四分块字符画，13 行里 48×26 像素。认得出，但粗糙。

## 隐私

- 只读取 `~/.codex/pets`，以及（macOS 上）Codex 应用包里的宠物精灵图。不读 Codex 的任何其他内容：设置、会话、凭据都不碰。
- 转换后的帧缓存在 `~/.cache/codex-pet-claude`，可以随时删除。
- 不联网，不上传任何东西。
- Codex 应用自带的宠物是 OpenAI 的美术作品，只在你自己的机器上原地读取，本插件不包含也不分发它们。

## 宠物没出现

插件在任何账号上都能装上，但只有在 Claude Code 运行插件 function hooks 的地方宠物才会出现，而这项能力还在逐步放量（见于 Claude Code 2.1.292）。

1. 更新 Claude Code，然后重启。
2. 检查放量是否已到你的账号，下面的命令输出 `true` 表示已开通：

   ```bash
   grep -o '"tengu_plugin_hooks_modules": *[a-z]*' ~/.claude.json
   ```

3. 如果输出 `false` 或什么都没有，说明你的账号暂时还画不出宠物，本仓库无法改变这一点。可以先 star 或 watch，过段时间再试。
4. 如果输出 `true` 但仍然没有宠物，运行 `/pet`。有回复说明插件已加载：试试 `/pet show`，再试 `/pet list`。没有回复说明没装上或没启用：用 `claude plugin list` 检查。

## 已知限制

- 你批准权限请求后，宠物会停在 `waiting` 直到那次工具调用结束：Claude Code 没有为"批准"这个动作提供事件。终端里长时间运行的命令出现"转入后台"提示时会提前结束等待，桌面应用没有这个信号。
- Codex 应用自带的宠物只在 macOS 上能找到。
- 新版精灵图里的两行"朝向"帧，以及 `running-left` / `running-right`，没有对应的事件：宠物不会在屏幕上移动。
- 桌面应用里宠物靠每秒重画约 6 次来动，每帧约 50 KB。`calm` 下只有运行中的那一轮会持续动；`still` 完全不动。

更完整的说明（开发、测试）见[英文 README](README.md)。

## 许可

代码和 Blob 均为 MIT。见 [LICENSE](LICENSE)。
