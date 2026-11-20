import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, HeartHandshake, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { useI18n } from "../../lib/i18n";

const PROMISE_ICONS = [ShieldCheck, LockKeyhole, WalletCards, HeartHandshake] as const;

export default function AboutPage() {
  const { copy } = useI18n();
  const t = copy.about;

  return (
    <div className="mx-auto max-w-5xl reveal-in">
      <section className="card overflow-hidden p-7 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="mb-4 inline-flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--gpt-muted)]">
              <span className="inline-block h-px w-5 bg-[var(--gpt-muted)]" aria-hidden="true" />
              {t.eyebrow}
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold leading-[1.2] tracking-[-0.035em] sm:text-4xl">
              {t.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-[1.85] text-[var(--gpt-muted)]">{t.intro}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {t.chips.map((chip) => (
                <span key={chip} className="chip">
                  <CheckCircle2 size={13} className="text-primary" /> {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--gpt-border)] bg-[var(--gpt-tint)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gpt-muted)]">{t.flowTitle}</p>
            <div className="mt-4 divide-y divide-[var(--gpt-border)]">
              {t.flow.map((item, i) => (
                <div key={item} className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
                  <span className="font-mono text-xs font-medium text-[var(--gpt-muted)]">
                    0{i + 1}
                  </span>
                  <span className="text-sm font-medium text-ink">{item}</span>
                  {i < t.flow.length - 1 && <ArrowRight size={13} className="ml-auto text-[var(--gpt-muted)]" />}
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
            <article key={title} className="card p-6 transition hover:border-[var(--gpt-input)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--gpt-secondary)] text-ink">
                  <Icon size={18} strokeWidth={1.6} />
                </span>
                <span className="font-mono text-xs text-[var(--gpt-muted)]">0{index + 1}</span>
              </div>
              <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
              <p className="mt-2 text-xs leading-[1.85] text-[var(--gpt-muted)]">{text}</p>
            </article>
          );
        })}
      </section>

      <section className="card mt-5 bg-[var(--gpt-tint)] p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[1rem] font-semibold tracking-tight">{t.noteTitle}</p>
            <p className="mt-1.5 max-w-2xl text-xs leading-[1.85] text-[var(--gpt-muted)]">{t.note}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2.5">
            <Link to="/posts" className="btn-ghost !rounded-full !px-5">
              {t.posts}
            </Link>
            <Link to="/" className="btn-primary !rounded-full !px-5">
              {t.store} <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
