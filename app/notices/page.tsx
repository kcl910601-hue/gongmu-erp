const notices = [
  {
    id: 1,
    title: "공지사항 기능 준비 중",
    description: "공무팀 공지와 전달사항을 이곳에서 관리할 예정입니다.",
    date: "2026-07-06",
  },
];

export default function NoticesPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">공지사항</h1>
        <p className="mt-1 text-sm text-slate-500">
          팀 공지, 전달사항, 운영 메모를 확인하는 공간입니다.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">최근 공지</h2>
            <p className="mt-1 text-sm text-slate-500">
              v1.0 기본 골격용 공지 영역입니다.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
            {notices.length}건
          </span>
        </div>

        <div className="space-y-3">
          {notices.map((notice) => (
            <article
              key={notice.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {notice.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {notice.description}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-slate-400">
                  {notice.date}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
