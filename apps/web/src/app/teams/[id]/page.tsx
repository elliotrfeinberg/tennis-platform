import { notFound } from "next/navigation";
import { TeamDetail } from "@/components/mm/screens/TeamDetail";
import { MobileTeamDetail } from "@/components/mm/mobile/TeamDetail";
import { teamDetail } from "@/lib/teams";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await teamDetail(id);
  if (!data) notFound();
  return (
    <>
      <div className="mm-desktop-only"><TeamDetail data={data} /></div>
      <div className="mm-mobile-only"><MobileTeamDetail data={data} /></div>
    </>
  );
}
