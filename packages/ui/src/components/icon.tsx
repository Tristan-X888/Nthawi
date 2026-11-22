import {
  ArrowRight,
  BookOpen,
  Bot,
  Building2,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  Code,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  House,
  Inbox,
  Info,
  KeyRound,
  Laptop,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageCircleReply,
  MessagesSquare,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  UserRoundCheck,
  X,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/*
 * Semantic icon registry: product code names what an icon means, never which
 * glyph draws it. Licensed Iconly assets (design-system.md "Iconography") can
 * replace these glyphs here without touching any screen.
 */
const registry = {
  "arrow-right": ArrowRight,
  answers: MessagesSquare,
  assistant: Bot,
  billing: CreditCard,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevrons-up-down": ChevronsUpDown,
  citation: Quote,
  close: X,
  code: Code,
  copy: Copy,
  dashboard: LayoutDashboard,
  delete: Trash2,
  desktop: Laptop,
  edit: Pencil,
  email: Mail,
  error: CircleAlert,
  external: ExternalLink,
  file: FileText,
  help: CircleHelp,
  home: House,
  inbox: Inbox,
  info: Info,
  key: KeyRound,
  knowledge: BookOpen,
  link: Link2,
  lock: Lock,
  menu: Menu,
  mobile: Smartphone,
  moon: Moon,
  "panel-close": PanelLeftClose,
  "panel-open": PanelLeftOpen,
  password: Lock,
  "password-hide": EyeOff,
  "password-show": Eye,
  plus: Plus,
  refresh: RefreshCw,
  reply: MessageCircleReply,
  search: Search,
  security: ShieldCheck,
  "session-current": UserRoundCheck,
  settings: Settings,
  "sign-out": LogOut,
  success: CircleCheck,
  sun: Sun,
  system: Monitor,
  time: Clock,
  upload: Upload,
  usage: ChartColumn,
  user: User,
  warning: TriangleAlert,
  website: Globe,
  workspace: Building2,
} satisfies Record<string, LucideIcon>

type IconName = keyof typeof registry

type IconProps = {
  name: IconName
  className?: string
  /** Provide only when the icon is the sole content of a control. */
  label?: string
}

/** 1.75 stroke at 20 px is the system default; size with `size-*` classes. */
function Icon({ name, className, label }: IconProps) {
  const Glyph = registry[name]
  return (
    <Glyph
      strokeWidth={1.75}
      className={cn("size-5 shrink-0", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
    />
  )
}

export { Icon, type IconName }
