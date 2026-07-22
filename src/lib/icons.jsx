// Lightweight inline SVG icon set — keeps the bundle small.

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
}

const Icon = ({ children, size = 18, className = '', ...rest }) => (
  <svg {...base} width={size} height={size} className={className} {...rest}>
    {children}
  </svg>
)

export const PauseIcon = (p) => (
  <Icon {...p}>
    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
  </Icon>
)
export const Replay10Icon = (p) => (
  <Icon {...p}>
    <path d="M12 5V2L7 6l5 4V7a6 6 0 11-6 6" />
  </Icon>
)
export const Forward10Icon = (p) => (
  <Icon {...p}>
    <path d="M12 5V2l5 4-5 4V7a6 6 0 106 6" />
  </Icon>
)
export const PlayIcon = (p) => (
  <Icon {...p}>
    <path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none" />
  </Icon>
)
export const InfoIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v5h1" />
  </Icon>
)
export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)
export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>
)
export const CloseIcon = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)
export const ChevronLeft = (p) => (
  <Icon {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
)
export const ChevronRight = (p) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)
export const HomeIcon = (p) => (
  <Icon {...p}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </Icon>
)
export const GridIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Icon>
)
export const ChevronDown = (p) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
)
export const ThumbsUpIcon = (p) => (
  <Icon {...p}>
    <path d="M7 11v9H4a1 1 0 01-1-1v-7a1 1 0 011-1h3zm0 0l4-8a2.5 2.5 0 012.4 3.2L12.6 9H19a2 2 0 012 2.3l-1.1 6.5A2 2 0 0117.9 20H7" />
  </Icon>
)
export const FullscreenIcon = (p) => (
  <Icon {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
)
export const ExitFullscreenIcon = (p) => (
  <Icon {...p}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </Icon>
)
export const UploadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
  </Icon>
)
export const LinkIcon = (p) => (
  <Icon {...p}>
    <path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" />
    <path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" />
  </Icon>
)
export const ClockIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </Icon>
)
export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Icon>
)
export const BookmarkIcon = (p) => (
  <Icon {...p}>
    <path d="M6 4h12v17l-6-4-6 4V4z" />
  </Icon>
)
export const BookmarkFilledIcon = (p) => (
  <Icon {...p}>
    <path d="M6 4h12v17l-6-4-6 4V4z" fill="currentColor" />
  </Icon>
)
export const StarIcon = (p) => (
  <Icon {...p}>
    <path
      d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85L12 3.5z"
      fill="currentColor"
      stroke="none"
    />
  </Icon>
)
export const UserIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
  </Icon>
)
export const LogoutIcon = (p) => (
  <Icon {...p}>
    <path d="M15 12H4M9 7l-5 5 5 5" />
    <path d="M11 4h7a2 2 0 012 2v12a2 2 0 01-2 2h-7" />
  </Icon>
)
export const MailIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M4 7l8 6 8-6" />
  </Icon>
)
export const LockIcon = (p) => (
  <Icon {...p}>
    <rect x="4" y="11" width="16" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Icon>
)
export const EyeIcon = (p) => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
export const EyeOffIcon = (p) => (
  <Icon {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.1A9.6 9.6 0 0112 6c6.5 0 10 7 10 7a16.6 16.6 0 01-3 3.8" />
    <path d="M6.6 6.6A16.4 16.4 0 002 13s3.5 7 10 7a9.4 9.4 0 004.4-1" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </Icon>
)
export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="M5 12l5 5L20 6" />
  </Icon>
)
export const GoogleIcon = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
    <path
      fill="#4285F4"
      d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.5 5.5 0 01-2.4 3.62v3h3.88c2.27-2.09 3.55-5.17 3.55-8.86z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0012 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29A7.2 7.2 0 014.89 12c0-.8.14-1.57.38-2.29V6.62H1.27A12 12 0 000 12c0 1.94.46 3.77 1.27 5.38l4-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 001.27 6.62l4 3.09C6.22 6.86 8.87 4.75 12 4.75z"
    />
  </svg>
)
