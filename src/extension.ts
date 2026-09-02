import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { Client } from '@xhayper/discord-rpc';

const APPLICATION_ID = '816277186272034827';
const ICON_COUNT = 23;
const SESSION_STARTED_AT = new Date();

type ActivityTypeSetting =
	| 'playing'
	| 'listening'
	| 'watching'
	| 'competing';

const ACTIVITY_TYPES = {
	playing: 0,
	listening: 2,
	watching: 3,
	competing: 5
} as const;

type TemplateValues = {
	project: string;
	file: string;
	language: string;
	icon: string;
};

type RpcStatus =
	| 'connecting'
	| 'connected'
	| 'reconnecting'
	| 'disabled';

type CommandQuickPickItem = vscode.QuickPickItem & {
	command: string;
};

type IconQuickPickItem = vscode.QuickPickItem & {
	value: number;
};

let rpcClient: Client | undefined;
let rpcReady = false;
let currentActivitySignature: string | undefined;
let updateTimer: ReturnType<typeof setTimeout> | undefined;
let forceScheduledUpdate = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempt = 0;
let statusBarItem: vscode.StatusBarItem | undefined;
let connecting = false;
let extensionDisposed = false;

export function activate(context: vscode.ExtensionContext) {
	extensionDisposed = false;

	const statusItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);

	statusItem.name = 'Extension RPC';
	statusItem.command = 'extensionRpc.openControlMenu';
	statusItem.tooltip = 'Open Extension RPC controls';
	statusItem.show();

	statusBarItem = statusItem;
	setStatusBar('connecting');

	context.subscriptions.push(
		statusItem,

		vscode.commands.registerCommand(
			'extensionRpc.openControlMenu',
			openControlMenu
		),

		vscode.commands.registerCommand(
			'extensionRpc.toggle',
			togglePresence
		),

		vscode.commands.registerCommand(
			'extensionRpc.selectIcon',
			selectProjectIconOverride
		),

		vscode.commands.registerCommand(
			'extensionRpc.reconnect',
			reconnectToDiscord
		),

		vscode.commands.registerCommand(
			'extensionRpc.openSettings',
			() =>
				vscode.commands.executeCommand(
					'workbench.action.openSettings',
					'Extension RPC'
				)
		),

		vscode.window.onDidChangeActiveTextEditor(() => {
			scheduleActivityUpdate();
		}),

		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			scheduleActivityUpdate(true);
		}),

		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('extensionRpc')) {
				scheduleActivityUpdate(true);
			}
		}),

		{
			dispose: stopExtension
		}
	);

	void connectToDiscord();
}

function setStatusBar(
	status: RpcStatus,
	detail?: string
): void {
	if (!statusBarItem) {
		return;
	}

	switch (status) {
		case 'connecting':
			statusBarItem.text = '$(sync~spin) RPC: Connecting';
			statusBarItem.tooltip = 'Connecting to Discord';
			break;

		case 'connected':
			statusBarItem.text =
				`$(broadcast) RPC: ${detail ?? 'Connected'}`;
			statusBarItem.tooltip =
				`Connected to Discord using ${detail ?? 'automatic icon'}`;
			break;

		case 'reconnecting':
			statusBarItem.text =
				`$(debug-disconnect) RPC: Retry ${detail ?? ''}`;
			statusBarItem.tooltip =
				`Discord disconnected. Retrying in ${detail ?? 'a moment'}`;
			break;

		case 'disabled':
			statusBarItem.text = '$(circle-slash) RPC: Off';
			statusBarItem.tooltip = 'Discord Rich Presence is disabled';
			break;
	}
}

async function openControlMenu(): Promise<void> {
	const selected =
		await vscode.window.showQuickPick<CommandQuickPickItem>(
			[
				{
					label: '$(power) Toggle Rich Presence',
					description: 'Enable or disable presence',
					command: 'extensionRpc.toggle'
				},
				{
					label: '$(symbol-color) Select Project Icon',
					description: 'Automatic or rpc_1 through rpc_8',
					command: 'extensionRpc.selectIcon'
				},
				{
					label: '$(refresh) Reconnect to Discord',
					description: 'Restart the local RPC connection',
					command: 'extensionRpc.reconnect'
				},
				{
					label: '$(gear) Open Settings',
					description: 'Customize text and behavior',
					command: 'extensionRpc.openSettings'
				}
			],
			{
				placeHolder: 'Extension RPC controls'
			}
		);

	if (selected) {
		await vscode.commands.executeCommand(selected.command);
	}
}

function getEditableSettings(): {
	settings: vscode.WorkspaceConfiguration;
	target: vscode.ConfigurationTarget;
} {
	const folder = getActiveWorkspaceFolder();
	const hasWorkspace =
		(vscode.workspace.workspaceFolders?.length ?? 0) > 0;

	return {
		settings: vscode.workspace.getConfiguration(
			'extensionRpc',
			folder?.uri
		),
		target: hasWorkspace
			? vscode.ConfigurationTarget.Workspace
			: vscode.ConfigurationTarget.Global
	};
}

async function togglePresence(): Promise<void> {
	const { settings, target } = getEditableSettings();
	const enabled = settings.get<boolean>('enabled', true);

	await settings.update('enabled', !enabled, target);

	vscode.window.setStatusBarMessage(
		`Extension RPC ${enabled ? 'disabled' : 'enabled'}.`,
		2500
	);
}

async function selectProjectIconOverride(): Promise<void> {
	const { settings, target } = getEditableSettings();
	const currentIcon = settings.get<number>('iconOverride', 0);

	const items: IconQuickPickItem[] = [
		{
			label: '$(sync) Automatic',
			description:
				currentIcon === 0
					? 'Current • stable project mapping'
					: 'Stable project mapping',
			value: 0
		}
	];

	for (let icon = 1; icon <= ICON_COUNT; icon++) {
		items.push({
			label: `$(file-media) rpc_${icon}`,
			description:
				currentIcon === icon ? 'Current' : undefined,
			value: icon
		});
	}

	const selected =
		await vscode.window.showQuickPick<IconQuickPickItem>(
			items,
			{
				placeHolder: 'Select an icon for this workspace'
			}
		);

	if (!selected || selected.value === currentIcon) {
		return;
	}

	await settings.update(
		'iconOverride',
		selected.value,
		target
	);

	scheduleActivityUpdate(true);
}

async function reconnectToDiscord(): Promise<void> {
	if (extensionDisposed) {
		return;
	}

	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = undefined;
	}

	reconnectAttempt = 0;
	connecting = false;
	rpcReady = false;
	currentActivitySignature = undefined;

	const client = rpcClient;
	rpcClient = undefined;

	setStatusBar('connecting');

	if (client) {
		await shutdownRpcClient(client);
	}

	if (!extensionDisposed) {
		await connectToDiscord();
	}
}

async function connectToDiscord(): Promise<void> {
	if (
		extensionDisposed ||
		connecting ||
		rpcReady
	) {
		return;
	}

	setStatusBar('connecting');
	connecting = true;

	const client = new Client({
		clientId: APPLICATION_ID
	});

	rpcClient = client;

	client.on('ready', () => {
		if (extensionDisposed || rpcClient !== client) {
			return;
		}

		connecting = false;
		rpcReady = true;
		reconnectAttempt = 0;
		currentActivitySignature = undefined;

		console.log('[Extension RPC] Connected to Discord.');
		scheduleActivityUpdate(true);
	});

	client.on('disconnected', () => {
		if (extensionDisposed || rpcClient !== client) {
			return;
		}

		connecting = false;
		rpcReady = false;
		currentActivitySignature = undefined;
		rpcClient = undefined;

		console.log('[Extension RPC] Discord disconnected.');

		void retireRpcClient(client);
		scheduleReconnect();
	});

	try {
		await client.login();
	} catch (error) {
		if (extensionDisposed || rpcClient !== client) {
			return;
		}

		connecting = false;
		rpcReady = false;
		currentActivitySignature = undefined;
		rpcClient = undefined;

		console.log(
			'[Extension RPC] Connection failed:',
			error
		);

		await retireRpcClient(client);
		scheduleReconnect();
	}
}

function scheduleReconnect(): void {
	if (extensionDisposed || reconnectTimer) {
		return;
	}

	reconnectAttempt++;

	const delay = Math.min(
		5000 * 2 ** (reconnectAttempt - 1),
		30000
	);

	setStatusBar('reconnecting', `${delay / 1000}s`);

	console.log(
		`[Extension RPC] Reconnecting in ${delay / 1000}s.`
	);

	reconnectTimer = setTimeout(() => {
		reconnectTimer = undefined;
		void connectToDiscord();
	}, delay);
}

async function retireRpcClient(client: Client): Promise<void> {
	client.removeAllListeners();

	try {
		await client.destroy();
	} catch {
		// The transport may already be closed.
	}
}

async function shutdownRpcClient(
	client: Client
): Promise<void> {
	try {
		await client.user?.clearActivity();
	} catch {
		// Discord may already be closed.
	}

	await retireRpcClient(client);
}

function stopExtension(): void {
	if (extensionDisposed) {
		return;
	}

	extensionDisposed = true;
	connecting = false;
	rpcReady = false;
	currentActivitySignature = undefined;

	if (updateTimer) {
		clearTimeout(updateTimer);
		updateTimer = undefined;
	}

	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = undefined;
	}

	const client = rpcClient;
	rpcClient = undefined;

	if (client) {
		void shutdownRpcClient(client);
	}

	statusBarItem?.hide();
}

function scheduleActivityUpdate(force = false): void {
	forceScheduledUpdate ||= force;

	if (updateTimer) {
		clearTimeout(updateTimer);
	}

	updateTimer = setTimeout(() => {
		const shouldForce = forceScheduledUpdate;

		updateTimer = undefined;
		forceScheduledUpdate = false;

		void updateActivity(shouldForce);
	}, 400);
}

async function updateActivity(force = false): Promise<void> {
	if (!rpcReady || !rpcClient?.user) {
		return;
	}

	const folder = getActiveWorkspaceFolder();
	const settings = vscode.workspace.getConfiguration(
		'extensionRpc',
		folder?.uri
	);

	const enabled = settings.get<boolean>('enabled', true);
	const user = rpcClient.user;

	if (!enabled) {
		setStatusBar('disabled');

		if (currentActivitySignature !== 'disabled') {
			await user.clearActivity();
			currentActivitySignature = 'disabled';
		}

		return;
	}

	const document = vscode.window.activeTextEditor?.document;
	const projectName = folder?.name ?? 'No project open';
	const fileName = document
		? basename(document.fileName)
		: 'No file open';
	const language = document?.languageId ?? 'Unknown';

	const projectIdentity = folder
		? await getProjectIdentity(folder)
		: 'no-workspace';

	const automaticIcon = selectProjectIcon(projectIdentity);
	const iconOverride = settings.get<number>('iconOverride', 0);

	const iconKey =
		Number.isInteger(iconOverride) &&
			iconOverride >= 1 &&
			iconOverride <= ICON_COUNT
			? `rpc_${iconOverride}`
			: automaticIcon;

	const values: TemplateValues = {
		project: projectName,
		file: fileName,
		language,
		icon: iconKey
	};

	const details = resolveTemplate(
		settings.get<string>(
			'detailsFormat',
			'Working on {project}'
		),
		values
	);

	const state = resolveTemplate(
		settings.get<string>(
			'stateFormat',
			'Editing {file}'
		),
		values
	);

	const largeImageText = resolveTemplate(
		settings.get<string>(
			'largeImageTextFormat',
			'{project} • {language}'
		),
		values
	);

	const showElapsedTime = settings.get<boolean>(
		'showElapsedTime',
		true
	);

	const activitySignature = JSON.stringify({
		details,
		state,
		largeImageText,
		iconKey,
		showElapsedTime
	});

	if (!force && activitySignature === currentActivitySignature) {
		return;
	}

	try {
		await user.setActivity({
			details,
			state,
			startTimestamp: showElapsedTime
				? SESSION_STARTED_AT
				: undefined,
			largeImageKey: iconKey,
			largeImageText,
			instance: false
		});

		currentActivitySignature = activitySignature;

		console.log(
			`[Extension RPC] ${projectName} → ${iconKey}`
		);

		setStatusBar('connected', iconKey);

	} catch (error) {
		console.error(
			'[Extension RPC] Failed to update activity:',
			error
		);
	}
}

function getActiveWorkspaceFolder():
	vscode.WorkspaceFolder | undefined {
	const activeDocument =
		vscode.window.activeTextEditor?.document.uri;

	if (activeDocument) {
		const activeFolder =
			vscode.workspace.getWorkspaceFolder(activeDocument);

		if (activeFolder) {
			return activeFolder;
		}
	}

	return vscode.workspace.workspaceFolders?.[0];
}

async function getProjectIdentity(
	folder: vscode.WorkspaceFolder
): Promise<string> {
	if (folder.uri.scheme === 'file') {
		const gitRemote = await readGitRemote(folder.uri.fsPath);

		if (gitRemote) {
			return `git:${normalizeIdentity(gitRemote)}`;
		}
	}

	return `workspace:${normalizeIdentity(folder.uri.toString())}`;
}

function readGitRemote(
	workingDirectory: string
): Promise<string | undefined> {
	return new Promise((resolve) => {
		execFile(
			'git',
			['config', '--get', 'remote.origin.url'],
			{
				cwd: workingDirectory,
				windowsHide: true,
				encoding: 'utf8'
			},
			(error, stdout) => {
				if (error) {
					resolve(undefined);
					return;
				}

				const remote = stdout.trim();
				resolve(remote || undefined);
			}
		);
	});
}

function normalizeIdentity(value: string): string {
	return value
		.trim()
		.replace(/\\/g, '/')
		.replace(/\.git$/i, '')
		.toLowerCase();
}

function selectProjectIcon(projectIdentity: string): string {
	let hash = 2166136261;

	for (let index = 0; index < projectIdentity.length; index++) {
		hash ^= projectIdentity.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	const iconNumber = ((hash >>> 0) % ICON_COUNT) + 1;
	return `rpc_${iconNumber}`;
}

function resolveTemplate(
	template: string,
	values: TemplateValues
): string | undefined {
	const resolved = template
		.replace(
			/\{(project|file|language|icon)\}/g,
			(_match, key: string) =>
				values[key as keyof TemplateValues]
		)
		.trim();

	if (resolved.length < 2) {
		return undefined;
	}

	return resolved.slice(0, 128);
}

export function deactivate() {
	stopExtension();
}