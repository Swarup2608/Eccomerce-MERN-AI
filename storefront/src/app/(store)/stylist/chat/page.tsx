import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { StylistShell } from "@/components/stylist-bits";
import { ChatView } from "@/app/(store)/stylist/chat/chat-view";

export const metadata: Metadata = { title: "Chat with the stylist", robots: { index: false } };

export default function StylistChatPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell width="max-w-[1400px]">
        <SignedIn next="/stylist/chat">
          <StylistShell title="Stylist">
            <ChatView />
          </StylistShell>
        </SignedIn>
      </PageShell>
    </div>
  );
}
