import {
  Globe,
  Landmark,
  BarChart3,
  Newspaper,
  BookOpen,
  Scale,
  Users,
  Flag,
  FileText,
  HelpCircle,
  MessagesSquare,
  Map as MapIcon,
  Network,
  type LucideIcon,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export type ResourceIcon = Database["public"]["Enums"]["resource_icon"];

export const RESOURCE_ICONS: Record<ResourceIcon, LucideIcon> = {
  globe: Globe,
  landmark: Landmark,
  barchart: BarChart3,
  newspaper: Newspaper,
  book: BookOpen,
  scale: Scale,
  users: Users,
  flag: Flag,
  filetext: FileText,
  helpcircle: HelpCircle,
  messages: MessagesSquare,
  map: MapIcon,
  network: Network,
};

export const RESOURCE_ICON_OPTIONS: { value: ResourceIcon; label: string }[] = [
  { value: "globe", label: "Globe" },
  { value: "landmark", label: "Landmark" },
  { value: "barchart", label: "Bar chart" },
  { value: "newspaper", label: "Newspaper" },
  { value: "book", label: "Book" },
  { value: "scale", label: "Scale" },
  { value: "users", label: "Users" },
  { value: "flag", label: "Flag" },
  { value: "filetext", label: "File" },
  { value: "helpcircle", label: "Help" },
  { value: "messages", label: "Messages" },
  { value: "map", label: "Map" },
  { value: "network", label: "Network" },
];
