"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addGroupMember,
  createRecipient,
  createRecipientGroup,
  deleteRecipient,
  deleteRecipientGroup,
  listGroupMembers,
  listRecipientGroups,
  listRecipients,
  removeGroupMember,
  type Recipient,
  type RecipientGroup,
  type RecipientInput,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RecipientForm } from "@/app/ui/recipient-form";
import { RecipientGroupForm } from "@/app/ui/recipient-group-form";
import { Icon } from "@/app/ui/icons";
import {
  ConfirmButton,
  Drawer,
  EmptyState,
  LoadingPage,
  Note,
  PageBody,
  PageHeader,
  Skeleton,
  Tabs,
} from "@/app/ui/primitives";
import { useToast } from "@/app/ui/toast";

type Tab = "people" | "groups";

function initials(recipient: Recipient): string {
  const source = recipient.name || recipient.email;
  return source.slice(0, 2).toUpperCase();
}

// GroupMembers manages one group's membership as a set of pills you switch on
// and off. The old select-then-Add pairing meant two interactions per person
// and no view of who was out; a toggle list shows the whole roster and the
// membership at once.
function GroupMembers({
  token,
  group,
  recipients,
}: {
  token: string;
  group: RecipientGroup;
  recipients: Recipient[];
}) {
  const [members, setMembers] = useState<Recipient[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGroupMembers(token, group.id)
      .then(setMembers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load members"));
  }, [token, group.id]);

  async function toggle(recipient: Recipient, isMember: boolean) {
    setError(null);
    setBusyId(recipient.id);
    try {
      if (isMember) {
        await removeGroupMember(token, group.id, recipient.id);
      } else {
        await addGroupMember(token, group.id, recipient.id);
      }
      setMembers(await listGroupMembers(token, group.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update members");
    } finally {
      setBusyId(null);
    }
  }

  if (members === null) {
    return (
      <div className="flex gap-1.5 pt-1">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
    );
  }

  if (recipients.length === 0) {
    return <p className="dw-hint pt-1">Add some recipients first, then pick who belongs here.</p>;
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="dw-hint">Click a name to add or remove them from this group.</p>
      <div className="flex flex-wrap gap-1.5">
        {recipients.map((recipient) => {
          const isMember = members.some((member) => member.id === recipient.id);
          return (
            <button
              key={recipient.id}
              type="button"
              aria-pressed={isMember}
              disabled={busyId === recipient.id}
              onClick={() => toggle(recipient, isMember)}
              title={recipient.email}
              className="dw-toggle"
            >
              {isMember && <Icon.Check size={12} />}
              {recipient.name || recipient.email}
            </button>
          );
        })}
      </div>
      {error && <Note kind="error">{error}</Note>}
    </div>
  );
}

export default function RecipientsPage() {
  const router = useRouter();
  const toast = useToast();
  const { token, logout } = useAuth();
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [groups, setGroups] = useState<RecipientGroup[] | null>(null);
  const [tab, setTab] = useState<Tab>("people");
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Tab | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([listRecipients(token), listRecipientGroups(token)])
      .then(([loadedRecipients, loadedGroups]) => {
        setRecipients(loadedRecipients);
        setGroups(loadedGroups);
      })
      .catch(() => {
        logout();
        router.replace("/login");
      });
  }, [token, router, logout]);

  async function handleCreateRecipient(input: RecipientInput) {
    if (!token) return;
    await createRecipient(token, input);
    setRecipients(await listRecipients(token));
    setDrawer(null);
    toast.ok(`Added ${input.name || input.email}`);
  }

  async function handleDeleteRecipient(recipient: Recipient) {
    if (!token) return;
    setError(null);
    try {
      await deleteRecipient(token, recipient.id);
      setRecipients(await listRecipients(token));
      toast.ok(`Removed ${recipient.name || recipient.email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete recipient");
    }
  }

  async function handleCreateGroup(name: string) {
    if (!token) return;
    await createRecipientGroup(token, name);
    setGroups(await listRecipientGroups(token));
    setDrawer(null);
    toast.ok(`Created ${name}`);
  }

  async function handleDeleteGroup(group: RecipientGroup) {
    if (!token) return;
    setError(null);
    try {
      await deleteRecipientGroup(token, group.id);
      if (expandedGroupId === group.id) setExpandedGroupId(null);
      setGroups(await listRecipientGroups(token));
      toast.ok(`Removed ${group.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete recipient group");
    }
  }

  if (!token || !recipients || !groups) return <LoadingPage />;

  return (
    <>
      <PageHeader
        title="Recipients"
        description="The people your reports go to, and the lists you send to at once."
        action={
          <button type="button" onClick={() => setDrawer(tab)} className="dw-btn dw-btn-primary">
            <Icon.Plus size={15} />
            {tab === "people" ? "New recipient" : "New group"}
          </button>
        }
      />

      <PageBody>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "people", label: "People", count: recipients.length },
            { value: "groups", label: "Groups", count: groups.length },
          ]}
        />

        {error && <Note kind="error">{error}</Note>}

        {tab === "people" &&
          (recipients.length === 0 ? (
            <EmptyState
              icon={<Icon.People size={28} />}
              title="No recipients yet"
              body="Add the people who should receive your reports. You can tag each one with attributes so a single report goes out personalised."
              action={
                <button type="button" onClick={() => setDrawer("people")} className="dw-btn dw-btn-primary">
                  <Icon.Plus size={15} />
                  Add a recipient
                </button>
              }
            />
          ) : (
            <ul className="dw-card dw-in divide-y divide-line">
              {recipients.map((recipient) => (
                <li key={recipient.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-medium text-muted">
                    {initials(recipient)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{recipient.name || recipient.email}</p>
                    {recipient.name && <p className="dw-hint truncate">{recipient.email}</p>}
                  </div>
                  {recipient.attributes && Object.keys(recipient.attributes).length > 0 && (
                    <span className="hidden shrink-0 gap-1 sm:flex">
                      {Object.entries(recipient.attributes)
                        .slice(0, 2)
                        .map(([key, value]) => (
                          <span key={key} className="dw-chip">
                            {key}: {String(value)}
                          </span>
                        ))}
                    </span>
                  )}
                  <ConfirmButton label="Remove" onConfirm={() => handleDeleteRecipient(recipient)} />
                </li>
              ))}
            </ul>
          ))}

        {tab === "groups" &&
          (groups.length === 0 ? (
            <EmptyState
              icon={<Icon.Grid size={28} />}
              title="No groups yet"
              body="A group is a saved list of recipients, so a report can go to everyone on it in one send."
              action={
                <button type="button" onClick={() => setDrawer("groups")} className="dw-btn dw-btn-primary">
                  <Icon.Plus size={15} />
                  Create a group
                </button>
              }
            />
          ) : (
            <ul className="dw-in flex flex-col gap-2">
              {groups.map((group) => {
                const expanded = expandedGroupId === group.id;
                return (
                  <li key={group.id} className="dw-card px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-faint">
                        <Icon.Grid size={16} />
                      </span>
                      <p className="flex-1 truncate text-sm font-medium">{group.name}</p>
                      <button
                        type="button"
                        onClick={() => setExpandedGroupId(expanded ? null : group.id)}
                        className="dw-btn dw-btn-sm dw-btn-quiet"
                      >
                        <span className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}>
                          <Icon.ChevronRight size={13} />
                        </span>
                        Members
                      </button>
                      <ConfirmButton label="Remove" onConfirm={() => handleDeleteGroup(group)} />
                    </div>
                    {expanded && (
                      <div className="dw-in mt-2 border-t border-line pt-2">
                        <GroupMembers token={token} group={group} recipients={recipients} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
      </PageBody>

      <Drawer
        open={drawer === "people"}
        onClose={() => setDrawer(null)}
        title="New recipient"
        description="Someone who should receive your reports."
      >
        <RecipientForm onCreate={handleCreateRecipient} />
      </Drawer>

      <Drawer
        open={drawer === "groups"}
        onClose={() => setDrawer(null)}
        title="New group"
        description="A list you can send one report to at once."
      >
        <RecipientGroupForm onCreate={handleCreateGroup} />
      </Drawer>
    </>
  );
}
