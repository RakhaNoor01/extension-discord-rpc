<div align="center">

<img src="images/icon.png" alt="Dly's Extension RPC icon" width="128" height="128">

# Dly's Extension RPC

A Confidant-themed Discord Rich Presence extension for Visual Studio Code.

</div>

---

## About

Dly's Extension RPC publishes your current Visual Studio Code activity to Discord. The presence can display the active project, file, programming language, elapsed session time, and a project-specific image.

Projects are assigned one of 23 Rich Presence images through deterministic mapping. The extension uses the project's Git remote as its identity when available and falls back to the workspace URI for local projects. This ensures that the same project retains the same image between sessions.


Show what you are working on through a customizable Discord activity, complete with project-aware Confidant-inspired artwork.
</div>


About
- Visual Studio Code `1.134.0` or newer
- Discord Desktop running on the same computer
- **Display current activity as a status message** enabled in Discord's Activity Privacy settings


Discord's web client cannot receive local Rich Presence connections.
Installation

Install from a VSIX package


Download the latest .vsix file from the repository releases.
The text settings support the following variables:

| Variable | Description |
| --- | --- |
| `{project}` | Name of the active workspace folder |
| `{file}` | Name of the active file |
| `{language}` | Visual Studio Code language identifier |
| `{icon}` | Selected Discord asset key |


Run Extensions: Install from VSIX....

Select the downloaded .vsix file.

Reload Visual Studio Code when prompted.

You can also install it from a terminal:

code --install-extension extension-rpc-0.2.0.vsix

Run from source

git clone YOUR_REPOSITORY_URL
cd extension-rpc
npm install
npm run compile

Open the project in Visual Studio Code and press F5 to start an Extension Development Host.

Commands

Open the Command Palette with Ctrl+Shift+P and search for Extension RPC.

Command

Description

Extension RPC: Open Control Menu

Opens the main Rich Presence controls.

Extension RPC: Toggle Rich Presence

Enables or disables the presence.

Extension RPC: Select Project Icon

Uses automatic mapping or selects an image manually.

Extension RPC: Reconnect to Discord

Restarts the local Discord RPC connection.

Extension RPC: Open Settings

Opens all extension settings.

Settings

Setting

Default

Description

extensionRpc.enabled

true

Enables or disables Discord Rich Presence.

extensionRpc.detailsFormat
```json

{
  "extensionRpc.detailsFormat": "Working on {project}",
  "extensionRpc.stateFormat": "Editing {file} • {language}",
  "extensionRpc.largeImageTextFormat": "{project} • {icon}"
}
```

Resolved fields are trimmed and limited to 128 characters. Fields shorter than two characters are omitted from the presence.

## Project Image Assignment

Automatic image selection follows these steps:

1. The extension determines the active workspace folder.
2. The normalized Git remote URL is used as the project identity when available.
3. The normalized workspace URI is used when no Git remote is configured.
4. The identity is hashed and mapped to an asset from `rpc_1` through `rpc_23`.

The mapping remains stable while the project identity and number of available assets remain unchanged.

To select an image manually, run **Extension RPC: Select Project Icon** and choose an asset. Select **Automatic** to restore project-based mapping.

## Building

Install dependencies, compile the extension, and create a VSIX package:

```sh
npm install
npm run compile
npx vsce package
```

The generated `.vsix` file can be installed manually or attached to a repository release.

## Troubleshooting

### Rich Presence is not visible

- Confirm that Discord Desktop is running.
- Confirm that activity sharing is enabled in Discord.
- Run **Extension RPC: Reconnect to Discord**.
- Reload Visual Studio Code and restart Discord if necessary.

### Discord displays an outdated image

Discord may cache Rich Presence assets. Restart Discord after replacing an asset in the Developer Portal. Keep the asset keys named `rpc_1` through `rpc_23`.

### The RPC connection is unavailable

The extension retries the connection automatically with a delay of up to 30 seconds. You can also reconnect manually from the control menu.

## Privacy

The extension uses Discord's local RPC connection to publish workspace information to the Discord Desktop client. It reads the active workspace name, file name, language identifier, and Git remote when constructing the activity.

## Credits and Disclaimer

This is an unofficial, fan-made project. It is not affiliated with, endorsed by, sponsored by, or officially connected to ATLUS, P-Studio, or SEGA.

Persona and its related names, characters, artwork, trademarks, and visual materials belong to their respective owners. No ownership is claimed over Persona-related material.

Attribution does not grant permission to redistribute copyrighted assets. Persona-related and other third-party visual assets are not covered by any license applied to the original source code.

## License

No source-code license has been provided for this repository. Unless a license is added, all rights to the original source code remain reserved by default.

Persona-related artwork, character images, trademarks, and other third-party materials remain the property of their respective rights holders.
