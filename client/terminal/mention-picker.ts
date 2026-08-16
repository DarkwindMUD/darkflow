import type { SessionNotifications } from "../runtime/notifications.ts";

// @ts-expect-error Retained mention parsing is shared with the legacy client.
import { getMentionContext, getMentionSuggestions } from "../../public/js/mention-utils.js";

const DEFAULT_CHANNEL_NAMES = [
  "al",
  "arena",
  "auction",
  "awiz",
  "balance",
  "bard",
  "dragon",
  "druid",
  "elitepk",
  "faq",
  "fighter",
  "garou",
  "gossip",
  "imp",
  "kingdom",
  "mage",
  "mentor",
  "monk",
  "newbie",
  "ninja",
  "paladin",
  "party",
  "pk",
  "ranger",
  "rogue",
  "samurai",
  "shout",
  "super",
  "thief",
  "wiz",
  "wtp",
];

interface MentionToken {
  start: number;
  end: number;
  query: string;
}

interface MentionSuggestion {
  displayName: string;
  channel: string;
}

/** One command input's mention suggestions over the public notifications capability. */
export function createMentionPicker({
  input,
  notifications,
}: {
  input: HTMLInputElement;
  notifications: SessionNotifications;
}): { close(): void; handleKeydown(event: KeyboardEvent): boolean; dispose(): void } {
  const picker = document.createElement("div");
  picker.id = "mention-picker";
  picker.hidden = true;
  picker.setAttribute("role", "listbox");
  picker.setAttribute("aria-label", "Player mention suggestions");
  document.body.appendChild(picker);

  let snapshot = notifications.getSnapshot();
  let token: MentionToken | null = null;
  let suggestions: MentionSuggestion[] = [];
  let activeIndex = 0;
  let blurTimer: number | undefined;
  let disposed = false;

  const close = (): void => {
    token = null;
    suggestions = [];
    activeIndex = 0;
    picker.hidden = true;
  };

  const position = (): void => {
    const rect = input.getBoundingClientRect();
    picker.style.left = `${Math.max(8, rect.left)}px`;
    picker.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 6)}px`;
    picker.style.width = `${Math.min(Math.max(280, rect.width), 420)}px`;
  };

  const select = (index = activeIndex): boolean => {
    const suggestion = suggestions[index];
    if (!suggestion || !token) return false;
    const value = input.value;
    input.value =
      value.slice(0, token.start) + `@${suggestion.displayName} ` + value.slice(token.end);
    const cursor = token.start + suggestion.displayName.length + 2;
    input.setSelectionRange(cursor, cursor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    close();
    input.focus();
    return true;
  };

  const render = (): void => {
    picker.replaceChildren();
    if (snapshot.rosterRequestPending && suggestions.length === 0) {
      const status = document.createElement("div");
      status.className = "mention-picker-item mention-picker-status";
      status.textContent = "Loading players...";
      picker.appendChild(status);
      picker.hidden = false;
      return;
    }
    suggestions.forEach((suggestion, index) => {
      const item = document.createElement("button");
      const name = document.createElement("span");
      const channel = document.createElement("span");
      item.type = "button";
      item.className = `mention-picker-item${index === activeIndex ? " is-active" : ""}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(index === activeIndex));
      name.className = "mention-picker-name";
      name.textContent = `@${suggestion.displayName}`;
      channel.className = "mention-picker-channel";
      channel.textContent = suggestion.channel;
      item.append(name, channel);
      item.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        select(index);
      });
      picker.appendChild(item);
    });
    picker.hidden = suggestions.length === 0;
  };

  const knownChannels = (): Set<string> => {
    const channels = new Set(DEFAULT_CHANNEL_NAMES);
    for (const channel of snapshot.channelNames) channels.add(channel);
    for (const player of snapshot.roster) {
      for (const channel of player.channels) channels.add(channel);
    }
    return channels;
  };

  const update = (requestRoster = true): void => {
    if (disposed) return;
    const value = input.value;
    const cursor = input.selectionStart ?? value.length;
    const context = getMentionContext(value, cursor, knownChannels());
    if (!context) {
      close();
      return;
    }
    token = context.token;
    suggestions = getMentionSuggestions(snapshot.roster, context.channel, context.token.query, 8);
    activeIndex = 0;
    position();
    if (requestRoster) notifications.requestRoster();
    render();
  };

  const onInput = (): void => update();
  const onBlur = (): void => {
    if (blurTimer !== undefined) window.clearTimeout(blurTimer);
    blurTimer = window.setTimeout(() => {
      blurTimer = undefined;
      close();
    }, 120);
  };
  const onResize = (): void => {
    if (!picker.hidden) position();
  };
  const unsubscribe = notifications.subscribe((next) => {
    snapshot = next;
    update(false);
  });

  input.addEventListener("input", onInput);
  input.addEventListener("blur", onBlur);
  window.addEventListener("resize", onResize);

  return {
    close,
    handleKeydown(event) {
      if (picker.hidden) return false;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return true;
      }
      if (suggestions.length === 0) {
        if (["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(event.key)) {
          event.preventDefault();
          return true;
        }
        return false;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        activeIndex = (activeIndex + direction + suggestions.length) % suggestions.length;
        render();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        select();
        return true;
      }
      return false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (blurTimer !== undefined) window.clearTimeout(blurTimer);
      input.removeEventListener("input", onInput);
      input.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      unsubscribe();
      picker.remove();
    },
  };
}
