"use client";
import { use } from "react";
import { useSearchParams } from "next/navigation";
import ProductView from "@/components/ProductView";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const via = useSearchParams().get("via") ?? undefined;
  return <ProductView id={id} via={via} />;
}
