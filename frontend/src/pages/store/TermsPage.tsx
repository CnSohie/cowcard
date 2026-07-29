import { Link } from "react-router-dom";
import { FileText, ShieldCheck } from "lucide-react";
import { useI18n } from "../../lib/i18n";

export default function TermsPage() {
  const { copy } = useI18n();
  const t = copy.terms;

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <div className="mb-8">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-primary">
          <FileText size={22} />
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/55">{t.subtitle}</p>
      </div>

      <article className="prose-ka card p-6 sm:p-8">
        {t.sections.map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
      </article>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-accent-soft px-5 py-4 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-primary">
          <ShieldCheck size={16} /> {t.confirm}
        </span>
        <Link to="/" className="btn-primary !px-5 !py-2">{t.backStore}</Link>
      </div>
    </div>
  );
}
