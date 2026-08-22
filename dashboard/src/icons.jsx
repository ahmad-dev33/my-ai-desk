import React from 'react';

const paths = {
  overview: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/></>,
  employees: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6"/><path d="M16 8h5M18.5 5.5v5"/><path d="M16.5 15.5h4v4h-4z"/></>,
  contacts: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6"/><circle cx="17.5" cy="9" r="2.2"/><path d="M15.5 14.5c3.5-.7 5.2 1.1 5.5 4"/></>,
  products: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>,
  knowledge: <><path d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v13H7.5A2.5 2.5 0 0 1 5 17.5v-13Z"/><path d="M7.5 17.5H17M9 8h4M9 11h5"/><path d="M17 7h2v10"/></>,
  ai: <><rect x="4" y="6" width="16" height="13" rx="3"/><path d="M9 11h.01M15 11h.01M9 15h6M12 6V3M9 3h6"/></>,
  automations: <><path d="M13 2 5 13h6l-1 9 8-12h-6l1-8Z"/></>,
  manychat: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4V1M20 12h3M12 20v3M4 12H1"/></>,
  channels: <><path d="M8 12a4 4 0 0 1 4-4M5 12a7 7 0 0 1 7-7M2 12A10 10 0 0 1 12 2"/><circle cx="12" cy="12" r="1.5"/><path d="M12 12 20 4M16.5 4H20v3.5"/></>,
  inbox: <><path d="M4 5h16v13H4z"/><path d="M4 14h4l2 3h4l2-3h4"/></>,
  flows: <><rect x="3" y="4" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/><path d="M9 6.5h4a4 4 0 0 1 4 4V15M15 17.5h-4a4 4 0 0 1-4-4V9"/></>,
  external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/></>,
  logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4M18 12H8"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
};

export function Icon({ name, size = 20, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.overview}
    </svg>
  );
}
