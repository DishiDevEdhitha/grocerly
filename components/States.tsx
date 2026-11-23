import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";

export function Loading({ label = "Loading" }: { label?: string }) {
  return <div role="status" className="flex items-center justify-center gap-3 py-16 text-slate2"><Loader2 className="animate-spin" size={22} />{label}…</div>;
}
export function ErrorBox({ message, action }: { message: string; action?: { label: string; href?: string; onClick?: () => void } }) {
  return (
    <div role="alert" className="card border border-chilli/20 bg-chilli/5">
      <div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-chilli" size={20} /><p className="text-sm">{message}</p></div>
      {action && (action.href ? <Link href={action.href} className="btn-outline mt-3 w-full">{action.label}</Link> : <button onClick={action.onClick} className="btn-outline mt-3 w-full">{action.label}</button>)}
    </div>
  );
}
export function Empty({ title, body, cta }: { title: string; body: string; cta?: { label: string; href: string } }) {
  return (
    <div className="card py-10 text-center"><h2 className="text-lg font-bold">{title}</h2><p className="mx-auto mt-1 max-w-[28ch] text-sm text-slate2">{body}</p>
      {cta && <Link href={cta.href} className="btn-primary mt-5">{cta.label}</Link>}</div>
  );
}
export function PageTitle({ title, sub, back }: { title: string; sub?: string; back?: boolean }) {
  return (
    <header className="mb-4 pt-2">
      {back && <Link href="/" className="mb-1 inline-block text-sm font-semibold text-leaf">Home</Link>}
      <h1 className="text-[28px] font-extrabold leading-tight">{title}</h1>{sub && <p className="mt-1 text-sm text-slate2">{sub}</p>}
    </header>
  );
}
