import * as path from 'path';
import * as vscode from 'vscode';
import { ExecuteCommandParams, ExecuteCommandRequest } from 'vscode-languageclient';
import { Utils } from 'vscode-uri';
import { ClientHandler } from '../clientHandler';

const LOCALMODULE = new vscode.ThemeIcon('symbol-folder', new vscode.ThemeColor('terminal.ansiBrightBlue'));
const TFREGISTRY = new vscode.ThemeIcon('extensions-view-icon', new vscode.ThemeColor('terminal.ansiBrightMagenta'));
const GITHUBMODULE = new vscode.ThemeIcon('github');

class TerraformModule extends vscode.TreeItem {
  constructor(
    public label: string,
    public provider: string,
    public version: string,
    public type: string,
    public doclink: string,
    public state: vscode.TreeItemCollapsibleState,
    public readonly children?: [TerraformModule],
  ) {
    super(label, state);
    if (this.version != '') {
      this.tooltip = `${this.provider}@${this.version}`;
      this.description = `${this.provider}@${this.version}`;
    } else {
      this.tooltip = `${this.provider}`;
      this.description = `${this.provider}`;
    }
  }

  iconPath = this.getIcon(this.type);

  getIcon(type: string) {
    const icon = this.terraformIcon();
    switch (type) {
      case 'tfregistry':
        return icon;
      case 'local':
        return LOCALMODULE;
      case 'github':
        return GITHUBMODULE;
      default:
        return TFREGISTRY;
    }
  }

  private terraformIcon() {
    // need current extension path to find icon svg
    // could possibly make this a custom icon
    const myExtDir = vscode.extensions.getExtension('hashicorp.terraform').extensionPath;
    const svg = vscode.Uri.file(path.join(myExtDir, 'assets', 'icons', 'terraform.svg'));
    const icon = {
      light: svg,
      dark: svg,
    };
    return icon;
  }
}

export class TerraformModuleProvider implements vscode.TreeDataProvider<TerraformModule> {
  private _onDidChangeTreeData: vscode.EventEmitter<TerraformModule | undefined | null | void> =
    new vscode.EventEmitter<TerraformModule | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TerraformModule | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(ctx: vscode.ExtensionContext, public handler: ClientHandler) {
    ctx.subscriptions.push(
      vscode.commands.registerCommand('terraform.modules.refreshList', () => this.refresh()),
      vscode.commands.registerCommand('terraform.modules.documentation', (module: TerraformModule) => {
        vscode.env.openExternal(vscode.Uri.parse(module.doclink));
      }),
      vscode.window.onDidChangeActiveTextEditor(async (event: vscode.TextEditor | undefined) => {
        if (event && vscode.workspace.workspaceFolders[0]) {
          this.refresh();
        }
      }),
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TerraformModule): TerraformModule | Thenable<TerraformModule> {
    return element;
  }

  getChildren(element?: TerraformModule): vscode.ProviderResult<TerraformModule[]> {
    if (element) {
      return Promise.resolve(element.children);
    } else {
      const m = this.getModules();
      return Promise.resolve(m);
    }
  }

  getCollapseState(type: string): vscode.TreeItemCollapsibleState {
    switch (type) {
      case 'tfregistry':
        return vscode.TreeItemCollapsibleState.Collapsed;
      case 'local':
        return vscode.TreeItemCollapsibleState.None;
      case 'github':
        return vscode.TreeItemCollapsibleState.None;
      default:
        return vscode.TreeItemCollapsibleState.None;
    }
  }

  async getModules(): Promise<TerraformModule[]> {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor === undefined) {
      return Promise.resolve([]);
    }

    const document = activeEditor.document;
    if (document === undefined) {
      return Promise.resolve([]);
    }

    const editor = document.uri;
    const documentURI = Utils.dirname(editor);
    const handler = this.handler.getClient(editor);

    return await handler.client.onReady().then(async () => {
      const params: ExecuteCommandParams = {
        command: `${handler.commandPrefix}.terraform-ls.terraform.modulelist`,
        arguments: [`uri=${documentURI}`],
      };

      const response = await handler.client.sendRequest(ExecuteCommandRequest.type, params);
      if (response == null) {
        return Promise.resolve([]);
      }

      const list = response.modules.map((m) => {
        let deps: [TerraformModule];
        if (m.depmodules === null) {
          deps = null;
        } else {
          deps = m.depmodules.map((dp) => {
            return new TerraformModule(
              dp.name,
              dp.path,
              dp.version,
              dp.type,
              dp.docklink,
              vscode.TreeItemCollapsibleState.None,
            );
          });
        }

        const state = this.getCollapseState(m.type);

        return new TerraformModule(m.name, m.path, m.version, m.type, m.docklink, state, deps);
      });

      return list;
    });
  }
}
