import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsRotate,
  faArrowUpRightFromSquare,
  faBan,
  faBandage,
  faBars,
  faBell,
  faBolt,
  faBoxArchive,
  faBrain,
  faBriefcase,
  faBullhorn,
  faBullseye,
  faCalendar,
  faCalendarDays,
  faChartColumn,
  faCheck,
  faChevronDown,
  faChevronRight,
  faCircle,
  faCircleCheck,
  faCircleExclamation,
  faClipboard,
  faClock,
  faComment,
  faCompass,
  faDatabase,
  faDownload,
  faEnvelope,
  faEnvelopeOpen,
  faEye,
  faFileLines,
  faFire,
  faFolder,
  faGaugeHigh,
  faGear,
  faHandsClapping,
  faHeart,
  faInbox,
  faKey,
  faLock,
  faLockOpen,
  faMagnifyingGlass,
  faPaperclip,
  faPenToSquare,
  faPencil,
  faPuzzlePiece,
  faRightFromBracket,
  faRobot,
  faScroll,
  faSeedling,
  faShieldHalved,
  faSquareCheck,
  faStar,
  faThumbtack,
  faTrashCan,
  faTriangleExclamation,
  faUpload,
  faUser,
  faUsers,
  faWandMagicSparkles,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

// Fonte única de ícones do sistema (substitui os emojis). Cada nome semântico
// mapeia para um ícone do Font Awesome. Renderiza SVG (funciona em RSC e client).
// O nome é escolhido pelo PAPEL, não pelo emoji, para reuso consistente.
const ICONS = {
  // navegação
  dashboard: faGaugeHigh, // ▦
  copilot: faCompass, // 🧭
  operation: faArrowsRotate, // 🔄
  tasks: faSquareCheck, // ☑
  clients: faUsers, // 👥
  assets: faBoxArchive, // 🗄
  documents: faFileLines, // 📄
  goals: faBullseye, // 🎯
  forms: faPenToSquare, // 📝
  team: faBriefcase, // 🧑‍💼 / 💼
  automations: faBolt, // ⚡
  settings: faGear, // ⚙
  // ações / estados
  search: faMagnifyingGlass, // 🔍
  bell: faBell, // 🔔
  trash: faTrashCan, // 🗑
  edit: faPenToSquare, // ✏ (edição)
  pencil: faPencil,
  check: faCheck, // ✓
  checkCircle: faCircleCheck, // ✅
  close: faXmark, // ✕ / ❌
  warning: faTriangleExclamation, // ⚠
  alert: faCircleExclamation, // 🚨
  ban: faBan, // 🚫
  clock: faClock, // ⏰ / 🕐
  fire: faFire, // 🔥
  redDot: faCircle, // 🔴
  // segurança / ativos
  lock: faLock, // 🔒 / 🔐
  unlock: faLockOpen, // 🔓
  key: faKey,
  shield: faShieldHalved, // 🛡
  attachment: faPaperclip, // 📎
  eye: faEye, // 👁
  database: faDatabase,
  // conteúdo / módulos
  module: faPuzzlePiece, // 🧩
  user: faUser, // 👤 / 🧑
  chat: faComment, // 💬
  robot: faRobot, // 🤖
  brain: faBrain, // 🧠
  chart: faChartColumn, // 📊
  clipboard: faClipboard, // 📋
  calendar: faCalendarDays, // 🗓 / 📅
  calendarAlt: faCalendar,
  folder: faFolder, // 📁
  scroll: faScroll, // 📜
  pin: faThumbtack, // 📌
  megaphone: faBullhorn, // 📣
  seedling: faSeedling, // 🌱
  heart: faHeart, // ❤
  bandage: faBandage, // 🩹
  sparkles: faWandMagicSparkles, // ✨
  celebrate: faStar, // 🎉
  clap: faHandsClapping, // 👏
  // caixas de entrada / envios
  inbox: faInbox, // 📥
  outbox: faUpload, // 📤
  download: faDownload, // ⬇
  envelope: faEnvelope, // 📨
  envelopeOpen: faEnvelopeOpen, // 📭
  externalLink: faArrowUpRightFromSquare, // ↗
  logout: faRightFromBracket, // 🚪 / ⎋
  // utilitários de UI
  chevronDown: faChevronDown,
  chevronRight: faChevronRight,
  menu: faBars, // ☰
} as const satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className,
  title,
  spin,
  fixedWidth,
}: {
  name: IconName;
  className?: string;
  title?: string;
  spin?: boolean;
  fixedWidth?: boolean;
}) {
  return (
    <FontAwesomeIcon icon={ICONS[name]} className={className} title={title} spin={spin} fixedWidth={fixedWidth} />
  );
}
