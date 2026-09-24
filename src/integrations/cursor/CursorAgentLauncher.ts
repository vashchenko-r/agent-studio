export interface CommandHost {
  getCommands(filterInternal: boolean): Thenable<string[]>;
  executeCommand(command: string): Thenable<unknown>;
}

export interface ClipboardHost {
  writeText(value: string): Thenable<void>;
}

export interface LaunchResult {
  invoked: false;
  openedChat: boolean;
  invocation: string;
  detail: string;
}

/**
 * Cursor's public extension API cannot start a subagent.
 * The native action is the documented /name invocation in Agent chat.
 */
export class CursorAgentLauncher {
  constructor(
    private readonly commands: CommandHost,
    private readonly clipboard: ClipboardHost,
  ) {}

  async launchText(invocation: string, detailWhenChatOpens: string): Promise<LaunchResult> {
    await this.clipboard.writeText(invocation);
    const available = await this.commands.getCommands(true);
    const openedChat = available.includes("composer.newAgentChat");
    if (openedChat) {
      await this.commands.executeCommand("composer.newAgentChat");
    }
    return {
      invoked: false,
      openedChat,
      invocation,
      detail: openedChat
        ? detailWhenChatOpens
        : "Cursor has no public API to run a subagent, and composer.newAgentChat is not available. The text was copied. Paste it into Agent chat.",
    };
  }
}
