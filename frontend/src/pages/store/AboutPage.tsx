import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, HeartHandshake, LockKeyhole, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { useI18n } from "../../lib/i18n";

const PROMISE_ICONS = [ShieldCheck, LockKeyhole, WalletCards, HeartHandshake] as const;

export default function AboutPage() {
  const { copy } = useI18n();
  const t = copy.about;

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <section className="relative overflow-hidden rounded-[2rem] border border-ink/[0.07] bg-surface px-6 py-8 shadow-soft sm:px-8 sm:py-10 lg:px-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent-soft/80" />
        <div className="pointer-events-none absolute bottom-0 right-10 h-20 w-48 rounded-t-full bg-primary/10" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_270px] lg:items-start">
          <div>
            <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3.5 py-2 text-xs font-bold text-primary">
              <Sparkles size={14} /> {t.eyebrow}
            </span>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
              {t.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink/58">{t.intro}</p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {t.chips.map((chip) => (
                <span key={chip} className="chip bg-surface/80">
                  <CheckCircle2 size={13} className="text-primary" /> {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-ink/[0.06] bg-accent-soft/70 p-5">
            <p className="text-sm font-extrabold text-primary">{t.flowTitle}</p>
            <div className="mt-4 space-y-3">
              {t.flow.map((item, i) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-xs font-extrabold text-primary shadow-sm">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-ink/75">{item}</span>
                  {i < t.flow.length - 1 && <ArrowRight size={13} className="ml-auto text-primary/50" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2">
        {t.promises.map(([title, text], index) => {
          const Icon = PROMISE_ICONS[index] ?? ShieldCheck;
          return (
            <article
              key={title}
              className="card group p-6 transition duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-soft"
              style={{ animationDelay: `${index * 55}ms` }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-primary transition group-hover:bg-primary group-hover:text-primary-contrast">
                  <Icon size={21} />
                </span>
                <span className="h-2 w-10 rounded-full bg-accent-soft transition group-hover:bg-accent" />
              </div>
              <h2 className="font-extrabold tracking-tight">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/55">{text}</p>
            </article>
          );
        })}
      </section>

      <section className="mt-5 overflow-hidden rounded-[2rem] border border-primary/15 bg-primary p-6 text-primary-contrast shadow-xl sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-extrabold">{t.noteTitle}</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-primary-contrast/72">{t.note}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to="/posts" className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-bold transition hover:bg-white/10">
              {t.posts}
            </Link>
            <Link to="/" className="rounded-full bg-surface px-5 py-2.5 text-sm font-bold text-ink transition hover:opacity-90">
              {t.store}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
