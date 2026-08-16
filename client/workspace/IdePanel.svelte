<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { Readable } from "svelte/store";
  import type { Session } from "../runtime/session.ts";
  import type { SessionIdeDiagnostic, SessionIdeSnapshot } from "../runtime/ide.ts";
  import type { PanelState } from "./workspace.ts";
  import type { IdeEditorController } from "./ide-editor.ts";

  let {
    panelId,
    state: _state,
    session,
    registerCloseGuard,
    focusFallback,
  }: {
    panelId: string;
    state: Readable<PanelState>;
    session?: Session;
    registerCloseGuard?: (guard: () => boolean) => (() => void) | void;
    focusFallback?: () => void;
  } = $props();

  const resolvedSession = untrack(() => session);
  if (!resolvedSession) throw new Error("IDE requires a session");
  const activeSession: Session = resolvedSession;

  let root: HTMLElement;
  let editorHost: HTMLElement;
  let editor: IdeEditorController | null = null;
  let createEditor: (typeof import("./ide-editor.ts"))["createIdeEditor"] | null = null;
  let snapshot = $state<SessionIdeSnapshot>(activeSession.ide.getSnapshot());
  let dirty = $state(false);
  let line = $state(1);
  let column = $state(1);
  let loading = $state(true);
  let loadError = $state("");
  let baseline = "";
  let pendingSavedContent: string | null = null;
  let renderedOpenVersion = 0;
  let previousSaveStatus = untrack(() => snapshot.save.status);
  let previousFocus: HTMLElement | null = null;
  let disposed = false;
  let loadGeneration = 0;

  const activeDocument = $derived(snapshot.document);
  const saveDisabled = $derived(
    !dirty ||
      !activeDocument ||
      activeDocument.readOnly ||
      activeDocument.stale ||
      !snapshot.connected ||
      snapshot.save.status === "saving" ||
      !editor,
  );

  function displayPath(): string {
    if (!activeDocument) return "IDE";
    return activeDocument.title === activeDocument.path
      ? activeDocument.path
      : `${activeDocument.title} — ${activeDocument.path}`;
  }

  function statusText(): string {
    if (loadError) return loadError;
    if (loading) return "Loading editor…";
    if (!activeDocument) return "Waiting for a server document.";
    if (!snapshot.connected) return "Disconnected — local changes are preserved.";
    if (activeDocument.stale) return "Waiting for a fresh server document.";
    if (snapshot.transferFailure) return snapshot.transferFailure;
    if (snapshot.transfer) {
      return `Loading ${snapshot.transfer.receivedChunks}/${snapshot.transfer.totalChunks} chunks…`;
    }
    return snapshot.save.message;
  }

  function updateDirty(content = editor?.getContent() ?? ""): void {
    dirty = content !== baseline;
  }

  function rememberExternalFocus(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !root.contains(active)) {
      previousFocus = active;
    }
  }

  function focusEditor(): void {
    rememberExternalFocus();
    const generation = loadGeneration;
    queueMicrotask(() => {
      if (disposed || generation !== loadGeneration) return;
      editor?.focus();
      requestAnimationFrame(() => {
        if (disposed || generation !== loadGeneration) return;
        const active = document.activeElement;
        const activePanelId = active
          ?.closest<HTMLElement>("[data-panel-id]")
          ?.getAttribute("data-panel-id");
        if (
          active === document.body ||
          (active instanceof Node && root.contains(active)) ||
          (active instanceof Element && active.matches(".dv-content-container")) ||
          activePanelId === panelId
        ) {
          editor?.focus();
        }
      });
    });
  }

  function restoreFocus(
    owner = root,
    workspaceOwner = owner.closest<HTMLElement>(".workspace-host"),
  ): void {
    const active = document.activeElement;
    const activeIdeRoot = active?.closest<HTMLElement>(".ide-pane[data-panel-id]");
    if (
      activeIdeRoot?.isConnected &&
      activeIdeRoot !== owner &&
      activeIdeRoot.dataset.panelId === panelId
    ) {
      return;
    }
    const shouldRestore =
      active === document.body ||
      (active instanceof Node &&
        (owner.contains(active) || Boolean(workspaceOwner?.contains(active)))) ||
      (active instanceof Element && active.matches(".dv-content-container"));
    if (!shouldRestore) return;
    const previousPanelId = previousFocus
      ?.closest<HTMLElement>("[data-panel-id]")
      ?.getAttribute("data-panel-id");
    if (previousFocus?.isConnected && previousPanelId !== panelId) {
      previousFocus.focus();
    } else {
      focusFallback?.();
    }
  }

  function applyOpen(next: SessionIdeSnapshot): void {
    const nextDocument = next.document;
    if (!nextDocument) return;
    if (!editor && createEditor) {
      baseline = nextDocument.content;
      editor = createEditor({
        parent: editorHost,
        content: nextDocument.content,
        language: nextDocument.language,
        readOnly: nextDocument.readOnly,
        onChange: updateDirty,
        onCursor: (nextLine, nextColumn) => {
          line = nextLine;
          column = nextColumn;
        },
        onSave: save,
      });
      renderedOpenVersion = next.openVersion;
      editor.setDiagnostics(next.save.diagnostics);
      focusEditor();
      return;
    }
    if (!editor || next.openVersion === renderedOpenVersion) return;
    baseline = nextDocument.content;
    pendingSavedContent = null;
    dirty = false;
    renderedOpenVersion = next.openVersion;
    editor.replaceDocument(nextDocument.content, nextDocument.language, nextDocument.readOnly);
    editor.setDiagnostics([]);
    focusEditor();
  }

  function reconcile(next: SessionIdeSnapshot): void {
    snapshot = next;
    applyOpen(next);

    if (
      next.save.status === "saved" &&
      previousSaveStatus !== "saved" &&
      pendingSavedContent !== null
    ) {
      baseline = pendingSavedContent;
      pendingSavedContent = null;
      updateDirty();
    } else if (next.save.status === "error" && previousSaveStatus !== "error") {
      pendingSavedContent = null;
    }
    previousSaveStatus = next.save.status;
    editor?.setDiagnostics(next.save.diagnostics);
  }

  function save(): void {
    if (saveDisabled || !editor) return;
    const content = editor.getContent();
    pendingSavedContent = content;
    if (!activeSession.ide.save(content)) pendingSavedContent = null;
  }

  function confirmDiscard(): boolean {
    return !dirty || window.confirm("You have unsaved changes. Close anyway?");
  }

  function close(): void {
    if (!confirmDiscard() || !activeSession.ide.close()) return;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !root.contains(document.activeElement)) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  function activateDiagnostic(diagnostic: SessionIdeDiagnostic): void {
    editor?.jumpToDiagnostic(diagnostic);
  }

  onMount(() => {
    previousFocus =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    const unsubscribe = activeSession.ide.subscribe(reconcile);
    const unregisterGuard = registerCloseGuard?.(confirmDiscard);
    const generation = ++loadGeneration;
    document.addEventListener("keydown", handleKeydown, true);

    void import("./ide-editor.ts")
      .then(({ createIdeEditor }) => {
        if (disposed || generation !== loadGeneration || !editorHost) return;
        createEditor = createIdeEditor;
        loading = false;
        applyOpen(snapshot);
      })
      .catch((error: unknown) => {
        if (disposed || generation !== loadGeneration) return;
        loading = false;
        loadError = error instanceof Error ? error.message : "Unable to load the editor.";
      });

    return () => {
      const closingRoot = root;
      const workspaceOwner = closingRoot.closest<HTMLElement>(".workspace-host");
      disposed = true;
      loadGeneration += 1;
      unsubscribe();
      unregisterGuard?.();
      document.removeEventListener("keydown", handleKeydown, true);
      editor?.destroy();
      editor = null;
      createEditor = null;
      queueMicrotask(() => {
        restoreFocus(closingRoot, workspaceOwner);
        requestAnimationFrame(() => restoreFocus(closingRoot, workspaceOwner));
      });
    };
  });
</script>

<section
  bind:this={root}
  class="ide-pane"
  aria-label="IDE editor"
  data-panel-id={panelId}
  data-workspace-owned="true"
>
  <div class="ide-modal">
    <div class="ide-header">
      <div class="ide-filepath" title={activeDocument?.path ?? "IDE"}>
        {displayPath()}
        {#if dirty}<span class="ide-modified-dot" aria-label="Modified"> ●</span>{/if}
        {#if activeDocument?.readOnly}
          <span class="ide-readonly-badge">READ ONLY</span>
        {/if}
      </div>
      <div class="ide-actions">
        {#if !activeDocument?.readOnly}
          <button
            type="button"
            class="ide-btn ide-btn-save"
            title="Save (Ctrl/Cmd+S)"
            disabled={saveDisabled}
            onclick={save}>Save</button
          >
        {/if}
        <button type="button" class="ide-btn ide-btn-close" title="Close (Escape)" onclick={close}
          >Close</button
        >
      </div>
    </div>

    <div bind:this={editorHost} class="ide-editor-container"></div>

    {#if snapshot.save.diagnostics.length > 0}
      <div class="ide-error-panel">
        <div class="ide-error-title">Compile Errors ({snapshot.save.diagnostics.length})</div>
        <div class="ide-error-list">
          {#each snapshot.save.diagnostics as diagnostic, index (index)}
            <button
              type="button"
              class="ide-error-item"
              onclick={() => activateDiagnostic(diagnostic)}
            >
              <span class="ide-error-location"
                >Line {diagnostic.line}{diagnostic.column === undefined
                  ? ""
                  : `:${diagnostic.column}`}</span
              >
              <span class="ide-error-message">{diagnostic.message}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="ide-status-bar">
      <span class="ide-status-text">{statusText()}</span>
      <span class="ide-status-pos">Ln {line}, Col {column}</span>
    </div>
  </div>
</section>

<style>
  button.ide-error-item {
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--df-btn-secondary);
    background: transparent;
    font: inherit;
    text-align: left;
  }
</style>
