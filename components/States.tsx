import { AlertTriangle, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export function Loading({ label = "Loading" }: { label?: string }) {
  return <div role="status" className="flex items-center justify-center gap-2 py-14 text-[13px] text-slate2"><Loader2 className="animate-spin" size={16} />{label}…</div>;
}
export function ErrorBox({ message, action }: { message: string; action?: { label: string; href?: string; onClick?: () => void } }) {
  return (
    <div role="alert" className="card border-chilli/20 bg-chilli/5">
      <div className="flex gap-2.5"><AlertTriangle className="mt-0.5 shrink-0 text-chilli" size={16} /><p className="text-[13px]">{message}</p></div>
      {action && (action.href ? <Link href={action.href} className="btn-outline mt-3 w-full">{action.label}</Link> : <button onClick={action.onClick} className="btn-outline mt-3 w-full">{action.label}</button>)}
    </div>
  );
}
export function Empty({ title, body, cta }: { title: string; body: string; cta?: { label: string; href: string } }) {
  return (
    <div className="card py-9 text-center"><h2 className="text-[15px] font-bold">{title}</h2><p className="mx-auto mt-1 max-w-[30ch] text-[13px] text-slate2">{body}</p>
      {cta && <Link href={cta.href} className="btn-primary mt-4">{cta.label}</Link>}</div>
  );
}
export function PageTitle({ title, sub, back }: { title: string; sub?: string; back?: boolean }) {
  return (
    <header className="mb-3 flex items-start gap-2 pt-1">
      {back && <Link href="/" aria-label="Back to home" className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white shadow-sm ring-1 ring-ink/[.06]"><ArrowLeft size={16} /></Link>}
      <div><h1 className="text-[22px] font-extrabold leading-tight">{title}</h1>{sub && <p className="mt-0.5 text-[12.5px] leading-snug text-slate2">{sub}</p>}</div>
    </header>
  );
}
