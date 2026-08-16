import { cpp } from "@codemirror/lang-cpp";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";

export interface IdeEditorDiagnostic {
  line: number;
  column?: number;
  message: string;
}

export interface IdeEditorController {
  getContent(): string;
  replaceDocument(content: string, language: string, readOnly: boolean): void;
  setDiagnostics(diagnostics: readonly IdeEditorDiagnostic[]): void;
  jumpToDiagnostic(diagnostic: IdeEditorDiagnostic): void;
  focus(): void;
  destroy(): void;
}

interface IdeEditorOptions {
  parent: HTMLElement;
  content: string;
  language: string;
  readOnly: boolean;
  onChange(content: string): void;
  onCursor(line: number, column: number): void;
  onSave(): void;
}

function languageExtension(language: string): Extension {
  switch (language.toLowerCase()) {
    case "c":
      return cpp();
    case "json":
      return json();
    case "markdown":
      return markdown();
    default:
      return [];
  }
}

/** Creates the one CodeMirror view owned by an IDE panel instance. */
export function createIdeEditor(options: IdeEditorOptions): IdeEditorController {
  const language = new Compartment();
  const readOnly = new Compartment();
  let destroyed = false;

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.content,
      extensions: [
        basicSetup,
        oneDark,
        lintGutter(),
        language.of(languageExtension(options.language)),
        readOnly.of(EditorState.readOnly.of(options.readOnly)),
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              options.onSave();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            options.onCursor(line.number, head - line.from + 1);
          }
        }),
      ],
    }),
  });

  const diagnosticPosition = (diagnostic: IdeEditorDiagnostic): number => {
    const lineNumber = Math.min(Math.max(1, diagnostic.line), view.state.doc.lines);
    const line = view.state.doc.line(lineNumber);
    return Math.min(line.to, line.from + Math.max(0, (diagnostic.column ?? 1) - 1));
  };

  const applyDiagnostics = (diagnostics: readonly IdeEditorDiagnostic[]): void => {
    const lintDiagnostics: Diagnostic[] = diagnostics.map((diagnostic) => {
      const from = diagnosticPosition(diagnostic);
      return {
        from,
        to: Math.min(view.state.doc.length, from + 1),
        severity: "error",
        message: diagnostic.message,
      };
    });
    view.dispatch(setDiagnostics(view.state, lintDiagnostics));
  };

  return {
    getContent: () => view.state.doc.toString(),

    replaceDocument(content, nextLanguage, nextReadOnly) {
      if (destroyed) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        effects: [
          language.reconfigure(languageExtension(nextLanguage)),
          readOnly.reconfigure(EditorState.readOnly.of(nextReadOnly)),
        ],
      });
      applyDiagnostics([]);
    },

    setDiagnostics(diagnostics) {
      if (!destroyed) applyDiagnostics(diagnostics);
    },

    jumpToDiagnostic(diagnostic) {
      if (destroyed) return;
      const position = diagnosticPosition(diagnostic);
      view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
      view.focus();
    },

    focus() {
      if (!destroyed) view.focus();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      view.destroy();
    },
  };
}
