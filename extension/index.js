const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const json5 = require('json5');
const prettier = require('prettier');
const { docGetFullRange, createDiagnosticFromError, createStatusBarItem } = require("./vscode.js");


const diagnosticCollection = vscode.languages.createDiagnosticCollection('json5');
let watcherActive = false;
/** @type {vscode.StatusBarItem} */
let statusBarItem;
/** @type {vscode.Disposable} */
let dispCreateJsonFromJson5;


/** @param {vscode.ExtensionContext} context */
async function activate(context) {
    // console.log('activate');
    context.subscriptions.push(diagnosticCollection);

    vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId === 'json5') {
            docValidate(event.document, false);
        }
    });
    vscode.workspace.onDidOpenTextDocument(document => {
        if (document.languageId === 'json5') {
            docValidate(document, false);
            createWatcherStatusBarItem();
        }
    });
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'json5') {
            createWatcherStatusBarItem();
        } else if (statusBarItem) {
            statusBarItem.hide();
        }
    });

    // formatter
    vscode.languages.registerDocumentFormattingEditProvider('json5', {
        async provideDocumentFormattingEdits(document) {
            try {
                // validator
                if (docValidate(document, true)) return null;

                const text = document.getText();
                const formatted = await prettier.format(text, {
                    parser: "json5",
                    trailingComma: "all",
                    tabWidth: 4,
                });

                return [vscode.TextEdit.replace(docGetFullRange(document), formatted)];
            } catch (e) {
                const diagnostic = createDiagnosticFromError(e, document);
                diagnosticCollection.set(document.uri, [diagnostic]);
                vscode.window.showErrorMessage(`Error General JSON5: ${e.message}`);
            }
        }
    });

    // command "json5 to json"
    const toJsonCommand = vscode.commands.registerCommand('json5-formatter.toJson', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return vscode.window.showErrorMessage("No active editor found");

        const document = editor.document;
        const text = document.getText();

        try {
            const jsonObject = json5.parse(text);
            const jsonContent = JSON.stringify(jsonObject, null, 4);

            // transform filename from name.json5 to name.json
            const dir = path.dirname(document.uri.fsPath)
            const basename = path.basename(document.uri.fsPath, '.json5')
            const filename = basename + ".json"
            const jsonFilePath = path.join(dir, filename);

            fs.writeFileSync(jsonFilePath, jsonContent, 'utf8');
            // vscode.window.showInformationMessage(`JSON file created at ${jsonFilePath}`);
        } catch (e) {
            vscode.window.showErrorMessage(`Error J5CMD: converting to JSON: ${e.message}`);
        }
    });
    context.subscriptions.push(toJsonCommand);


    // status bar / watcher toggler
    const toggleWatcherCommand = vscode.commands.registerCommand('json5-formatter.toggleWatcher', () => {
        watcherActive = !watcherActive;
        createWatcherStatusBarItem();

        if (watcherActive) {
            dispCreateJsonFromJson5 = vscode.workspace.onDidSaveTextDocument(document => {
                if (document.languageId === 'json5') {
                    vscode.commands.executeCommand('json5-formatter.toJson');
                }
            })
            context.subscriptions.push(dispCreateJsonFromJson5)
        } else {
            dispCreateJsonFromJson5.dispose();
        }
    });
    context.subscriptions.push(toggleWatcherCommand);
}


function deactivate() {
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
}

function createWatcherStatusBarItem() {
    const text = watcherActive ? 'Stop JSON5 Watcher' : 'Watch JSON5';
    if (!statusBarItem) {
        statusBarItem = createStatusBarItem('json5-formatter.toggleWatcher', text, true);
        // statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        // statusBarItem.command = 'json5-formatter.toggleWatcher';
    }    
    // const text = watcherActive ? 'Stop JSON5 Watcher' : 'Watch JSON5';
    // statusBarItem.text = watcherActive ? 'Stop JSON5 Watcher' : 'Watch JSON5';
    statusBarItem.text = text
    statusBarItem.show();
}

/**
 * @param {vscode.TextDocument} doc
 * @param {boolean} showErrorMessage
 * @returns {Error | null}
 */
function docValidate(doc, showErrorMessage) {
    const text = doc.getText();
    diagnosticCollection.clear();

    try {
        json5.parse(text);
        return null;
    } catch (e) {
        const diagnostic = createDiagnosticFromError(e, doc);
        diagnosticCollection.set(doc.uri, [diagnostic]);

        if (showErrorMessage) vscode.window.showErrorMessage(e.message);
        return e;
    }
}

module.exports = {
    activate,
    deactivate
};
