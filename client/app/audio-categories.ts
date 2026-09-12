import Dessert from "@lucide/svelte/icons/dessert";
import Fish from "@lucide/svelte/icons/fish";
import FlaskRound from "@lucide/svelte/icons/flask-round";
import HandFist from "@lucide/svelte/icons/hand-fist";
import MessagesSquare from "@lucide/svelte/icons/messages-square";
import MonitorCheck from "@lucide/svelte/icons/monitor-check";
import PartyPopper from "@lucide/svelte/icons/party-popper";
import Piano from "@lucide/svelte/icons/piano";
import Scroll from "@lucide/svelte/icons/scroll";
import Swords from "@lucide/svelte/icons/swords";
import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
import Wand from "@lucide/svelte/icons/wand";

export const AUDIO_CATEGORIES = [
  { id: "combat", icon: Swords, label: "Combat" },
  { id: "spell", icon: Wand, label: "Spell" },
  { id: "skill", icon: HandFist, label: "Skill" },
  { id: "potion", icon: FlaskRound, label: "Potion" },
  { id: "quest", icon: Scroll, label: "Quest" },
  { id: "celebration", icon: PartyPopper, label: "Celebration" },
  { id: "discussion", icon: MessagesSquare, label: "Discuss" },
  { id: "alert", icon: TriangleAlert, label: "Alert" },
  { id: "ambient", icon: Dessert, label: "Ambient" },
  { id: "fishing", icon: Fish, label: "Fishing" },
  { id: "ui", icon: MonitorCheck, label: "Interface" },
  { id: "music", icon: Piano, label: "Music" },
] as const;
