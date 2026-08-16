import type { Component } from "svelte";
import type { Readable } from "svelte/store";
import type { Session } from "../runtime/session.ts";

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
  size?: { width?: number; height?: number };
}

export interface WorkspaceSnapshot {
  version: 1;
  layout: unknown;
}

export interface WorkspaceRendererProps {
  panelId: string;
  state: Readable<PanelState>;
  session?: Session;
}

export interface WorkspaceRendererDefinition {
  canClose?: (panelId: string) => boolean;
  component: Component<WorkspaceRendererProps>;
  componentProps?: Record<string, unknown>;
  preserveDomWhenHidden?: boolean;
  session?: Session;
  showCloseButton?: (panelId: string) => boolean;
}

export type WorkspaceRendererRegistry = Readonly<Record<string, WorkspaceRendererDefinition>>;

export interface Workspace {
  addOrUpdatePanel(spec: WorkspacePanelSpec): void;
  activatePanel(id: string): void;
  hasPanel(id: string): boolean;
  removePanel(id: string): Promise<void>;
  requestClosePanel(id: string): Promise<boolean>;
  save(): WorkspaceSnapshot;
  restore(snapshot: WorkspaceSnapshot, panels: readonly WorkspacePanelSpec[]): boolean;
  subscribeLayout(listener: (snapshot: WorkspaceSnapshot) => void): () => void;
  dispose(): Promise<void>;
}
