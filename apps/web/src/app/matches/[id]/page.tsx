import { notFound } from "next/navigation";
import { MatchDetail } from "@/components/mm/screens/MatchDetail";
import { MobileMatchDetail } from "@/components/mm/mobile/MatchDetail";
import { matchDetail } from "@/lib/teams";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await matchDetail(id);
  if (!data) notFound();
  return (
    <>
      <div className="mm-desktop-only"><MatchDetail data={data} /></div>
      <div className="mm-mobile-only"><MobileMatchDetail data={data} /></div>
    </>
  );
}
