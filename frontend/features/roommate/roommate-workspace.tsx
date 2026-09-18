"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "../../components/ui/icon";
import {
  isNavigationItemActive,
  roommateManagementItems,
  roommateNavigationItems,
  type NavigationItem
} from "../../components/ui/navigation-model";
import styles from "./roommate-workspace.module.css";

const journeyItems = roommateNavigationItems.slice(0, 3);
const connectionItems = roommateNavigationItems.slice(3);
const accountItems = roommateManagementItems;
const allItems = [...journeyItems, ...connectionItems, ...accountItems];

function WorkspaceLink({ item, pathname }: Readonly<{ item: NavigationItem; pathname: string }>) {
  const current = isNavigationItemActive(item, pathname);
  return (
    <Link href={item.href} aria-current={current ? "page" : undefined} className={styles.navLink}>
      <span className={styles.navIcon} aria-hidden="true">
        <Icon name={item.icon} className="h-4 w-4" />
      </span>
      <span>{item.label}</span>
      {current ? <span className={styles.activeMark} aria-hidden="true" /> : null}
    </Link>
  );
}

function NavigationGroups({ pathname }: Readonly<{ pathname: string }>) {
  return (
    <>
      <div className={styles.navGroup}>
        <p>TÌM CÙNG NHÀ</p>
        {journeyItems.map((item) => (
          <WorkspaceLink key={item.key} item={item} pathname={pathname} />
        ))}
      </div>
      <div className={styles.navGroup}>
        <p>TRAO ĐỔI</p>
        {connectionItems.map((item) => (
          <WorkspaceLink key={item.key} item={item} pathname={pathname} />
        ))}
      </div>
      <div className={styles.navGroup}>
        <p>THIẾT LẬP</p>
        {accountItems.map((item) => (
          <WorkspaceLink key={item.key} item={item} pathname={pathname} />
        ))}
      </div>
    </>
  );
}

export function RoommateWorkspace({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const currentItem = allItems.find((item) => isNavigationItemActive(item, pathname)) ?? journeyItems[0]!;

  return (
    <div className={styles.workspace} data-discovery={pathname === "/roommates" ? "true" : undefined}>
      <aside className={styles.sidebar} aria-label="Không gian ở ghép">
        <div className={styles.sidebarHeading}>
          <span className={styles.sidebarMark} aria-hidden="true">
            <Icon name="users" className="h-5 w-5" />
          </span>
          <div>
            <strong>Ở ghép</strong>
            <span>Tìm đúng người, ở đúng nơi</span>
          </div>
        </div>
        <nav aria-label="Điều hướng ở ghép" className={styles.desktopNav}>
          <NavigationGroups pathname={pathname} />
        </nav>
        <div className={styles.sidebarFooter}>
          <Icon name="shield" className="h-4 w-4" />
          <span>Chỉ chia sẻ điều bạn thấy thoải mái.</span>
        </div>
      </aside>

      <div className={styles.mobileContext}>
        <div>
          <span>Ở ghép</span>
          <strong>{currentItem.label}</strong>
        </div>
        <details key={pathname}>
          <summary aria-label="Mở điều hướng ở ghép">
            <Icon name="menu" className="h-5 w-5" />
          </summary>
          <nav aria-label="Điều hướng ở ghép trên di động" className={styles.mobilePanel}>
            <NavigationGroups pathname={pathname} />
          </nav>
        </details>
      </div>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
