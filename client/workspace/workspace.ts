import type { Component } from "svelte";
import type { Readable } from "svelte/store";
import type { Session } from "../runtime/session";

export type PanelState = Record<string, unknown>;

export type PanelPlacement =
  | {
      kind: "grid";
      direction?: "left" | "right" | "above" | "below" | "within";
      referencePanelId?: string;
    }
  | {
      kind: "floating";
      bounds: { left: number; top: number; width: number; height: number };
    };

export interface WorkspacePanelSpec {
  id: string;
  kind: string;
  title: string;
  state: PanelState;
  placement?: PanelPlacement;
  /** Fixed grid width (pins a rail column). */
  size?: { width?: number; height?: number };
  /** Minimum resizable size enforced as a group constraint. */
  minSize?: { width?: number; height?: number };
}

export interface WorkspaceSnapshot {
  version: 1;
  layout: unknown;
}

/**
 * What actually gets persisted: one Dockview tree plus the ordered panel ids of
 * every scrolling rail root, plus whether each desktop rail is open. Rail keys
 * stay opaque strings -- which rails exist is a layout decision, and this
 * contract stays vendor- and layout-neutral.
 * Version 1 payloads remain readable as a bare Dockview tree.
 */
export interface CompositeWorkspaceSnapshot {
  version: 2;
  layout: {
    collapsed: Record<string, string[]>;
    dockview: unknown;
    mapZoom?: number;
    railVisibility?: { left: boolean; right: boolean };
    scrollviews: Record<string, string[]>;
  };
}

export type PersistedWorkspaceSnapshot = WorkspaceSnapshot | CompositeWorkspaceSnapshot;

export interface WorkspaceRendererProps {
  panelId: string;
  state: Readable<PanelState>;
  session?: Session;
}

export interface WorkspaceRendererDefinition {
  canClose?: (panelId: string) => boolean;
  /** Show an accessible collapse control that hides the body but keeps the header. */
  collapsible?: boolean;
  component: Component<WorkspaceRendererProps>;
  componentProps?: Record<string, unknown>;
  /** Show an accessible float/dock control. */
  floatable?: boolean;
  preserveDomWhenHidden?: boolean;
  session?: Session;
  showCloseButton?: (panelId: string) => boolean;
}

export type WorkspaceRendererRegistry = Readonly<Record<string, WorkspaceRendererDefinition>>;

export interface Workspace {
  addOrUpdatePanel(spec: WorkspacePanelSpec): void;
  activatePanel(id: string): void;
  getPanelState(id: string): PanelState | undefined;
  hasPanel(id: string): boolean;
  removePanel(id: string): Promise<void>;
  requestClosePanel(id: string): Promise<boolean>;
  setPanelCollapsed(id: string, collapsed: boolean): boolean;
  setFloatingPanelBounds(
    boundsById: Readonly<
      Record<string, { left: number; top: number; width: number; height: number }>
    >,
  ): boolean;
  save(): WorkspaceSnapshot;
  restore(snapshot: WorkspaceSnapshot, panels: readonly WorkspacePanelSpec[]): boolean;
  subscribePanelDrag(listener: (event: { cancel(): void; panelId: string }) => void): () => void;
  subscribeLayout(listener: (snapshot: WorkspaceSnapshot) => void): () => void;
  dispose(): Promise<void>;
}
