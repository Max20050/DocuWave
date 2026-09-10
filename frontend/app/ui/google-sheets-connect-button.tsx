import { googleSheetsConnectUrl } from "@/lib/api";
import { Icon } from "@/app/ui/icons";

export function GoogleSheetsConnectButton({ token }: { token: string }) {
  return (
    <a href={googleSheetsConnectUrl(token)} className="dw-btn dw-btn-primary w-full">
      <Icon.Sheet size={15} />
      Connect a Google account
    </a>
  );
}
