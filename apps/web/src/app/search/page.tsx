import { Search } from "@/components/mm/screens/Search";
import { MobileSearch } from "@/components/mm/mobile/Search";

export default function Page() {
  return (
    <>
      <div className="mm-desktop-only"><Search /></div>
      <div className="mm-mobile-only"><MobileSearch /></div>
    </>
  );
}
