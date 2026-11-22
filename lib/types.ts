export type Permissions = { add: boolean; edit: boolean; remove: boolean };
export type User = { id: string; email: string };
export type Scope = "list" | "folder";
export type Folder = { id: string; name: string; owner: boolean };
export type GroceryList = { id: string; name: string; folderId: string | null; shared?: boolean; owner: boolean; permissions: Permissions };
export type Item = { id: string; listId: string; name: string; quantity: string; note: string; checked: boolean; purchasedBy?: string };
export type Dashboard = { user: User; folders: Folder[]; lists: GroceryList[]; items: Item[] };
export const noPermissions: Permissions = { add: false, edit: false, remove: false };
