import { useState } from "react";
import { clearNotices, listNotices, markNotices } from "@/lib/qayd/server";

export type NoticeItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  at: number;
};

const KIND: Record<string, string> = {
  friend_request: "صداقة",
  friend_accept: "صداقة",
  friend_refuse: "صداقة",
  play_invite: "دعوة",
  level: "رتبة",
  system: "إعلان",
};

function ago(at: number) {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `قبل ${minutes} د`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours} س`;
  return `قبل ${Math.round(hours / 24)} ي`;
}

export function NoticeBell({
  open,
  items,
  unread,
  onToggle,
  onRefresh,
  onOpenHref,
}: {
  open: boolean;
  items: NoticeItem[];
  unread: number;
  onToggle: () => void;
  onRefresh: () => Promise<void>;
  onOpenHref: (href: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run(job: () => Promise<unknown>) {
    setBusy(true);
    try {
      await job();
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/45 sm:place-items-center" onClick={onToggle}>
          <section
            dir="rtl"
            role="dialog"
            aria-label="الإشعارات"
            className="max-h-[86dvh] w-full overflow-auto rounded-t-3xl bg-[var(--q-surface)] p-5 text-[var(--q-ink)] shadow-2xl sm:max-w-md sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs tracking-wide text-[var(--q-accent)]">الجرس</p>
                <h2 className="qayd-display text-3xl text-[var(--q-accent)]">الإشعارات</h2>
              </div>
              <p className="text-sm text-[var(--q-muted)]">{unread} غير مقروء</p>
            </div>
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              <button type="button" disabled={busy || !unread} className="min-h-10 rounded-xl border border-[var(--q-line)] px-3 disabled:opacity-40" onClick={() => void run(() => markNotices({ data: { all: true } }))}>
                قراءة الكل
              </button>
              <button type="button" disabled={busy} className="min-h-10 rounded-xl border border-[var(--q-line)] px-3 disabled:opacity-40" onClick={() => void run(() => clearNotices({ data: { read: true } }))}>
                مسح المقروء
              </button>
              <button type="button" disabled={busy || !items.length} className="min-h-10 rounded-xl border border-[var(--q-line)] px-3 disabled:opacity-40" onClick={() => void run(() => clearNotices({ data: { all: true } }))}>
                مسح الكل
              </button>
            </div>
            {items.length ? (
              <ul className="grid gap-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={busy}
                      className={"grid w-full gap-1 rounded-2xl border px-3 py-3 text-start " + (item.read ? "border-[var(--q-line)] opacity-70" : "border-[var(--q-gold)] bg-[var(--q-card)]")}
                      onClick={() => {
                        void run(async () => {
                          if (!item.read) await markNotices({ data: { ids: [item.id] } });
                          if (item.href) onOpenHref(item.href);
                        });
                      }}
                    >
                      <span className="flex items-center justify-between gap-2 text-xs text-[var(--q-muted)]">
                        <span>{KIND[item.kind] || "تنبيه"}</span>
                        <span>{ago(item.at)}{item.read ? "" : " · جديد"}</span>
                      </span>
                      <b>{item.title}</b>
                      {item.body ? <span className="text-sm leading-6">{item.body}</span> : null}
                    </button>
                    <button type="button" disabled={busy} className="mt-1 text-xs text-[var(--q-muted)]" onClick={() => void run(() => clearNotices({ data: { id: item.id } }))}>
                      حذف
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-[var(--q-line)] px-3 py-8 text-center text-sm text-[var(--q-muted)]">
                ما فيه إشعارات. الطلبات والدعوات والرتبة تظهر هنا وتبقى على حسابك.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

export async function loadNotices() {
  return listNotices();
}
