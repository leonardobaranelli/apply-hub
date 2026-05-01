import { NavLink } from 'react-router-dom';
import {
  Briefcase,
  FileText,
  LayoutDashboard,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const navItems: ReadonlyArray<NavItem> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/applications', label: 'Applications', icon: Briefcase },
  { to: '/search-sessions', label: 'Search sessions', icon: Search },
  { to: '/templates', label: 'Templates', icon: FileText },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          A
        </div>
        <div>
          <p className="text-sm font-semibold">ApplyHub</p>
          <p className="text-xs text-muted-foreground">your job hub</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border px-6 py-4 text-xs text-muted-foreground">
        <p>v1.0.0</p>
        <p className="mt-1">Built for you.</p>
      </div>
    </aside>
  );
}
