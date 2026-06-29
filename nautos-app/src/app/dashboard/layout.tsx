import Sidebar from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1a2e]">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-[#0d1a2e]">{children}</main>
    </div>
  );
}