import Sidebar from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#216ad9]">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-[#216ad9]">{children}</main>
    </div>
  );
}