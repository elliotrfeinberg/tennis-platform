import { notFound } from "next/navigation";
import { TeamDetail } from "@/components/mm/screens/TeamDetail";
import { teamDetail } from "@/lib/teams";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await teamDetail(id);
  if (!data) notFound();
  return <TeamDetail data={data} />;
}
