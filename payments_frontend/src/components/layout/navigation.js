import { LayoutDashboard, BarChart3, ScrollText, Package, Receipt } from 'lucide-react';

// Sidebar groups. `match` lists extra path prefixes that keep an item active.
export const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: 'Usage',
    items: [
      { to: '/usage', label: 'Usage analytics', icon: BarChart3 },
      { to: '/requests', label: 'AI requests', icon: ScrollText },
    ],
  },
  {
    label: 'Billing',
    items: [
      { to: '/plans', label: 'Plans & checkout', icon: Package, match: ['/checkout'] },
      { to: '/invoices', label: 'Invoices', icon: Receipt },
    ],
  },
];

const TITLES = [
  ['/usage', 'Usage analytics'],
  ['/requests', 'AI requests'],
  ['/plans', 'Plans'],
  ['/checkout', 'Checkout'],
  ['/invoices', 'Invoices'],
];

export const pageTitle = (pathname) => (TITLES.find(([p]) => pathname.startsWith(p)) || [null, 'Dashboard'])[1];
