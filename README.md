# Extension RPC

A customizable Discord Rich Presence extension for Visual Studio Code.

Extension RPC displays the current workspace, active file, programming language, elapsed session time, and one of eight project icons on Discord.

## Features

- Stable automatic icon assignment for every project
- Eight custom Rich Presence icons
- Git remote-based project identification
- Workspace path fallback for local projects
- Customizable Rich Presence text
- Active file and language detection
- Optional elapsed session time
- Per-workspace icon override
- Automatic Discord reconnection
- Multi-root workspace support

## Requirements

- Visual Studio Code
- Discord Desktop running on the same computer
- Activity sharing enabled in Discord

Discord in a web browser cannot receive local Rich Presence connections.

## Settings

| Setting | Description |
| --- | --- |
| `extensionRpc.enabled` | Enables or disables Rich Presence |
| `extensionRpc.detailsFormat` | Controls the primary presence text |
| `extensionRpc.stateFormat` | Controls the secondary presence text |
| `extensionRpc.largeImageTextFormat` | Controls the image tooltip |
| `extensionRpc.showElapsedTime` | Shows or hides the session timer |
| `extensionRpc.iconOverride` | Selects an icon manually, or uses automatic mapping |

## Template Variables

The following variables can be used inside the text settings:

| Variable | Value |
| --- | --- |
| `{project}` | Current workspace name |
| `{file}` | Active file name |
| `{language}` | Active VS Code language ID |
| `{icon}` | Selected Rich Presence asset key |

Example:

```text
Working on {project}
Editing {file} • {language}