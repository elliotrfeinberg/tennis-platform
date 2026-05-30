import { notFound } from "next/navigation";
import { MatchDetail } from "@/components/mm/screens/MatchDetail";
import { matchDetail } from "@/lib/teams";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await matchDetail(id);
  if (!data) notFound();
  return <MatchDetail data={data} />;
}
